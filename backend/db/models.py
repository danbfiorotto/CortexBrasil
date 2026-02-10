from sqlalchemy import Column, String, Float, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from backend.db.session import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_phone = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # CHECKING, CREDIT, INVESTMENT, CASH
    initial_balance = Column(Float, default=0.0)
    current_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_phone = Column(String, index=True, nullable=False)
    account_id = Column(UUID(as_uuid=True), nullable=True) # ForeignKey would be better but keeping simple for now
    destination_account_id = Column(UUID(as_uuid=True), nullable=True) # For transfers
    type = Column(String, default="EXPENSE") # EXPENSE, INCOME, TRANSFER
    amount = Column(Float, nullable=True)
    category = Column(String, nullable=True)
    description = Column(String, nullable=True)
    date = Column(DateTime, nullable=True)
    raw_message = Column(String, nullable=True)
    
    # Installments logic
    installments_count = Column(Integer, nullable=True) # Total parcelas (e.g. 10)
    installment_number = Column(Integer, nullable=True) # Atual (e.g. 1)
    group_id = Column(UUID(as_uuid=True), nullable=True) # ID comum para todas as parcelas
    
    created_at = Column(DateTime, default=datetime.utcnow)

from sqlalchemy import UniqueConstraint

class Budget(Base):
    __tablename__ = "budgets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_phone = Column(String, index=True, nullable=False)
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    month = Column(String, nullable=False) # Format: "YYYY-MM"
    
    # Unique constraint to prevent duplicate budgets for same category/month
    __table_args__ = (
        UniqueConstraint('user_phone', 'category', 'month', name='uix_budget_user_category_month'),
    )

class Goal(Base):
    __tablename__ = "goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_phone = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0.0)
    deadline = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
