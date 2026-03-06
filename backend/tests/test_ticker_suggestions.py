import asyncio
import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.integrations.market_scrapers import suggest_tickers

async def test():
    query = "BB"
    print(f"Testing suggestions for: {query}")
    results = await suggest_tickers(query)
    for res in results:
        print(f" - {res['ticker']} ({res['symbol']}): {res['name']} [{res['exchange']}]")

    query = "VALE"
    print(f"\nTesting suggestions for: {query}")
    results = await suggest_tickers(query)
    for res in results:
        print(f" - {res['ticker']} ({res['symbol']}): {res['name']} [{res['exchange']}]")

if __name__ == "__main__":
    asyncio.run(test())
