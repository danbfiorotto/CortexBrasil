from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from backend.core.auth import get_current_user
from backend.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from backend.analytics.forecasting import project_balance, get_monthly_cashflow
from backend.simulators.what_if import simulate_scenario
from backend.workers.anomaly_detector import detect_anomalies
from backend.integrations.market_scrapers import get_user_portfolio_value, update_market_data
import logging

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

    # Insert or update asset
    await db.execute(
        text("""
            INSERT INTO assets (user_phone, ticker, name, type, quantity, avg_price)
            VALUES (:phone, :ticker, :name, :type, :qty, :price)
            ON CONFLICT (id) DO NOTHING
        """),
        {
            "phone": current_user_phone,
            "ticker": req.ticker.upper(),
            "name": req.name or req.ticker.upper(),
            "type": req.type,
            "qty": req.quantity,
            "price": req.avg_price,
        }
    )
    await db.commit()

    # Trigger price update for this ticker
    try:
        await update_market_data([req.ticker.upper()])
    except Exception as e:
        logger.warning(f"Could not fetch price for {req.ticker}: {e}")

    return {"status": "ok", "message": f"Ativo {req.ticker.upper()} adicionado."}
