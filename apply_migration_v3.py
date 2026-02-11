import asyncio
from sqlalchemy import text
from backend.db.session import AsyncSessionLocal

async def apply_migration():
    migration_file = "backend/db/migrations/003_add_is_cleared_to_transactions.sql"
    print(f"⏳ Applying migration: {migration_file}")
    
    with open(migration_file, "r") as f:
        sql = f.read()
        
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text(sql))
            await session.commit()
            print("✅ Migration 003 Applied Successfully")
        except Exception as e:
            print(f"❌ Error: {e}")
            await session.rollback()

if __name__ == "__main__":
    asyncio.run(apply_migration())
