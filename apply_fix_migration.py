import asyncio
from backend.db.session import engine
from sqlalchemy import text

async def main():
    statements = [
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit FLOAT;",
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS due_day INTEGER;",
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS closing_day INTEGER;"
    ]
    
    try:
        async with engine.begin() as conn:
            for statement in statements:
                await conn.execute(text(statement))
            print("✅ Migration successful: Columns added to 'accounts' table individually.")
    except Exception as e:
        print(f"❌ Error during migration: {e}")

if __name__ == "__main__":
    asyncio.run(main())
