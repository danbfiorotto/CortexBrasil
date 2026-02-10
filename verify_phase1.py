import asyncio
import uuid
from backend.db.session import AsyncSessionLocal
from backend.core.ledger import LedgerService
from sqlalchemy import text

async def verify_ledger():
    print("🧪 Starting Ledger Verification...")
    test_phone = f"test_{uuid.uuid4()}"[:15] # Random test user
    
    async with AsyncSessionLocal() as session:
        # Mock RLS
        await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": test_phone})
        
        ledger = LedgerService(session)
        
        # 1. Create Accounts
        print("\n1. Creating Accounts...")
        nubank = await ledger.create_account(test_phone, "Nubank", "CHECKING", initial_balance=0)
        wallet = await ledger.create_account(test_phone, "Carteira", "CASH", initial_balance=50)
        print(f"✅ Created Nubank (ID: {nubank.id})")
        print(f"✅ Created Wallet (ID: {wallet.id}) with R$ 50.00")
        
        # 2. Add Income (Salary)
        print("\n2. Registering Income (Salary)...")
        await ledger.register_transaction(
            user_phone=test_phone,
            amount=5000.0,
            category="Salário",
            description="Pagamento Mensal",
            tx_type="INCOME",
            account_name="Nubank"
        )
        await session.commit() 
        # Note: Triggers should update balance. But session contains old objects. Refetch?
        await session.refresh(nubank)
        print(f"✅ Nubank Balance after Income: R$ {nubank.current_balance} (Expected 5000.00)")
        
        # 3. Add Expense (Lunch)
        print("\n3. Registering Expense (Lunch)...")
        await ledger.register_transaction(
            user_phone=test_phone,
            amount=50.0,
            category="Alimentação",
            description="Almoço",
            tx_type="EXPENSE",
            account_name="Nubank"
        )
        await session.commit()
        await session.refresh(nubank)
        print(f"✅ Nubank Balance after Expense: R$ {nubank.current_balance} (Expected 4950.00)")
        
        # 4. Transfer (Saving)
        print("\n4. Transferring to Wallet...")
        await ledger.register_transaction(
            user_phone=test_phone,
            amount=100.0,
            category="Transferência",
            description="Saque",
            tx_type="TRANSFER",
            account_name="Nubank",
            destination_account_name="Carteira"
        )
        await session.commit()
        await session.refresh(nubank)
        await session.refresh(wallet)
        
        print(f"✅ Nubank final: R$ {nubank.current_balance} (Expected 4850.00)")
        print(f"✅ Wallet final: R$ {wallet.current_balance} (Expected 150.00)")
        
        if nubank.current_balance == 4850.0 and wallet.current_balance == 150.0:
            print("\n🎉 SUSCESS: Ledger Logic Verification Passed!")
        else:
            print("\n❌ FAILURE: Balances do not match expectations.")

if __name__ == "__main__":
    asyncio.run(verify_ledger())
