"""
Market Data Scraper (Privacy-First)
Fetches ONLY public prices from APIs. Quantities are stored locally.
External APIs never know the user's position size.
"""
import logging
from datetime import datetime
from sqlalchemy import text
from backend.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def fetch_stock_price(ticker: str) -> dict | None:
    """
    Fetches current price for a Brazilian or US stock.
    Uses yfinance (runs on CPU, no GPU needed).
    Privacy: Only the ticker is sent externally. Position size stays local.
    """
    try:
        import yfinance as yf

        # Handle Brazilian tickers (append .SA for B3)
        yf_ticker = ticker
        if not any(ticker.endswith(suffix) for suffix in ['.SA', '.US', '.', '=']):
            yf_ticker = f"{ticker}.SA"

        stock = yf.Ticker(yf_ticker)
        info = stock.fast_info

        price = getattr(info, 'last_price', None) or getattr(info, 'previous_close', None)

        if price is None:
            logger.warning(f"Could not fetch price for {ticker}")
            return None

        return {
            "ticker": ticker,
            "price": round(float(price), 4),
            "change_pct": None,
            "last_updated": datetime.now().isoformat(),
        }
    except ImportError:
        logger.error("yfinance not installed. Run: pip install yfinance")
        return None
    except Exception as e:
        logger.error(f"Error fetching {ticker}: {e}")
        return None


async def update_market_data(tickers: list[str]):
    """
    Batch updates market_data table with current prices.
    """
    async with AsyncSessionLocal() as session:
        for ticker in tickers:
            data = await fetch_stock_price(ticker)
            if data:
                await session.execute(
                    text("""
                        INSERT INTO market_data (ticker, price, change_pct, last_updated)
                        VALUES (:ticker, :price, :change_pct, NOW())
                        ON CONFLICT (ticker) DO UPDATE SET
                            price = :price,
                            change_pct = :change_pct,
                            last_updated = NOW()
                    """),
                    {
                        "ticker": data["ticker"],
                        "price": data["price"],
                        "change_pct": data.get("change_pct"),
                    }
                )
        await session.commit()
        logger.info(f"Updated market data for {len(tickers)} tickers")


async def get_user_portfolio_value(user_phone: str) -> dict:
    """
    Calculates total portfolio value by multiplying local quantities
    by public prices. The multiplication happens LOCALLY.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SELECT set_config('app.current_user_phone', :phone, false)"),
            {"phone": user_phone}
        )

        result = await session.execute(
            text("""
                SELECT a.ticker, a.name, a.type, a.quantity, a.avg_price,
                       COALESCE(m.price, 0) as current_price,
                       m.change_pct
                FROM assets a
                LEFT JOIN market_data m ON a.ticker = m.ticker
                WHERE a.user_phone = :phone
            """),
            {"phone": user_phone}
        )

        rows = result.fetchall()
        holdings = []
        total_value = 0
        total_cost = 0

        for row in rows:
            current_value = float(row.quantity) * float(row.current_price)
            cost_basis = float(row.quantity) * float(row.avg_price)
            gain_loss = current_value - cost_basis
            gain_pct = ((current_value / cost_basis) - 1) * 100 if cost_basis > 0 else 0

            total_value += current_value
            total_cost += cost_basis

            holdings.append({
                "ticker": row.ticker,
                "name": row.name,
                "type": row.type,
                "quantity": float(row.quantity),
                "avg_price": float(row.avg_price),
                "current_price": float(row.current_price),
                "current_value": round(current_value, 2),
                "gain_loss": round(gain_loss, 2),
                "gain_pct": round(gain_pct, 2),
                "change_pct": float(row.change_pct) if row.change_pct else None,
            })

        total_gain = total_value - total_cost
        total_gain_pct = ((total_value / total_cost) - 1) * 100 if total_cost > 0 else 0

        return {
            "holdings": holdings,
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain": round(total_gain, 2),
            "total_gain_pct": round(total_gain_pct, 2),
        }
