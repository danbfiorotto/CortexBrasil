from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel, Field
from backend.core.auth import get_current_user
from backend.db.session import get_db
from backend.core.ledger import LedgerService
from sqlalchemy.ext.asyncio import AsyncSession
import logging

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])
logger = logging.getLogger(__name__)


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

    # Check for duplicate name
    existing = await ledger.get_account_by_name(current_user_phone, payload.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"Conta '{payload.name}' já existe.")

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
