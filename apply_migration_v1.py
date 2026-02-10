import asyncio
import os
from sqlalchemy import text
from backend.db.session import AsyncSessionLocal

async def apply_migration():
    migration_file = "backend/db/migrations/001_initial_ledger.sql"
    
    print(f"⏳ Applying migration: {migration_file}")
    
    with open(migration_file, "r", encoding="utf-8") as f:
        sql_script = f.read()
        
    async with AsyncSessionLocal() as session:
        try:
            # Split by ; to run one by one if needed, or run all at once if supported
            # sqlalchemy text() might handle multiple statements depending on driver
            # For safety with asyncpg, we might need to execute block by block if they are complex
            # But creating tables/triggers usually works in blocks.
            
            await session.execute(text(sql_script))
            await session.commit()
            print("✅ Migration applied successfully!")
        except Exception as e:
            print(f"❌ Error applying migration: {e}")
            await session.rollback()

if __name__ == "__main__":
    # Ensure we are in the root directory or can import backend
    # This script is intended to be run from the project root (where backend/ is)
    asyncio.run(apply_migration())
