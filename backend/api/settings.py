from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
import random
import logging
from backend.core.auth import get_current_user
from backend.db.session import get_db
from backend.core import clients
from backend.db.models import Transaction, Budget, Goal, Account, UserProfile

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
        # Wipe all data
        await db.execute(delete(Transaction).where(Transaction.user_phone == current_user_phone))
        await db.execute(delete(Budget).where(Budget.user_phone == current_user_phone))
        await db.execute(delete(Goal).where(Goal.user_phone == current_user_phone))
        await db.execute(delete(Account).where(Account.user_phone == current_user_phone))
        await db.execute(delete(UserProfile).where(UserProfile.user_phone == current_user_phone))
        
        await db.commit()
        
        # Cleanup Redis
        await clients.redis_client.delete(redis_key)
        
        logger.info(f"Account data wiped for user: {current_user_phone}")
        return {"message": "Account data successfully deleted"}
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting account data: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro ao deletar dados da conta")
