from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.session import get_db
from backend.db.models import Goal
from backend.core.auth import get_current_user

from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
import uuid

router = APIRouter(prefix="/api/goals", tags=["Goals"])

class GoalCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    deadline: Optional[datetime] = None

class GoalResponse(BaseModel):
    id: uuid.UUID
    name: str
    target_amount: float
    current_amount: float
    deadline: Optional[datetime]
    
    model_config = ConfigDict(from_attributes=True)

@router.get("/", response_model=list[GoalResponse])
async def get_goals(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(Goal).where(Goal.user_phone == current_user)
        result = await db.execute(stmt)
        return result.scalars().all()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching goals: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@router.post("/", response_model=GoalResponse)
async def create_goal(
    goal_data: GoalCreate,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_goal = Goal(
        user_phone=current_user,
        name=goal_data.name,
        target_amount=goal_data.target_amount,
        current_amount=goal_data.current_amount,
        deadline=goal_data.deadline
    )
    db.add(new_goal)
    await db.commit()
    await db.refresh(new_goal)
    return new_goal

@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: str,
    goal_data: GoalCreate,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Goal).where(
        Goal.id == uuid.UUID(goal_id),
        Goal.user_phone == current_user
    )
    result = await db.execute(stmt)
    goal = result.scalar_one_or_none()
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    goal.name = goal_data.name
    goal.target_amount = goal_data.target_amount
    goal.current_amount = goal_data.current_amount
    goal.deadline = goal_data.deadline
    
    await db.commit()
    await db.refresh(goal)
    return goal

@router.delete("/{goal_id}")
async def delete_goal(
    goal_id: str,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Goal).where(
        Goal.id == uuid.UUID(goal_id),
        Goal.user_phone == current_user
    )
    result = await db.execute(stmt)
    goal = result.scalar_one_or_none()
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
        
    await db.delete(goal)
    await db.commit()
    return {"message": "Goal deleted"}
