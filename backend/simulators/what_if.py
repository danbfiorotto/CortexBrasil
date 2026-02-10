"""
What-If Scenario Simulator
Simulates the financial impact of hypothetical decisions
(e.g., buying a car on installments) on future cash flow.
"""
import logging
from datetime import datetime, timedelta
from backend.analytics.forecasting import get_monthly_cashflow
from backend.db.session import AsyncSessionLocal
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def simulate_scenario(
    user_phone: str,
    description: str,
    total_amount: float,
    installments: int = 1,
    months_to_project: int = 0,
) -> dict:
    """
    Simulates a purchase/expense scenario and projects future balance.

    Args:
        user_phone: User identifier
        description: What the user wants to buy
        total_amount: Total cost
        installments: Number of monthly installments (1 = à vista)
        months_to_project: Months to project (defaults to installments + 3)
    """
    if months_to_project == 0:
        months_to_project = max(installments + 3, 6)

    monthly_payment = total_amount / installments

    # Get historical cashflow
    cashflow = await get_monthly_cashflow(user_phone, months=6)

    if len(cashflow) < 2:
        return {
            "status": "insufficient_data",
            "message": "Preciso de mais dados financeiros para simular cenários."
        }

    avg_income = sum(m["income"] for m in cashflow) / len(cashflow)
    avg_expense = sum(m["expenses"] for m in cashflow) / len(cashflow)

    # Get current balance
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

    # Project WITHOUT the purchase
    baseline = []
    balance_without = current_balance
    for i in range(1, months_to_project + 1):
        balance_without += (avg_income - avg_expense)
        future_date = datetime.now() + timedelta(days=30 * i)
        baseline.append({
            "month": future_date.strftime("%Y-%m"),
            "balance": round(balance_without, 2),
        })

    # Project WITH the purchase
    with_purchase = []
    balance_with = current_balance
    goes_negative = False
    negative_month = None

    for i in range(1, months_to_project + 1):
        extra_cost = monthly_payment if i <= installments else 0
        balance_with += (avg_income - avg_expense - extra_cost)
        future_date = datetime.now() + timedelta(days=30 * i)

        if balance_with < 0 and not goes_negative:
            goes_negative = True
            negative_month = future_date.strftime("%Y-%m")

        with_purchase.append({
            "month": future_date.strftime("%Y-%m"),
            "balance": round(balance_with, 2),
        })

    # Generate verdict
    is_safe = not goes_negative
    if is_safe:
        verdict = (
            f"✅ Cenário SEGURO: Se comprar {description} por R$ {total_amount:.2f} "
            f"em {installments}x de R$ {monthly_payment:.2f}, seu saldo projetado "
            f"nunca ficará negativo."
        )
    else:
        verdict = (
            f"⚠️ Cenário ARRISCADO: Se comprar {description} por R$ {total_amount:.2f} "
            f"em {installments}x de R$ {monthly_payment:.2f}, seu saldo ficaria "
            f"negativo em {negative_month}."
        )

    return {
        "status": "ok",
        "description": description,
        "total_amount": total_amount,
        "installments": installments,
        "monthly_payment": round(monthly_payment, 2),
        "is_safe": is_safe,
        "negative_month": negative_month,
        "verdict": verdict,
        "baseline_projection": baseline,
        "scenario_projection": with_purchase,
    }
