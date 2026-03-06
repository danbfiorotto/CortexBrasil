from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text, insert, select
from pydantic import BaseModel, Field
from typing import Optional
from backend.core.auth import get_current_user
from backend.db.session import get_db
from backend.core.ledger import LedgerService
from backend.db.models import Transaction, Account
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import uuid
import logging

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])
logger = logging.getLogger(__name__)


class BalanceAdjust(BaseModel):
    new_balance: float
    description: Optional[str] = None


class AccountUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    credit_limit: Optional[float] = None
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    closing_day: Optional[int] = Field(default=None, ge=1, le=31)


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., pattern="^(CHECKING|CREDIT|INVESTMENT|CASH)$")
    initial_balance: float = Field(default=0.0)
    credit_limit: float = Field(default=None)
    due_day: int = Field(default=None, ge=1, le=31)
    closing_day: int = Field(default=None, ge=1, le=31)


class AccountResponse(BaseModel):
    id: str
    name: str
    type: str
    initial_balance: float
    current_balance: float
    credit_limit: float = None
    due_day: int = None
    closing_day: int = None


@router.get("/")
async def list_accounts(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns all accounts for the authenticated user."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )

    ledger = LedgerService(db)
    accounts = await ledger.get_accounts(current_user_phone)

    total_balance = sum(acc.current_balance for acc in accounts)

    return {
        "accounts": [
            {
                "id": str(acc.id),
                "name": acc.name,
                "type": acc.type,
                "initial_balance": acc.initial_balance,
                "current_balance": acc.current_balance,
                "credit_limit": acc.credit_limit,
                "due_day": acc.due_day,
                "closing_day": acc.closing_day,
            }
            for acc in accounts
        ],
        "total_balance": total_balance,
    }


@router.post("/", status_code=201)
async def create_account(
    payload: AccountCreate,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new financial account."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )

    ledger = LedgerService(db)

    # Check for duplicate name within the same account type
    existing = await ledger.get_account_by_name(current_user_phone, payload.name, payload.type)
    if existing:
        type_label = {"CHECKING": "Conta Corrente", "CREDIT": "Cartão de Crédito", "INVESTMENT": "Investimento", "CASH": "Dinheiro"}.get(payload.type, payload.type)
        raise HTTPException(status_code=409, detail=f"{type_label} '{payload.name}' já existe.")

    try:
        account = await ledger.create_account(
            user_phone=current_user_phone,
            name=payload.name,
            acc_type=payload.type,
            initial_balance=payload.initial_balance,
            credit_limit=payload.credit_limit,
            due_day=payload.due_day,
            closing_day=payload.closing_day
        )
        await db.commit()
        logger.info(f"Account '{payload.name}' created for {current_user_phone}")
    except Exception as e:
        logger.error(f"Error creating account: {str(e)}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error during account creation.")

    return {
        "id": str(account.id),
        "name": account.name,
        "type": account.type,
        "initial_balance": account.initial_balance,
        "current_balance": account.current_balance,
        "credit_limit": account.credit_limit,
        "due_day": account.due_day,
        "closing_day": account.closing_day,
    }


@router.patch("/{account_id}/balance")
async def adjust_account_balance(
    account_id: str,
    payload: BalanceAdjust,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a manual balance correction transaction for the given account."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )

    ledger = LedgerService(db)
    accounts = await ledger.get_accounts(current_user_phone)
    account = next((a for a in accounts if str(a.id) == account_id), None)

    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")
    if account.type == "CREDIT":
        raise HTTPException(status_code=400, detail="Ajuste de saldo não disponível para cartões de crédito.")

    diff = round(payload.new_balance - account.current_balance, 2)
    if diff == 0:
        return {
            "id": str(account.id),
            "name": account.name,
            "type": account.type,
            "initial_balance": account.initial_balance,
            "current_balance": account.current_balance,
            "credit_limit": account.credit_limit,
            "due_day": account.due_day,
            "closing_day": account.closing_day,
        }

    tx_type = "INCOME" if diff > 0 else "EXPENSE"
    description = payload.description or "Ajuste manual de saldo"

    await db.execute(
        insert(Transaction).values(
            id=uuid.uuid4(),
            user_phone=current_user_phone,
            account_id=uuid.UUID(account_id),
            type=tx_type,
            amount=abs(diff),
            category="Ajuste de Saldo",
            description=description,
            date=datetime.utcnow(),
            is_cleared=True,
        )
    )

    await ledger.recalculate_balances(current_user_phone)
    await db.commit()

    # Refresh account data
    accounts = await ledger.get_accounts(current_user_phone)
    account = next((a for a in accounts if str(a.id) == account_id), None)

    logger.info(f"Balance adjusted for account {account_id} by {current_user_phone}: diff={diff}")

    return {
        "id": str(account.id),
        "name": account.name,
        "type": account.type,
        "initial_balance": account.initial_balance,
        "current_balance": account.current_balance,
        "credit_limit": account.credit_limit,
        "due_day": account.due_day,
        "closing_day": account.closing_day,
    }


@router.put("/{account_id}")
async def update_account(
    account_id: str,
    payload: AccountUpdate,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates name and optional fields of an account."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )

    result = await db.execute(
        select(Account).where(
            Account.id == uuid.UUID(account_id),
            Account.user_phone == current_user_phone,
            Account.is_active == True,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")

    # Check for name conflict (excluding self)
    ledger = LedgerService(db)
    existing = await ledger.get_account_by_name(current_user_phone, payload.name, account.type)
    if existing and str(existing.id) != account_id:
        raise HTTPException(status_code=409, detail=f"Já existe uma conta com o nome '{payload.name}'.")

    account.name = payload.name
    if payload.credit_limit is not None:
        account.credit_limit = payload.credit_limit
    if payload.due_day is not None:
        account.due_day = payload.due_day
    if payload.closing_day is not None:
        account.closing_day = payload.closing_day

    await db.commit()
    await db.refresh(account)
    logger.info(f"Account {account_id} updated by {current_user_phone}")

    return {
        "id": str(account.id),
        "name": account.name,
        "type": account.type,
        "initial_balance": account.initial_balance,
        "current_balance": account.current_balance,
        "credit_limit": account.credit_limit,
        "due_day": account.due_day,
        "closing_day": account.closing_day,
    }


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: str,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Soft-deletes an account. Past transactions are preserved; new ones cannot be added."""
    await db.execute(
        text("SELECT set_config('app.current_user_phone', :phone, false)"),
        {"phone": current_user_phone}
    )

    result = await db.execute(
        select(Account).where(
            Account.id == uuid.UUID(account_id),
            Account.user_phone == current_user_phone,
            Account.is_active == True,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")

    account.is_active = False
    await db.commit()
    logger.info(f"Account {account_id} soft-deleted by {current_user_phone}")
