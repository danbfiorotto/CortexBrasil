"""
Anomaly Detection Worker
Periodically scans recurring expenses and alerts via WhatsApp
when a value exceeds the historical average by 2+ standard deviations.
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.session import AsyncSessionLocal
import statistics

logger = logging.getLogger(__name__)

# Recurring categories to monitor
RECURRING_CATEGORIES = [
    "Luz", "Energia", "Internet", "Telefone", "Aluguel",
    "Água", "Gás", "Academia", "Streaming", "Assinatura",
    "Celular", "Condomínio", "Plano de Saúde",
]


async def detect_anomalies(user_phone: str) -> list[dict]:
    """
    Analyzes the last 3 months of recurring expenses
    and flags any that exceed mean + 2*std_dev.
    """
    alerts = []

    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SELECT set_config('app.current_user_phone', :phone, false)"),
            {"phone": user_phone}
        )

        three_months_ago = datetime.now() - timedelta(days=90)

        for category in RECURRING_CATEGORIES:
            result = await session.execute(
                text("""
                    SELECT amount, date FROM transactions
                    WHERE user_phone = :phone
                    AND LOWER(category) = LOWER(:cat)
                    AND type = 'EXPENSE'
                    AND date >= :start_date
                    ORDER BY date DESC
                """),
                {"phone": user_phone, "cat": category, "start_date": three_months_ago}
            )
            rows = result.fetchall()

            if len(rows) < 3:
                continue

            amounts = [float(row.amount) for row in rows]
            latest = amounts[0]
            historical = amounts[1:]

            mean = statistics.mean(historical)
            std_dev = statistics.stdev(historical) if len(historical) > 1 else 0

            threshold = mean + (2 * std_dev)

            if latest > threshold and std_dev > 0:
                pct_increase = ((latest - mean) / mean) * 100
                alerts.append({
                    "category": category,
                    "latest_value": latest,
                    "average": round(mean, 2),
                    "threshold": round(threshold, 2),
                    "increase_pct": round(pct_increase, 1),
                    "message": (
                        f"⚠️ Alerta: Sua conta de {category} veio R$ {latest:.2f}, "
                        f"que é {pct_increase:.0f}% acima da média (R$ {mean:.2f}). "
                        f"Vale conferir a fatura."
                    )
                })

    return alerts


async def run_anomaly_scan_for_all_users():
    """
    Batch job: Scans all active users for anomalies.
    Should be triggered by a scheduler (APScheduler/Celery).
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT DISTINCT user_phone FROM transactions")
        )
        phones = [row[0] for row in result.fetchall()]

    all_alerts = {}
    for phone in phones:
        try:
            alerts = await detect_anomalies(phone)
            if alerts:
                all_alerts[phone] = alerts
                logger.info(f"🔔 {len(alerts)} anomalies detected for {phone}")
        except Exception as e:
            logger.error(f"Error scanning {phone}: {e}")

    return all_alerts
