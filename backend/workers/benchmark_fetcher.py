"""
Benchmark Fetcher
Fetches historical data for IBOV, SP500, and CDI and stores in benchmark_history.
Run daily; only inserts missing dates (idempotent).
"""
import logging
from datetime import date, timedelta
from sqlalchemy import text
from backend.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

TWO_YEARS_AGO = date.today() - timedelta(days=730)


async def _fetch_yfinance_history(symbol: str, start: date) -> list[tuple[date, float]]:
    """Returns list of (date, close_value) for a yfinance symbol."""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=start.isoformat(), auto_adjust=True)
        if hist.empty:
            return []
        return [
            (d.date(), float(close))
            for d, close in zip(hist.index, hist["Close"])
            if close > 0
        ]
    except Exception as e:
        logger.warning(f"yfinance history failed for {symbol}: {e}")
        return []


async def _fetch_cdi_history(start: date) -> list[tuple[date, float]]:
    """
    Fetches CDI daily rates from BCB SGS (série 12) and accumulates from base 100.
    """
    try:
        import httpx
        from_str = start.strftime("%d/%m/%Y")
        to_str = date.today().strftime("%d/%m/%Y")
        url = (
            f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados"
            f"?formato=json&dataInicial={from_str}&dataFinal={to_str}"
        )
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return []
        entries = r.json()
        if not entries:
            return []

        result = []
        accumulated = 100.0
        for entry in entries:
            try:
                d = date(
                    int(entry["data"][6:10]),
                    int(entry["data"][3:5]),
                    int(entry["data"][0:2]),
                )
                daily_rate = float(entry["valor"]) / 100
                accumulated *= (1 + daily_rate)
                result.append((d, round(accumulated, 6)))
            except Exception:
                continue
        return result
    except Exception as e:
        logger.warning(f"CDI fetch failed: {e}")
        return []


async def _get_existing_dates(session, benchmark: str) -> set[date]:
    result = await session.execute(
        text("SELECT snapshot_date FROM benchmark_history WHERE benchmark = :b"),
        {"b": benchmark},
    )
    return {row[0] for row in result.fetchall()}


async def _upsert_series(session, benchmark: str, series: list[tuple[date, float]]):
    existing = await _get_existing_dates(session, benchmark)
    new_rows = [(d, v) for d, v in series if d not in existing]
    if not new_rows:
        logger.info(f"No new dates for {benchmark}")
        return
    for d, v in new_rows:
        await session.execute(
            text("""
                INSERT INTO benchmark_history (benchmark, snapshot_date, close_value)
                VALUES (:b, :d, :v)
                ON CONFLICT (benchmark, snapshot_date) DO NOTHING
            """),
            {"b": benchmark, "d": d, "v": v},
        )
    logger.info(f"Inserted {len(new_rows)} rows for {benchmark}")


async def fetch_all_benchmarks():
    """Fetches IBOV, SP500, and CDI data and stores missing dates."""
    async with AsyncSessionLocal() as session:
        # IBOV
        ibov = await _fetch_yfinance_history("^BVSP", TWO_YEARS_AGO)
        await _upsert_series(session, "IBOV", ibov)

        # SP500
        sp500 = await _fetch_yfinance_history("^GSPC", TWO_YEARS_AGO)
        await _upsert_series(session, "SP500", sp500)

        # CDI
        cdi = await _fetch_cdi_history(TWO_YEARS_AGO)
        await _upsert_series(session, "CDI", cdi)

        await session.commit()
    logger.info("Benchmark fetch complete")
