import asyncio
import os
import sys

# Ensure backend module is found
sys.path.append("/app")

async def test_crash():
    print("--- START DEBUG ---")
    
    print("1. Importing Config")
    try:
        from backend.core.config import settings
        print(f"DB URL: {settings.DATABASE_URL}")
    except Exception as e:
        print(f"Config Import Error: {e}")
        return
    
    print("2. Importing DB Session")
    try:
        from backend.db.session import get_db, AsyncSessionLocal
    except Exception as e:
        print(f"Session Import Error: {e}")
        return
    
    print("3. Testing DB Connection (AsyncSession)")
    try:
        async with AsyncSessionLocal() as session:
            print("Session created.")
            from sqlalchemy import text
            await session.execute(text("SELECT 1"))
            print("DB Query SELECT 1 successful.")
    except Exception as e:
        print(f"DB CRASH: {e}")
        import traceback
        traceback.print_exc()
        
    print("4. Importing Auth")
    try:
        from backend.core.auth import get_current_user, create_access_token
    except Exception as e:
        print(f"Auth Import Error: {e}")
        return
    
    print("5. Generating Token")
    try:
        token = create_access_token({"sub": "5511999999999"})
        print(f"Token: {token[:10]}...")
    except Exception as e:
        print(f"Token Gen Error: {e}")
        return
    
    print("6. Testing get_current_user")
    try:
        user = await get_current_user(token)
        print(f"User validated: {user}")
    except Exception as e:
        print(f"Auth CRASH: {e}")
        import traceback
        traceback.print_exc()

    print("7. Importing Dashboard")
    try:
        from backend.api.dashboard import get_hud_metrics
        print("Dashboard imported.")
    except Exception as e:
        print(f"Import Dashboard CRASH: {e}")
        import traceback
        traceback.print_exc()
        return

    print("8. Testing get_hud_metrics logic")
    try:
        # Mock dependencies
        async with AsyncSessionLocal() as session:
             print("Calling get_hud_metrics...")
             result = await get_hud_metrics(current_user_phone="5511999999999", db=session)
             print(f"HUD Result Keys: {result.keys()}")
    except Exception as e:
        print(f"HUD Execution CRASH: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_crash())
