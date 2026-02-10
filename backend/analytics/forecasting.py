"""
Financial Forecasting Module
Projects future balance using linear regression on historical data.
Runs on CPU to preserve GPU for LLM inference.
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def get_monthly_cashflow(user_phone: str, months: int = 6) -> list[dict]:
    """
    Returns monthly income/expense totals for the last N months.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SELECT set_config('app.current_user_phone', :phone, false)"),
            {"phone": user_phone}
        )

        start_date = datetime.now() - timedelta(days=months * 30)

        result = await session.execute(
            text("""
                SELECT
                    TO_CHAR(date, 'YYYY-MM') as month,
                    SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expenses
                FROM transactions
                WHERE user_phone = :phone AND date >= :start
                GROUP BY TO_CHAR(date, 'YYYY-MM')
                ORDER BY month
            """),
            {"phone": user_phone, "start": start_date}
        )

        rows = result.fetchall()
        return [
            {
                "month": row.month,
                "income": float(row.income or 0),
                "expenses": float(row.expenses or 0),
                "net": float((row.income or 0) - (row.expenses or 0)),
            }
            for row in rows
        ]


async def project_balance(user_phone: str, months_ahead: int = 3) -> dict:
    """
    Projects the future balance using simple linear extrapolation.
    Uses average monthly net (Income - Expenses) to project forward.
    """
    cashflow = await get_monthly_cashflow(user_phone, months=6)

    if len(cashflow) < 2:
        return {
            "status": "insufficient_data",
            "message": "Preciso de pelo menos 2 meses de dados para projetar.",
            "projections": []
        }

    # Calculate average monthly net cashflow
    nets = [m["net"] for m in cashflow]
    avg_income = sum(m["income"] for m in cashflow) / len(cashflow)
    avg_expense = sum(m["expenses"] for m in cashflow) / len(cashflow)
    avg_net = sum(nets) / len(nets)

    # Get current balance from accounts
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SELECT set_config('app.current_user_phone', :phone, false)"),
            {"phone": user_phone}
        )
        result = await session.execute(
            text("SELECT COALESCE(SUM(current_balance), 0) FROM accounts WHERE user_phone = :phone"),
            {"phone": user_phone}
        )
        current_balance = float(result.scalar() or 0)

    # Project forward
    projections = []
    running_balance = current_balance

    for i in range(1, months_ahead + 1):
        running_balance += avg_net
        future_date = datetime.now() + timedelta(days=30 * i)
        projections.append({
            "month": future_date.strftime("%Y-%m"),
            "projected_balance": round(running_balance, 2),
            "is_negative": running_balance < 0,
        })

    return {
        "status": "ok",
        "current_balance": current_balance,
        "avg_income": round(avg_income, 2),
        "avg_expense": round(avg_expense, 2),
        "avg_net": round(avg_net, 2),
        "projections": projections,
        "risk": "HIGH" if any(p["is_negative"] for p in projections) else "LOW",
    }
