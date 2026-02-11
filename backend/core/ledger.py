from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from backend.db.models import Transaction, Account
from uuid import UUID
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class LedgerService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_account(self, 
                             user_phone: str, 
                             name: str, 
                             acc_type: str, 
                             initial_balance: float = 0.0,
                             credit_limit: float = None,
                             due_day: int = None,
                             closing_day: int = None) -> Account:
        """
        Creates a new financial account (Wallet, Bank, etc.)
        """
        account = Account(
            user_phone=user_phone,
            name=name,
            type=acc_type.upper(), # CHECKING, CREDIT, CASH
            initial_balance=initial_balance,
            current_balance=initial_balance,
            credit_limit=credit_limit,
            due_day=due_day,
            closing_day=closing_day
        )
        self.session.add(account)
        await self.session.flush()
        return account

    async def get_accounts(self, user_phone: str):
        """
        List all accounts with current computed balance.
        """
        # RLS injection usually happens at Request middleware level.
        # Assuming RLS is active or we filter by phone manually as a fallback
        result = await self.session.execute(select(Account).where(Account.user_phone == user_phone))
        return result.scalars().all()

    async def get_account_by_name(self, user_phone: str, name: str):
        """
        Fuzzy search for account by name (e.g. "Nubank" matches "Conta Nubank")
        """
        lower_name = name.lower()
        stmt = select(Account).where(
            Account.user_phone == user_phone, 
            func.lower(Account.name).contains(lower_name)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def register_transaction(self, 
                                   user_phone: str, 
                                   amount: float, 
                                   category: str, 
                                   description: str, 
                                   tx_type: str = "EXPENSE",
                                   account_name: str = None,
                                   destination_account_name: str = None,
                                   account_id: UUID = None,
                                   destination_account_id: UUID = None,
                                   installments: int = None,
                                   date: datetime = None) -> Transaction:
        """
        Central method to register Income, Expense or Transfer.
        """
        # 1. Resolve Account
        account = None
        if account_id:
            # Use provided ID
            result = await self.session.execute(select(Account).where(Account.id == account_id))
            account = result.scalar_one_or_none()
        elif account_name:
            account = await self.get_account_by_name(user_phone, account_name)
        
        # If no account found/specified, try to find a default "Carteira" or create one
        if not account:
            account = await self.get_account_by_name(user_phone, "Carteira")
            if not account:
                 account = await self.create_account(user_phone, "Carteira", "CASH")

        resolved_account_id = account.id

        # 2. Resolve Destination Account (if Transfer)
        resolved_dest_account_id = None
        if tx_type == "TRANSFER":
            if destination_account_id:
                resolved_dest_account_id = destination_account_id
            elif destination_account_name:
                dest_account = await self.get_account_by_name(user_phone, destination_account_name)
                if dest_account:
                    resolved_dest_account_id = dest_account.id

        # 3. Create Transaction
        # Note: Triggers in DB will update the account balance automatically!
        
        # Handle installments (Basic Logic for MVP - Recurrence is complex)
        # For now, we log the full value or the first installment? 
        # Requirement says: "Divisão automática de compras futuras". 
        # We will create N transactions in the future.
        
        if installments and installments > 1 and tx_type == "EXPENSE":
             # Create N transactions
             installment_amount = amount / installments
             group_id = uuid.uuid4()
             
             # Create first one now
             first_tx = Transaction(
                user_phone=user_phone,
                account_id=resolved_account_id,
                type=tx_type,
                amount=installment_amount,
                category=category,
                description=f"{description} (1/{installments})",
                date=date or datetime.utcnow(),
                installments_count=installments,
                installment_number=1,
                group_id=group_id
             )
             self.session.add(first_tx)
             
             # Create future ones (simple approach: +30 days loop)
             # Ideally use dateutil.relativedelta
             from dateutil.relativedelta import relativedelta
             current_date = date or datetime.utcnow()
             
             for i in range(2, installments + 1):
                 current_date += relativedelta(months=1)
                 future_tx = Transaction(
                    user_phone=user_phone,
                    account_id=resolved_account_id,
                    type=tx_type,
                    amount=installment_amount,
                    category=category,
                    description=f"{description} ({i}/{installments})",
                    date=current_date,
                    installments_count=installments,
                    installment_number=i,
                    group_id=group_id
                 )
                 self.session.add(future_tx)
                 
             return first_tx
        else:
            # Single Transaction
            tx = Transaction(
                user_phone=user_phone,
                account_id=resolved_account_id,
                destination_account_id=resolved_dest_account_id,
                type=tx_type,
                amount=amount,
                category=category,
                description=description,
                date=date or datetime.utcnow()
            )
            self.session.add(tx)
            return tx
