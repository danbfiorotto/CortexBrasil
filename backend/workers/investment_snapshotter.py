"""
Investment Snapshotter
Takes a daily portfolio snapshot for a user and stores it in investment_snapshots.
Called after any add/sell/delete asset operation, and can be scheduled daily.
"""
import logging
from sqlalchemy import text
from backend.db.session import AsyncSessionLocal
from backend.integrations.market_scrapers import get_user_portfolio_value

logger = logging.getLogger(__name__)


async def take_daily_snapshot(user_phone: str) -> bool:
    """
    Calculates current portfolio value and upserts today's snapshot.
    Returns True on success.
    """
    try:
        portfolio = await get_user_portfolio_value(user_phone)

        stocks_value = sum(
            h["current_value"] for h in portfolio["holdings"] if h["type"] == "STOCK"
        )
        fii_value = sum(
            h["current_value"] for h in portfolio["holdings"] if h["type"] == "FII"
        )
        crypto_value = sum(
            h["current_value"] for h in portfolio["holdings"] if h["type"] == "CRYPTO"
        )
        fixed_income_value = sum(
            h["current_value"] for h in portfolio["holdings"] if h["type"] == "FIXED_INCOME"
        )

        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO investment_snapshots
                        (user_phone, snapshot_date, total_value, total_cost,
                         stocks_value, fii_value, crypto_value, fixed_income_value)
                    VALUES
                        (:phone, CURRENT_DATE, :total_value, :total_cost,
                         :stocks_value, :fii_value, :crypto_value, :fixed_income_value)
                    ON CONFLICT (user_phone, snapshot_date) DO UPDATE SET
                        total_value = :total_value,
                        total_cost = :total_cost,
                        stocks_value = :stocks_value,
                        fii_value = :fii_value,
                        crypto_value = :crypto_value,
                        fixed_income_value = :fixed_income_value
                """),
                {
                    "phone": user_phone,
                    "total_value": portfolio["total_value"],
                    "total_cost": portfolio["total_cost"],
                    "stocks_value": round(stocks_value, 2),
                    "fii_value": round(fii_value, 2),
                    "crypto_value": round(crypto_value, 2),
                    "fixed_income_value": round(fixed_income_value, 2),
                },
            )
            await session.commit()

        logger.info(f"Snapshot saved for {user_phone}: R${portfolio['total_value']:,.2f}")
        return True

    except Exception as e:
        logger.error(f"Failed to take snapshot for {user_phone}: {e}", exc_info=True)
        return False
