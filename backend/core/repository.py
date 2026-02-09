from sqlalchemy import desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.db.models import Transaction
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class TransactionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_transaction(self, user_phone: str, amount: float, category: str, description: str, date=None, raw_message: str = None, installments: int = None) -> Transaction:
        # Data Cleaning / Validation
        if amount is not None:
            try:
                amount = float(amount)
            except ValueError:
                logger.warning(f"Could not convert amount '{amount}' to float. Setting to None.")
                amount = None

        base_date = None
        if date is not None and isinstance(date, str):
            try:
                # Handle ISO 8601 strings
                base_date = datetime.fromisoformat(date.replace('Z', '+00:00'))
            except ValueError:
                logger.warning(f"Could not parse date '{date}'. Setting to None.")
                base_date = None
        
        # Default to now if no date provided
        # Default to now (Brazil Time) if no date provided
        if not base_date:
            import pytz
            tz = pytz.timezone('America/Sao_Paulo')
            base_date = datetime.now(tz).replace(tzinfo=None) # Make naive for DB if needed, or keep aware?
            # SQLAlchemy DateTime can be naive. Let's keep it naive roughly matching local time for simplicity in this MVP
            # or better, store UTC and handle in frontend. 
            # User specifically asked for "date to be in the timezone of the origin". 
            # This often means they want "23:00" to be stored as "23:00".
            base_date = datetime.now(tz).replace(tzinfo=None)

        # Handle Installments
        import uuid
        from dateutil.relativedelta import relativedelta
        
        main_tx = None
        
        if installments and installments > 1:
            group_id = uuid.uuid4()
            
            # Precise rounding logic
            # floor to 2 decimal places
            import math
            base_installment = math.floor((amount / installments) * 100) / 100
            
            # Calculate total of base installments
            total_base = base_installment * installments
            
            # Calculate remainder (e.g. 100 - 99.99 = 0.01)
            remainder = round(amount - total_base, 2)
            
            for i in range(1, installments + 1):
                # Calculate date: base_date + (i-1) months
                tx_date = base_date + relativedelta(months=i-1)
                
                # Determine amount for this specific installment
                current_amount = base_installment
                
                # Add remainder to the LAST installment
                if i == installments:
                    current_amount = round(current_amount + remainder, 2)
                
                desc_suffix = f" ({i}/{installments})"
                full_desc = (description or "") + desc_suffix
                
                tx = Transaction(
                    user_phone=str(user_phone),
                    amount=current_amount,
                    category=category,
                    description=full_desc,
                    date=tx_date,
                    raw_message=raw_message,
                    installments_count=installments,
                    installment_number=i,
                    group_id=group_id
                )
                self.session.add(tx)
                if i == 1:
                    main_tx = tx # Return the first one for reference
                    
        else:
            # Single Transaction
            main_tx = Transaction(
                user_phone=str(user_phone),
                amount=amount,
                category=category,
                description=description,
                date=base_date,
                raw_message=raw_message,
                installments_count=1,
                installment_number=1
            )
            self.session.add(main_tx)
            
        await self.session.commit()
        if main_tx:
            await self.session.refresh(main_tx)
        return main_tx

    async def get_stats_by_user(self, user_phone: str):
        # Placeholder for stats logic
        stmt = select(Transaction).where(Transaction.user_phone == user_phone)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_recent_transactions(self, user_phone: str, limit: int = 50):
        """
        Fetch recent transactions for context injection.
        """
        stmt = (
            select(Transaction)
            .where(Transaction.user_phone == user_phone)
            .order_by(desc(Transaction.created_at))
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_transactions(
        self, 
        user_phone: str, 
        skip: int = 0, 
        limit: int = 10, 
        start_date: datetime = None, 
        end_date: datetime = None, 
        category: str = None
    ):
        """
        Fetch filtered transactions with pagination.
        And returns total count for frontend pagination.
        """
        from sqlalchemy import func
        
        # Base Query
        query = select(Transaction).where(Transaction.user_phone == user_phone)
        
        # Filters
        if start_date:
            query = query.where(Transaction.date >= start_date)
        if end_date:
            query = query.where(Transaction.date <= end_date)
        if category:
            query = query.where(Transaction.category == category)
            
        # Count Query (before pagination)
        count_query = select(func.count()).select_from(query.subquery())
        total_count = await self.session.scalar(count_query)
        
        # Pagination & Sorting
        query = query.order_by(desc(Transaction.date)).offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        transactions = result.scalars().all()
        
        return transactions, total_count

    async def get_future_commitments(self, user_phone: str, start_date: datetime):
        """
        Aggregates future transactions by month (YYYY-MM).
        Used for the 'Mountain of Commitments' chart.
        """
        from sqlalchemy import func
        
        # We cast date to YYYY-MM string for grouping
        # SQLite vs Postgres: Postgres uses to_char. 
        # Assuming Postgres as per requirements.
        month_col = func.to_char(Transaction.date, 'YYYY-MM')
        
        stmt = (
            select(
                month_col.label('month'),
                func.sum(Transaction.amount).label('total')
            )
            .where(
                Transaction.user_phone == user_phone,
                Transaction.date >= start_date
            )
            .group_by(month_col)
            .order_by(month_col)
        )
        result = await self.session.execute(stmt)
        return result.all()
