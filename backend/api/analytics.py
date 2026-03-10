from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from backend.core.auth import get_current_user
from backend.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from backend.analytics.forecasting import project_balance, get_monthly_cashflow
from backend.simulators.what_if import simulate_scenario
from backend.workers.anomaly_detector import detect_anomalies
from backend.integrations.market_scrapers import get_user_portfolio_value, update_market_data, search_ticker, _normalize_crypto_ticker
from backend.workers.investment_snapshotter import take_daily_snapshot
import logging
import asyncio

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])
logger = logging.getLogger(__name__)


class ScenarioRequest(BaseModel):
    description: str = Field(..., min_length=1)
    total_amount: float = Field(..., gt=0)
    installments: int = Field(default=1, ge=1, le=360)


class AssetAddRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    name: str = Field(default="")
    type: str = Field(..., pattern="^(STOCK|FII|CRYPTO|FIXED_INCOME)$")
    quantity: float = Field(..., gt=0)
    avg_price: float = Field(..., gt=0)
    purchased_at: str = Field(default="")  # ISO date string, e.g. "2024-01-15"
    currency: str = Field(default="BRL", pattern="^(BRL|USD)$")  # currency of avg_price


class AssetSellRequest(BaseModel):
    quantity: float = Field(..., gt=0)
    sale_price: float = Field(..., gt=0)
    account_id: str = Field(default="")  # optional: deposit proceeds to this account


@router.get("/forecast")
async def get_forecast(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Projects future balance using historical data."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )
    result = await project_balance(current_user_phone, months_ahead=6)
    return result


@router.get("/cashflow")
async def get_cashflow(
    months: int = 6,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns monthly income/expense breakdown."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )
    return await get_monthly_cashflow(current_user_phone, months=months)


@router.post("/simulate")
async def post_simulate(
    req: ScenarioRequest,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Simulates a What-If financial scenario."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )
    return await simulate_scenario(
        user_phone=current_user_phone,
        description=req.description,
        total_amount=req.total_amount,
        installments=req.installments,
    )


@router.get("/anomalies")
async def get_anomalies(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Scans for spending anomalies in recurring categories."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )
    return await detect_anomalies(current_user_phone)


@router.get("/investments/search")
async def search_ticker_endpoint(
    q: str,
    current_user_phone: str = Depends(get_current_user),
):
    """
    Validates a ticker and returns name + current price.
    Used for live search while the user types in the form.
    """
    if not q or len(q.strip()) < 1:
        raise HTTPException(status_code=400, detail="Query too short")
    result = await search_ticker(q.strip().upper())
    if not result:
        raise HTTPException(status_code=404, detail="Ticker não encontrado em nenhuma bolsa")
    return result


@router.get("/investments/suggest")
async def suggest_tickers_endpoint(
    q: str,
    current_user_phone: str = Depends(get_current_user),
):
    """
    Returns a list of ticker suggestions based on a query.
    Used for autocomplete.
    """
    if not q or len(q.strip()) < 2:
        return []
    from backend.integrations.market_scrapers import suggest_tickers
    return await suggest_tickers(q.strip().upper())


@router.get("/investments")
async def get_investments(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns portfolio summary with current market values."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )
    return await get_user_portfolio_value(current_user_phone)


@router.post("/investments/add")
async def add_asset(
    req: AssetAddRequest,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Adds a new asset to the user's portfolio."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )

    from datetime import date as date_type
    purchased_at = None
    if req.purchased_at:
        try:
            purchased_at = date_type.fromisoformat(req.purchased_at)
        except ValueError:
            purchased_at = None

    # Convert avg_price from USD to BRL if needed (so all stored prices are in BRL)
    avg_price = req.avg_price
    if req.currency == "USD":
        from backend.integrations.market_scrapers import _fetch_yfinance
        usd_brl = await _fetch_yfinance("BRL=X") or 5.0
        avg_price = round(avg_price * usd_brl, 4)
        logger.info(f"Converted avg_price {req.avg_price} USD → {avg_price} BRL (rate: {usd_brl})")

    # For crypto, strip suffixes like -USD/-USDT so the ticker stored matches market_data keys
    clean_ticker = req.ticker.upper()
    if req.type == "CRYPTO":
        clean_ticker = _normalize_crypto_ticker(clean_ticker)

    # Check if user already holds this ticker — if so, merge (weighted avg price + sum qty)
    existing = (await db.execute(
        text("SELECT id, quantity, avg_price FROM assets WHERE user_phone = :phone AND ticker = :ticker"),
        {"phone": current_user_phone, "ticker": clean_ticker}
    )).fetchone()

    if existing:
        existing_id, existing_qty, existing_price = existing
        existing_qty = float(existing_qty)
        existing_price = float(existing_price)
        new_qty = existing_qty + req.quantity
        new_avg_price = (existing_qty * existing_price + req.quantity * avg_price) / new_qty
        await db.execute(
            text("UPDATE assets SET quantity = :qty, avg_price = :price WHERE id = :id"),
            {"qty": new_qty, "price": new_avg_price, "id": existing_id}
        )
        message = f"Ativo {clean_ticker} atualizado: quantidade {new_qty:.4f}, PM R$ {new_avg_price:.4f}."
    else:
        await db.execute(
            text("""
                INSERT INTO assets (id, user_phone, ticker, name, type, quantity, avg_price, purchased_at)
                VALUES (gen_random_uuid(), :phone, :ticker, :name, :type, :qty, :price, :purchased_at)
            """),
            {
                "phone": current_user_phone,
                "ticker": clean_ticker,
                "name": req.name or clean_ticker,
                "type": req.type,
                "qty": req.quantity,
                "price": avg_price,
                "purchased_at": purchased_at or date_type.today(),
            }
        )
        message = f"Ativo {clean_ticker} adicionado."

    await db.commit()

    # Trigger price update for this ticker (pass type for better source selection)
    try:
        await update_market_data([clean_ticker], {clean_ticker: req.type})
    except Exception as e:
        logger.warning(f"Could not fetch price for {req.ticker}: {e}")

    asyncio.create_task(take_daily_snapshot(current_user_phone))

    return {"status": "ok", "message": message}


@router.delete("/investments/{asset_id}")
async def delete_asset(
    asset_id: str,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Removes an asset entry entirely (correcting a wrong entry)."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )
    try:
        result = await db.execute(
            text("DELETE FROM assets WHERE id = :id AND user_phone = :phone RETURNING id"),
            {"id": asset_id, "phone": current_user_phone}
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Ativo não encontrado")
        await db.commit()
        asyncio.create_task(take_daily_snapshot(current_user_phone))
        return {"status": "ok", "message": "Ativo removido."}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in delete_asset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao remover ativo: {str(e)}")


@router.post("/investments/{asset_id}/sell")
async def sell_asset(
    asset_id: str,
    req: AssetSellRequest,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Registers the sale of an asset: reduces quantity and optionally deposits proceeds."""
    try:
        await db.execute(
            text("SELECT set_config('app.current_user_phone', :phone, true)"),
            {"phone": current_user_phone}
        )

        # Fetch current asset (bypass RLS with explicit user_phone filter)
        result = await db.execute(
            text("SELECT ticker, name, quantity FROM assets WHERE id = :id AND user_phone = :phone"),
            {"id": asset_id, "phone": current_user_phone}
        )
        asset = result.fetchone()
        if not asset:
            raise HTTPException(status_code=404, detail="Ativo não encontrado")

        if req.quantity > float(asset.quantity):
            raise HTTPException(status_code=400, detail=f"Quantidade a vender ({req.quantity}) maior que a posição atual ({asset.quantity})")

        new_qty = float(asset.quantity) - req.quantity
        total_proceeds = req.quantity * req.sale_price

        if new_qty <= 0:
            await db.execute(
                text("DELETE FROM assets WHERE id = :id AND user_phone = :phone"),
                {"id": asset_id, "phone": current_user_phone}
            )
        else:
            await db.execute(
                text("UPDATE assets SET quantity = :qty, updated_at = NOW() WHERE id = :id AND user_phone = :phone"),
                {"qty": new_qty, "id": asset_id, "phone": current_user_phone}
            )

        # Deposit proceeds to account if specified
        if req.account_id:
            acc_result = await db.execute(
                text("SELECT id FROM accounts WHERE id = :id AND user_phone = :phone"),
                {"id": req.account_id, "phone": current_user_phone}
            )
            account = acc_result.fetchone()
            if not account:
                raise HTTPException(status_code=404, detail="Conta de destino não encontrada")

            await db.execute(
                text("""
                    INSERT INTO transactions (id, user_phone, account_id, type, amount, category, description, date)
                    VALUES (gen_random_uuid(), :phone, :acc_id, 'INCOME', :amount, 'Investimentos', :desc, NOW())
                """),
                {
                    "phone": current_user_phone,
                    "acc_id": req.account_id,
                    "amount": total_proceeds,
                    "desc": f"Venda {asset.ticker} - {req.quantity} unid. a {req.sale_price}",
                }
            )

        await db.commit()
        asyncio.create_task(take_daily_snapshot(current_user_phone))

        msg = f"Venda de {req.quantity} {asset.ticker} registrada."
        if req.account_id:
            msg += f" Valor de R$ {total_proceeds:,.2f} creditado na conta."
        return {"status": "ok", "message": msg, "proceeds": total_proceeds}

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in sell_asset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao registrar venda: {str(e)}")


@router.get("/investments/performance")
async def get_investments_performance(
    period: str = "1y",
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns normalized performance series (% return from period start) for
    portfolio vs IBOV, CDI, SP500.
    period: 1m | 3m | 6m | 1y | all
    """
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )

    period_days = {"1m": 30, "3m": 90, "6m": 180, "1y": 365, "all": 36500}
    days = period_days.get(period, 365)

    # Portfolio snapshots
    port_result = await db.execute(
        text("""
            SELECT snapshot_date, total_value
            FROM investment_snapshots
            WHERE user_phone = :phone
              AND snapshot_date >= CURRENT_DATE - INTERVAL '1 day' * :days
            ORDER BY snapshot_date
        """),
        {"phone": current_user_phone, "days": days}
    )
    port_rows = port_result.fetchall()

    if not port_rows:
        return {"series": {}, "empty": True, "message": "Dados de performance estarão disponíveis após alguns dias de uso."}

    # Benchmark history
    bench_result = await db.execute(
        text("""
            SELECT benchmark, snapshot_date, close_value
            FROM benchmark_history
            WHERE snapshot_date >= CURRENT_DATE - INTERVAL '1 day' * :days
            ORDER BY snapshot_date
        """),
        {"days": days}
    )
    bench_rows = bench_result.fetchall()

    def normalize(series: list[tuple]) -> list[dict]:
        """Normalizes a (date, value) series to % return from first point."""
        if not series:
            return []
        base = series[0][1]
        if not base:
            return []
        return [
            {"date": str(d), "value": round(((v / base) - 1) * 100, 4)}
            for d, v in series
        ]

    portfolio_series = [(r.snapshot_date, float(r.total_value)) for r in port_rows]

    bench_by_name: dict[str, list[tuple]] = {}
    for row in bench_rows:
        bench_by_name.setdefault(row.benchmark, []).append(
            (row.snapshot_date, float(row.close_value))
        )

    series: dict[str, list] = {}
    series["portfolio"] = normalize(portfolio_series)
    for name, rows in bench_by_name.items():
        series[name] = normalize(rows)

    return {"series": series, "empty": False, "period": period}
