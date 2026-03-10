"""
Symbol Cache — Redis-backed local index for fast ticker autocomplete.

Strategy:
  - Three lists are cached in Redis with 24h TTL:
      symbol_cache:binance   → all USDT trading pairs on Binance  (~500 symbols)
      symbol_cache:coingecko → top CoinGecko coins with full names (~13k coins)
      symbol_cache:brapi     → all B3 tickers from Brapi          (~500 tickers)
  - Each list is stored as a Redis JSON string (single key, full list).
  - On cache hit, filtering is done in-process (pure Python, < 1ms).
  - On cache miss, the remote API is called once, result stored for 24h.
  - warm_up_caches() is called at app startup to pre-populate all three.
"""
import json
import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

TTL_24H = 86_400  # seconds

BINANCE_KEY   = "symbol_cache:binance"
COINGECKO_KEY = "symbol_cache:coingecko"
BRAPI_KEY     = "symbol_cache:brapi"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_redis():
    from backend.core.clients import redis_client
    return redis_client


async def _cache_get(key: str) -> list | None:
    redis = _get_redis()
    if not redis:
        return None
    try:
        raw = await redis.get(key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.debug(f"Cache GET failed [{key}]: {e}")
        return None


async def _cache_set(key: str, data: list) -> None:
    redis = _get_redis()
    if not redis:
        return
    try:
        await redis.set(key, json.dumps(data), ex=TTL_24H)
    except Exception as e:
        logger.debug(f"Cache SET failed [{key}]: {e}")


# ---------------------------------------------------------------------------
# Fetchers (call remote API and store in cache)
# ---------------------------------------------------------------------------

async def _fetch_and_cache_binance() -> list[dict]:
    """Downloads all USDT trading pairs from Binance and caches them."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://api.binance.com/api/v3/exchangeInfo")
        if r.status_code != 200:
            return []
        symbols = []
        for s in r.json().get("symbols", []):
            if s.get("quoteAsset") != "USDT" or s.get("status") != "TRADING":
                continue
            base = s.get("baseAsset", "")
            if base:
                symbols.append({"ticker": base, "name": base, "exchange": "Binance", "type": "CRYPTOCURRENCY"})
        await _cache_set(BINANCE_KEY, symbols)
        logger.info(f"Symbol cache: Binance populated ({len(symbols)} symbols)")
        return symbols
    except Exception as e:
        logger.warning(f"Symbol cache: Binance fetch failed: {e}")
        return []


async def _fetch_and_cache_coingecko() -> list[dict]:
    """Downloads the full CoinGecko coins list and caches it."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get("https://api.coingecko.com/api/v3/coins/list")
        if r.status_code != 200:
            return []
        coins = []
        for c in r.json():
            symbol = c.get("symbol", "").upper()
            name   = c.get("name", "")
            cg_id  = c.get("id", "")
            if symbol and name:
                coins.append({"ticker": symbol, "name": name, "cg_id": cg_id, "exchange": "CoinGecko", "type": "CRYPTOCURRENCY"})
        await _cache_set(COINGECKO_KEY, coins)
        logger.info(f"Symbol cache: CoinGecko populated ({len(coins)} coins)")
        return coins
    except Exception as e:
        logger.warning(f"Symbol cache: CoinGecko fetch failed: {e}")
        return []


async def _fetch_and_cache_brapi() -> list[dict]:
    """Downloads all available B3 tickers from Brapi and caches them."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://brapi.dev/api/available")
        if r.status_code != 200:
            return []
        tickers = []
        for t in r.json().get("stocks", []):
            if isinstance(t, str) and t:
                tickers.append({"ticker": t, "name": t, "exchange": "B3", "type": "STOCK"})
        await _cache_set(BRAPI_KEY, tickers)
        logger.info(f"Symbol cache: Brapi B3 populated ({len(tickers)} tickers)")
        return tickers
    except Exception as e:
        logger.warning(f"Symbol cache: Brapi fetch failed: {e}")
        return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def warm_up_caches() -> None:
    """Pre-populates all symbol caches on app startup. Runs in background."""
    logger.info("Symbol cache: starting warm-up...")
    await asyncio.gather(
        _fetch_and_cache_binance(),
        _fetch_and_cache_coingecko(),
        _fetch_and_cache_brapi(),
        return_exceptions=True,
    )
    logger.info("Symbol cache: warm-up complete")


async def search_binance(query: str, limit: int = 5) -> list[dict]:
    """Returns Binance symbols matching query prefix, using Redis cache."""
    data = await _cache_get(BINANCE_KEY)
    if data is None:
        data = await _fetch_and_cache_binance()
    q = query.upper()
    results = [s for s in data if s["ticker"].startswith(q)]
    return results[:limit]


async def search_coingecko(query: str, limit: int = 5) -> list[dict]:
    """Returns CoinGecko coins matching query by symbol prefix OR name prefix, using Redis cache."""
    data = await _cache_get(COINGECKO_KEY)
    if data is None:
        data = await _fetch_and_cache_coingecko()
    q = query.upper()
    q_lower = query.lower()
    # Symbol prefix matches first, then name prefix
    by_symbol = [s for s in data if s["ticker"].startswith(q)]
    by_name   = [s for s in data if s["name"].lower().startswith(q_lower) and s not in by_symbol]
    merged = (by_symbol + by_name)[:limit]
    return merged


async def search_brapi(query: str, limit: int = 5) -> list[dict]:
    """Returns B3 tickers matching query prefix, using Redis cache."""
    data = await _cache_get(BRAPI_KEY)
    if data is None:
        data = await _fetch_and_cache_brapi()
    q = query.upper()
    results = [s for s in data if s["ticker"].startswith(q)]
    return results[:limit]
