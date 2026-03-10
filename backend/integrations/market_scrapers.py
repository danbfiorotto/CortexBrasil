"""
Market Data Scraper (Privacy-First, Multi-Source)
Fetches ONLY public prices from APIs. Quantities are stored locally.
External APIs never know the user's position size.

Sources (in order of preference per asset type):
  Brazilian stocks/FIIs : Brapi (brapi.dev) → yfinance (.SA) → Yahoo Finance direct
  US stocks             : yfinance → Alpha Vantage (free tier)
  Crypto                : CoinGecko → Binance public → yfinance
"""
import asyncio
import logging
from datetime import datetime
from sqlalchemy import text
from backend.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Low-level fetchers
# ---------------------------------------------------------------------------

async def _fetch_brapi(ticker: str) -> dict | None:
    """Brapi.dev – covers B3 stocks, FIIs, BDRs. No key required.
    Returns {"price": float, "dividend_yield": float | None} or None."""
    try:
        import httpx
        url = f"https://brapi.dev/api/quote/{ticker}?range=1d&interval=1d&fundamental=true"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        data = r.json()
        results = data.get("results", [])
        if not results:
            return None
        res = results[0]
        price = res.get("regularMarketPrice")
        if price is None:
            return None
        dy_raw = res.get("dividendYield") or res.get("trailingAnnualDividendYield")
        dividend_yield = float(dy_raw) if dy_raw is not None else None
        return {"price": float(price), "dividend_yield": dividend_yield}
    except Exception as e:
        logger.debug(f"Brapi failed for {ticker}: {e}")
        return None


async def _fetch_yfinance(ticker: str, suffix: str = "") -> float | None:
    """yfinance – works for BR (.SA), US, crypto (-USD)."""
    try:
        import yfinance as yf
        yf_ticker = f"{ticker}{suffix}" if suffix else ticker
        stock = yf.Ticker(yf_ticker)
        info = stock.fast_info
        price = getattr(info, "last_price", None) or getattr(info, "previous_close", None)
        return round(float(price), 4) if price else None
    except Exception as e:
        logger.debug(f"yfinance failed for {ticker}{suffix}: {e}")
        return None


def _normalize_crypto_ticker(ticker: str) -> str:
    """
    Strips common suffixes from crypto tickers so they work with Binance/CoinGecko.
    Examples: BTC-USD → BTC, ETH-USDT → ETH, SOL-BRL → SOL, BITCOIN → BITCOIN
    """
    t = ticker.upper().strip()
    for suffix in ("-USD", "-USDT", "-BRL", "-EUR", "-BTC", "-ETH", "USDT", "USD"):
        if t.endswith(suffix) and len(t) > len(suffix):
            t = t[: -len(suffix)]
            break
    return t


async def _fetch_coingecko(ticker: str) -> float | None:
    """CoinGecko – resolves symbol to cg_id via Redis cache, then fetches price."""
    try:
        import httpx
        from backend.integrations.symbol_cache import search_coingecko

        # Try to resolve cg_id from the cached coins list
        matches = await search_coingecko(ticker, limit=1)
        cg_id = matches[0]["cg_id"] if matches else ticker.lower()

        url = f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=brl,usd"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        data = r.json().get(cg_id, {})
        return float(data["brl"]) if "brl" in data else (float(data["usd"]) if "usd" in data else None)
    except Exception as e:
        logger.debug(f"CoinGecko failed for {ticker}: {e}")
        return None


async def _fetch_binance(ticker: str) -> float | None:
    """Binance public REST – crypto prices in USDT (no key needed)."""
    try:
        import httpx
        symbol = f"{ticker.upper()}USDT"
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        price = float(r.json().get("price", 0))
        # Convert USDT → BRL via approximate rate (fallback: yfinance BRL=X)
        usd_brl = await _fetch_yfinance("BRL=X") or 5.0
        return round(price * usd_brl, 4) if price else None
    except Exception as e:
        logger.debug(f"Binance failed for {ticker}: {e}")
        return None


async def _search_binance(ticker: str) -> dict | None:
    """Binance public REST – validates a crypto ticker and returns price in BRL."""
    try:
        import httpx
        base = _normalize_crypto_ticker(ticker)
        symbol = f"{base}USDT"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}")
        if r.status_code != 200:
            return None
        price_usdt = float(r.json().get("price", 0))
        if not price_usdt:
            return None
        usd_brl = await _fetch_yfinance("BRL=X") or 5.0
        price_brl = round(price_usdt * usd_brl, 4)
        return {
            "ticker": base,
            "name": base,
            "price": price_brl,
            "currency": "BRL",
            "exchange": "Binance",
            "source": "binance",
        }
    except Exception as e:
        logger.debug(f"Binance search failed for {ticker}: {e}")
        return None


async def _suggest_binance(query: str, limit: int = 5) -> list[dict]:
    """Binance crypto symbols matching query prefix — served from Redis cache."""
    from backend.integrations.symbol_cache import search_binance
    results = await search_binance(query, limit=limit)
    # Normalize to standard suggest shape
    return [{"ticker": r["ticker"], "symbol": r["ticker"], "name": r["name"], "exchange": r["exchange"], "type": r["type"]} for r in results]


async def _fetch_yahoo_direct(ticker: str) -> float | None:
    """Direct Yahoo Finance v8 API – last-resort fallback."""
    try:
        import httpx
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=10, headers=headers) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        meta = r.json().get("chart", {}).get("result", [{}])[0].get("meta", {})
        price = meta.get("regularMarketPrice") or meta.get("previousClose")
        return float(price) if price else None
    except Exception as e:
        logger.debug(f"Yahoo direct failed for {ticker}: {e}")
        return None


# ---------------------------------------------------------------------------
# Ticker search / validation
# ---------------------------------------------------------------------------

async def _search_yahoo_finance(ticker: str) -> dict | None:
    """
    Searches Yahoo Finance directly via HTTP (no API key required).
    Tries .SA suffix first (B3), then bare ticker (US stocks), then -USD (crypto).
    """
    try:
        import httpx
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=10, headers=headers) as client:
            for suffix, currency, exchange in [(".SA", "BRL", "B3"), ("", "USD", ""), ("-USD", "USD", "")]:
                yf_sym = f"{ticker}{suffix}"
                r = await client.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_sym}")
                if r.status_code != 200:
                    continue
                data = r.json()
                results = data.get("chart", {}).get("result") or []
                if not results:
                    continue
                meta = results[0].get("meta", {})
                price = meta.get("regularMarketPrice") or meta.get("previousClose")
                if not price:
                    continue
                name = meta.get("longName") or meta.get("shortName") or ticker
                cur = meta.get("currency") or currency
                exch = meta.get("fullExchangeName") or meta.get("exchangeName") or exchange
                return {
                    "ticker": ticker,
                    "name": name,
                    "price": round(float(price), 4),
                    "currency": cur,
                    "exchange": exch,
                    "source": f"yahoo{suffix}",
                }
    except Exception as e:
        logger.debug(f"Yahoo Finance search failed for {ticker}: {e}")
    return None


_CRYPTO_EXCHANGES = {"CCC", "Crypto", "cryptocurrency", "Coinbase", "Binance"}

def _is_crypto_result(result: dict) -> bool:
    """Detects if a Yahoo Finance result is a crypto asset."""
    exchange = result.get("exchange", "")
    ticker = result.get("ticker", "")
    return (
        exchange in _CRYPTO_EXCHANGES
        or "-USD" in ticker
        or "-USDT" in ticker
        or "-BRL" in ticker
    )


async def search_ticker(query: str) -> dict | None:
    """
    Validates a ticker and returns its name + current price.
    Uses Yahoo Finance directly (no API key), with Binance + CoinGecko fallback for crypto.
    Returns: {"ticker": str, "name": str, "price": float, "currency": str, "exchange": str}

    For crypto assets, the returned ticker is always the clean base symbol (e.g. BTC, not BTC-USD),
    so it matches the market_data table key used by fetch_stock_price.
    """
    if not query or len(query) < 1:
        return None

    q = query.strip().upper()

    # 1. Yahoo Finance (covers B3, US, and most global markets)
    result = await _search_yahoo_finance(q)
    if result:
        # Normalize crypto tickers so BTC-USD → BTC before returning to caller
        if _is_crypto_result(result):
            result["ticker"] = _normalize_crypto_ticker(result["ticker"])
        return result

    # For crypto fallbacks, always use the clean base symbol (strip -USD, -USDT, etc.)
    base = _normalize_crypto_ticker(q)

    # 2. Binance fallback for crypto (broader coverage than CoinGecko's symbol map)
    binance = await _search_binance(base)
    if binance:
        return binance

    # 3. CoinGecko fallback for crypto
    cg = await _fetch_coingecko(base)
    if cg:
        return {
            "ticker": base,
            "name": base,
            "price": cg,
            "currency": "BRL",
            "exchange": "Crypto",
            "source": "coingecko",
        }

    return None


async def suggest_tickers(query: str, limit: int = 5) -> list[dict]:
    """
    Suggests tickers based on a query.

    Sources (all run in parallel):
      - Yahoo Finance Search API  → live, covers B3 / US / ETF / global
      - Binance cache (Redis)     → crypto symbols prefix match
      - CoinGecko cache (Redis)   → crypto symbol + name prefix match
      - Brapi cache (Redis)       → B3 tickers prefix match

    Cache hits are pure in-process filtering (< 1ms).
    Returns up to `limit` deduplicated results, Yahoo results first.
    """
    if not query or len(query) < 2:
        return []

    from backend.integrations.symbol_cache import search_binance, search_coingecko, search_brapi

    async def _yahoo() -> list[dict]:
        try:
            import httpx
            url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount={limit}&newsCount=0"
            async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as client:
                r = await client.get(url)
            if r.status_code != 200:
                return []
            results = []
            for q in r.json().get("quotes", []):
                ticker = q.get("symbol")
                if not ticker:
                    continue
                display_ticker = ticker[:-3] if ticker.endswith(".SA") else ticker
                results.append({
                    "ticker": display_ticker,
                    "symbol": ticker,
                    "name": q.get("longname") or q.get("shortname") or ticker,
                    "exchange": q.get("exchDisp") or q.get("exchange") or "",
                    "type": q.get("quoteType"),
                })
            return results
        except Exception as e:
            logger.debug(f"Yahoo suggest failed for {query}: {e}")
            return []

    def _normalize(items: list[dict]) -> list[dict]:
        return [{"ticker": r["ticker"], "symbol": r.get("symbol", r["ticker"]), "name": r["name"], "exchange": r["exchange"], "type": r["type"]} for r in items]

    yahoo, binance, coingecko, brapi = await asyncio.gather(
        _yahoo(),
        search_binance(query, limit=limit),
        search_coingecko(query, limit=limit),
        search_brapi(query, limit=limit),
        return_exceptions=True,
    )

    # Treat exceptions as empty lists
    yahoo     = yahoo     if isinstance(yahoo, list)     else []
    binance   = binance   if isinstance(binance, list)   else []
    coingecko = coingecko if isinstance(coingecko, list) else []
    brapi     = brapi     if isinstance(brapi, list)     else []

    # Merge: Yahoo first (live, richest data), then cache sources in order
    seen: set[str] = set()
    merged: list[dict] = []

    for item in yahoo:
        key = item["ticker"]
        if key not in seen:
            seen.add(key)
            merged.append(item)

    for item in _normalize(binance) + _normalize(coingecko) + _normalize(brapi):
        key = item["ticker"]
        if key not in seen:
            seen.add(key)
            merged.append(item)

    return merged[:limit]


# ---------------------------------------------------------------------------
# Main price fetcher (multi-source with fallback)
# ---------------------------------------------------------------------------

async def fetch_stock_price(ticker: str, asset_type: str = "STOCK") -> dict | None:
    """
    Fetches current price using multiple sources in parallel, returns first valid result.
    asset_type: STOCK | FII | CRYPTO | FIXED_INCOME
    Privacy: Only the ticker is sent externally. Position size stays local.
    """
    price: float | None = None
    dividend_yield: float | None = None
    t = ticker.strip().upper()

    if asset_type == "CRYPTO":
        # Strip suffixes like -USD, -USDT so Binance/CoinGecko receive clean base symbol
        base = _normalize_crypto_ticker(t)
        # Run CoinGecko and Binance in parallel, yfinance as fallback
        results = await asyncio.gather(
            _fetch_coingecko(base),
            _fetch_binance(base),
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, float) and r > 0:
                price = r
                break
        if not price:
            price = await _fetch_yfinance(f"{base}-USD")

    elif asset_type in ("STOCK", "FII"):
        # Run Brapi and yfinance(.SA) in parallel
        results = await asyncio.gather(
            _fetch_brapi(t),
            _fetch_yfinance(t, ".SA"),
            return_exceptions=True,
        )
        brapi_result = results[0]
        yf_price = results[1]

        if isinstance(brapi_result, dict) and brapi_result.get("price", 0) > 0:
            price = brapi_result["price"]
            dividend_yield = brapi_result.get("dividend_yield")
        elif isinstance(yf_price, float) and yf_price > 0:
            price = yf_price

        if not price:
            # Try bare ticker (US stocks like AAPL, MSFT)
            price = await _fetch_yfinance(t)
        if not price:
            price = await _fetch_yahoo_direct(f"{t}.SA")

        # Try to get dividend yield from yfinance if not already fetched
        if dividend_yield is None and price:
            try:
                import yfinance as yf
                info = yf.Ticker(f"{t}.SA").info or yf.Ticker(t).info
                dy = info.get("dividendYield") or info.get("trailingAnnualDividendYield")
                if dy:
                    dividend_yield = float(dy) * 100  # yfinance returns as decimal (0.05 = 5%)
            except Exception:
                pass

    else:
        # FIXED_INCOME or unknown – yfinance only
        price = await _fetch_yfinance(t, ".SA") or await _fetch_yfinance(t)

    if price is None:
        logger.warning(f"Could not fetch price for {ticker} from any source")
        return None

    # Use normalized ticker as key so market_data JOIN works correctly for crypto
    stored_ticker = _normalize_crypto_ticker(t) if asset_type == "CRYPTO" else t

    return {
        "ticker": stored_ticker,
        "price": round(float(price), 4),
        "change_pct": None,
        "dividend_yield": round(dividend_yield, 4) if dividend_yield is not None else None,
        "last_updated": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Batch market data update
# ---------------------------------------------------------------------------

async def update_market_data(tickers: list[str], asset_types: dict[str, str] | None = None):
    """
    Batch updates market_data table with current prices.
    asset_types: optional mapping {ticker: asset_type} for better source selection.
    """
    if asset_types is None:
        asset_types = {}

    async with AsyncSessionLocal() as session:
        tasks = {
            t: fetch_stock_price(t, asset_types.get(t, "STOCK"))
            for t in tickers
        }
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        updated = 0
        for ticker, data in zip(tasks.keys(), results):
            if isinstance(data, Exception) or not data:
                logger.warning(f"Skipping {ticker}: no price data")
                continue
            await session.execute(
                text("""
                    INSERT INTO market_data (ticker, price, change_pct, dividend_yield, last_updated)
                    VALUES (:ticker, :price, :change_pct, :dividend_yield, NOW())
                    ON CONFLICT (ticker) DO UPDATE SET
                        price = :price,
                        change_pct = :change_pct,
                        dividend_yield = COALESCE(:dividend_yield, market_data.dividend_yield),
                        last_updated = NOW()
                """),
                {
                    "ticker": data["ticker"],
                    "price": data["price"],
                    "change_pct": data.get("change_pct"),
                    "dividend_yield": data.get("dividend_yield"),
                },
            )
            updated += 1

        await session.commit()
        logger.info(f"Updated market data for {updated}/{len(tickers)} tickers")


# ---------------------------------------------------------------------------
# Portfolio value calculation
# ---------------------------------------------------------------------------

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
                SELECT a.id, a.ticker, a.name, a.type, a.quantity, a.avg_price,
                       COALESCE(m.price, 0) as current_price,
                       m.change_pct,
                       m.dividend_yield
                FROM assets a
                LEFT JOIN market_data m ON a.ticker = m.ticker
                WHERE a.user_phone = :phone
            """),
            {"phone": user_phone}
        )

        rows = result.fetchall()

        # Refresh stale prices in background (tickers with no price data)
        missing = [r.ticker for r in rows if float(r.current_price) == 0]
        if missing:
            type_map = {r.ticker: r.type for r in rows}
            asyncio.create_task(update_market_data(missing, type_map))

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
                "id": str(row.id),
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
                "dividend_yield": float(row.dividend_yield) if row.dividend_yield else None,
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
