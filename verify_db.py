import asyncio
from backend.db.session import engine
from sqlalchemy import text
import sys

# Add project root to path so imports work
sys.path.append("/app") 

async def main():
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT to_regclass('public.transactions');"))
            table_name = result.scalar()
            if table_name == 'transactions':
                print("SUCCESS: Table 'transactions' exists.")
            else:
                print(f"FAILURE: Table 'transactions' does not exist. Result: {table_name}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(main())
