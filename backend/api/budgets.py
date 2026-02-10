from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.session import get_db
from backend.db.models import Budget
from backend.core.auth import get_current_user
from pydantic import BaseModel, ConfigDict
import uuid

router = APIRouter(prefix="/api/budgets", tags=["Budgets"])

class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: str # YYYY-MM

class BudgetResponse(BaseModel):
    id: uuid.UUID
    category: str
    amount: float
    month: str

    model_config = ConfigDict(from_attributes=True)

@router.get("/", response_model=list[BudgetResponse])
async def get_budgets(
    month: str,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Budget).where(
        Budget.user_phone == current_user,
        Budget.month == month
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=BudgetResponse)
async def create_or_update_budget(
    budget_data: BudgetCreate,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if exists
    stmt = select(Budget).where(
        Budget.user_phone == current_user,
        Budget.category == budget_data.category,
        Budget.month == budget_data.month
    )
    result = await db.execute(stmt)
    existing_budget = result.scalar_one_or_none()
    
    if existing_budget:
        existing_budget.amount = budget_data.amount
        await db.commit()
        await db.refresh(existing_budget)
        return existing_budget
    else:
        new_budget = Budget(
            user_phone=current_user,
            category=budget_data.category,
            amount=budget_data.amount,
            month=budget_data.month
        )
        db.add(new_budget)
        await db.commit()
        await db.refresh(new_budget)
        return new_budget

@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: str,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Budget).where(
        Budget.id == uuid.UUID(budget_id),
        Budget.user_phone == current_user
    )
    result = await db.execute(stmt)
    budget = result.scalar_one_or_none()
    
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
        
    await db.delete(budget)
    await db.commit()
    return {"message": "Budget deleted"}
