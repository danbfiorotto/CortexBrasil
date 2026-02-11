import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

from backend.core.config import settings

# Ensure the database URL uses the async driver
DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

async def apply_migration():
    print(f"🔌 Connecting to {DATABASE_URL}")
    engine = create_async_engine(DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        with open("backend/db/migrations/005_add_profile_fields.sql", "r") as f:
            sql_script = f.read()

        print("🚀 Applying migration 005_add_profile_fields.sql...")
        try:
            # Split by statement if needed, but simple alters can run together in some drivers
            # Better to run execute for the whole block for simplicity if supported, 
            # or split by ; if issues arise. Here allow multiline.
            await conn.execute(text(sql_script))
            print("✅ Migration applied successfully.")
        except Exception as e:
            print(f"❌ Migration failed: {e}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_migration())
