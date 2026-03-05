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

async def _fetch_brapi(ticker: str) -> float | None:
    """Brapi.dev – covers B3 stocks, FIIs, BDRs. No key required."""
    try:
        import httpx
        url = f"https://brapi.dev/api/quote/{ticker}?range=1d&interval=1d"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        data = r.json()
        results = data.get("results", [])
        if not results:
            return None
        price = results[0].get("regularMarketPrice")
        return float(price) if price is not None else None
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


async def _fetch_coingecko(ticker: str) -> float | None:
    """CoinGecko – public API, no key required. Converts symbol to CG id."""
    try:
        import httpx
        # Normalize common symbols
        symbol_map = {
            "BTC": "bitcoin", "ETH": "ethereum", "BNB": "binancecoin",
            "SOL": "solana", "ADA": "cardano", "XRP": "ripple",
            "DOT": "polkadot", "DOGE": "dogecoin", "AVAX": "avalanche-2",
            "MATIC": "matic-network", "LINK": "chainlink", "LTC": "litecoin",
            "UNI": "uniswap", "ATOM": "cosmos", "FIL": "filecoin",
        }
        cg_id = symbol_map.get(ticker.upper(), ticker.lower())
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

async def search_ticker(query: str) -> dict | None:
    """
    Validates a ticker and returns its name + current price.
    Tries Brapi (BR) first, then yfinance with .SA, then bare ticker (US).
    Returns: {"ticker": str, "name": str, "price": float, "currency": str, "exchange": str}
    """
    if not query or len(query) < 1:
        return None

    q = query.strip().upper()

    # 1. Try Brapi (covers B3 very well)
    try:
        import httpx
        url = f"https://brapi.dev/api/quote/{q}?range=1d&interval=1d"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
        if r.status_code == 200:
            data = r.json()
            results = data.get("results", [])
            if results and results[0].get("regularMarketPrice"):
                res = results[0]
                return {
                    "ticker": q,
                    "name": res.get("longName") or res.get("shortName") or q,
                    "price": float(res["regularMarketPrice"]),
                    "currency": res.get("currency", "BRL"),
                    "exchange": res.get("exchange", "B3"),
                    "source": "brapi",
                }
    except Exception:
        pass

    # 2. Try yfinance with .SA suffix
    try:
        import yfinance as yf
        for suffix in [".SA", "", "-USD"]:
            stock = yf.Ticker(f"{q}{suffix}")
            info = stock.fast_info
            price = getattr(info, "last_price", None) or getattr(info, "previous_close", None)
            if price:
                try:
                    full_info = stock.info
                    name = full_info.get("longName") or full_info.get("shortName") or q
                    currency = full_info.get("currency", "BRL" if suffix == ".SA" else "USD")
                    exchange = full_info.get("exchange", "")
                except Exception:
                    name = q
                    currency = "BRL" if suffix == ".SA" else "USD"
                    exchange = ""
                return {
                    "ticker": q,
                    "name": name,
                    "price": round(float(price), 4),
                    "currency": currency,
                    "exchange": exchange,
                    "source": f"yfinance{suffix}",
                }
    except Exception as e:
        logger.debug(f"yfinance search failed for {q}: {e}")

    # 3. Try CoinGecko for crypto
    cg = await _fetch_coingecko(q)
    if cg:
        return {
            "ticker": q,
            "name": q,
            "price": cg,
            "currency": "BRL",
            "exchange": "CoinGecko",
            "source": "coingecko",
        }

    return None


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
    t = ticker.strip().upper()

    if asset_type == "CRYPTO":
        # Run CoinGecko and Binance in parallel, yfinance as fallback
        results = await asyncio.gather(
            _fetch_coingecko(t),
            _fetch_binance(t),
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, float) and r > 0:
                price = r
                break
        if not price:
            price = await _fetch_yfinance(f"{t}-USD")

    elif asset_type in ("STOCK", "FII"):
        # Run Brapi and yfinance(.SA) in parallel
        results = await asyncio.gather(
            _fetch_brapi(t),
            _fetch_yfinance(t, ".SA"),
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, float) and r > 0:
                price = r
                break
        if not price:
            # Try bare ticker (US stocks like AAPL, MSFT)
            price = await _fetch_yfinance(t)
        if not price:
            price = await _fetch_yahoo_direct(f"{t}.SA")

    else:
        # FIXED_INCOME or unknown – yfinance only
        price = await _fetch_yfinance(t, ".SA") or await _fetch_yfinance(t)

    if price is None:
        logger.warning(f"Could not fetch price for {ticker} from any source")
        return None

    return {
        "ticker": ticker,
        "price": round(float(price), 4),
        "change_pct": None,
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
