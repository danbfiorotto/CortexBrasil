from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, update, text
import random
import logging
from backend.core.auth import get_current_user
from backend.db.session import get_db
from backend.core import clients
from backend.db.models import Transaction, Budget, Goal, Account, UserProfile
from backend.core.ledger import LedgerService

router = APIRouter(prefix="/api/settings", tags=["Settings"])
logger = logging.getLogger(__name__)

CONFIRMATION_PHRASE = "tenho certeza"

@router.post("/delete-request")
async def delete_account_request(
    current_user_phone: str = Depends(get_current_user)
):
    """
    Generates an OTP and sends it via WhatsApp.
    """
    if not clients.redis_client:
        raise HTTPException(status_code=500, detail="Redis client not initialized")
    
    otp = f"{random.randint(100000, 999999)}"
    
    # Store OTP in Redis for 5 minutes
    redis_key = f"delete_otp:{current_user_phone}"
    await clients.redis_client.set(redis_key, otp, ex=300)
    
    # Send via WhatsApp
    message = f"Cortex: Seu código de verificação para EXCLUSÃO DE CONTA é *{otp}*.\n\nEste código expira em 5 minutos. Se você não solicitou isso, ignore esta mensagem."
    
    await clients.whatsapp_client.send_text_message(
        to=current_user_phone,
        body=message
    )
    
    logger.info(f"Delete OTP sent to {current_user_phone}")
    return {"message": "Verification code sent to WhatsApp"}

@router.post("/delete-confirm")
async def delete_account_confirm(
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Verifies OTP and phrase, then wipes all user data.
    """
    otp_input = payload.get("otp")
    phrase_input = payload.get("phrase", "").lower().strip()
    
    if phrase_input != CONFIRMATION_PHRASE:
        raise HTTPException(status_code=400, detail="Frase de confirmação incorreta")
    
    if not clients.redis_client:
        raise HTTPException(status_code=500, detail="Redis client not initialized")
    
    redis_key = f"delete_otp:{current_user_phone}"
    saved_otp = await clients.redis_client.get(redis_key)
    
    if not saved_otp or saved_otp != otp_input:
        raise HTTPException(status_code=400, detail="Código de verificação inválido ou expirado")
    
    try:
        phone = current_user_phone

        # Wipe all user data (ORM models + raw SQL tables without ORM models)
        await db.execute(delete(Transaction).where(Transaction.user_phone == phone))
        await db.execute(delete(Budget).where(Budget.user_phone == phone))
        await db.execute(delete(Goal).where(Goal.user_phone == phone))
        await db.execute(delete(Account).where(Account.user_phone == phone))
        await db.execute(delete(UserProfile).where(UserProfile.user_phone == phone))
        await db.execute(text("DELETE FROM assets WHERE user_phone = :phone"), {"phone": phone})
        await db.execute(text("DELETE FROM category_learning WHERE user_phone = :phone"), {"phone": phone})
        await db.execute(text("DELETE FROM net_worth_history WHERE user_phone = :phone"), {"phone": phone})
        await db.execute(text("DELETE FROM investment_snapshots WHERE user_phone = :phone"), {"phone": phone})

        # Recreate blank profile (onboarding not completed)
        new_profile = UserProfile(
            user_phone=phone,
            onboarding_completed=0,
        )
        db.add(new_profile)
        await db.flush()

        # Recreate default "Carteira" account
        ledger = LedgerService(db)
        await ledger.create_account(
            user_phone=phone,
            name="Carteira",
            acc_type="CASH",
            initial_balance=0.0,
        )

        await db.commit()

        # Cleanup Redis
        await clients.redis_client.delete(redis_key)

        logger.info(f"Account data reset for user: {phone}")
        return {"message": "Account data successfully reset"}

    except Exception as e:
        await db.rollback()
        logger.error(f"Error resetting account data: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro ao resetar dados da conta")


@router.get("/categories")
async def get_user_categories(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns all distinct categories for the current user (from transactions + custom)."""
    import json
    from sqlalchemy import text
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})

    # Categories from transactions
    result = await db.execute(
        select(Transaction.category)
        .where(Transaction.category != None, Transaction.user_phone == current_user_phone)
        .distinct()
    )
    tx_categories = {row[0] for row in result.fetchall()}

    # Custom categories from user profile
    profile_result = await db.execute(
        select(UserProfile.custom_categories).where(UserProfile.user_phone == current_user_phone)
    )
    row = profile_result.scalar_one_or_none()
    custom = set()
    if row:
        try:
            custom = set(json.loads(row))
        except (json.JSONDecodeError, TypeError):
            pass

    all_categories = sorted(tx_categories | custom)
    return {"categories": all_categories}


@router.post("/categories")
async def create_category(
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Creates a new custom category.
    Payload: {"name": "Vestuário"}
    """
    import json
    from sqlalchemy import text
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})

    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    # Check if already exists in transactions
    existing = await db.execute(
        select(Transaction.id)
        .where(Transaction.user_phone == current_user_phone, Transaction.category == name)
        .limit(1)
    )
    if existing.first() is not None:
        raise HTTPException(status_code=409, detail="Essa categoria já existe nas suas transações")

    # Load profile
    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_phone == current_user_phone)
    )
    profile = profile_result.scalar_one_or_none()

    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")

    custom = []
    if profile.custom_categories:
        try:
            custom = json.loads(profile.custom_categories)
        except (json.JSONDecodeError, TypeError):
            custom = []

    if name in custom:
        raise HTTPException(status_code=409, detail="Essa categoria já existe")

    custom.append(name)
    profile.custom_categories = json.dumps(custom)
    await db.commit()

    return {"status": "success", "category": name}


@router.put("/categories")
async def rename_category(
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Renames a category across all transactions and budgets for the user.
    Payload: {"old_name": "Roupa", "new_name": "Vestuário"}
    """
    from sqlalchemy import text
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})

    old_name = payload.get("old_name", "").strip()
    new_name = payload.get("new_name", "").strip()

    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="old_name and new_name are required")

    if old_name == new_name:
        raise HTTPException(status_code=400, detail="New name must be different from old name")

    # Check if new_name already exists (would merge categories)
    existing = await db.execute(
        select(Transaction.id)
        .where(Transaction.user_phone == current_user_phone, Transaction.category == new_name)
        .limit(1)
    )
    merge = existing.first() is not None

    # Update all transactions
    tx_result = await db.execute(
        update(Transaction)
        .where(Transaction.user_phone == current_user_phone, Transaction.category == old_name)
        .values(category=new_name)
    )

    # Update all budgets
    budget_result = await db.execute(
        update(Budget)
        .where(Budget.user_phone == current_user_phone, Budget.category == old_name)
        .values(category=new_name)
    )

    # Update custom_categories list if the old name was there
    import json
    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_phone == current_user_phone)
    )
    profile = profile_result.scalar_one_or_none()
    if profile and profile.custom_categories:
        try:
            custom = json.loads(profile.custom_categories)
            if old_name in custom:
                custom = [new_name if c == old_name else c for c in custom]
                # Remove duplicates
                custom = list(dict.fromkeys(custom))
                profile.custom_categories = json.dumps(custom)
        except (json.JSONDecodeError, TypeError):
            pass

    await db.commit()

    return {
        "status": "success",
        "transactions_updated": tx_result.rowcount,
        "budgets_updated": budget_result.rowcount,
        "merged": merge
    }


@router.delete("/categories")
async def delete_category(
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Removes a category from all transactions (sets to 'Outros') and deletes related budgets.
    Payload: {"name": "Roupa"}
    """
    from sqlalchemy import text
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})

    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    # Set transactions to "Outros"
    tx_result = await db.execute(
        update(Transaction)
        .where(Transaction.user_phone == current_user_phone, Transaction.category == name)
        .values(category="Outros")
    )

    # Delete budgets for this category
    budget_result = await db.execute(
        delete(Budget)
        .where(Budget.user_phone == current_user_phone, Budget.category == name)
    )

    # Remove from custom_categories if present
    import json
    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_phone == current_user_phone)
    )
    profile = profile_result.scalar_one_or_none()
    if profile and profile.custom_categories:
        try:
            custom = json.loads(profile.custom_categories)
            if name in custom:
                custom.remove(name)
                profile.custom_categories = json.dumps(custom)
        except (json.JSONDecodeError, TypeError):
            pass

    await db.commit()

    return {
        "status": "success",
        "transactions_updated": tx_result.rowcount,
        "budgets_deleted": budget_result.rowcount
    }
