from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import random
import logging
from backend.core import clients # Use shared clients
from backend.core.auth import create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)

class LoginRequest(BaseModel):
    phone_number: str

class VerifyOTPRequest(BaseModel):
    phone_number: str
    code: str

@router.post("/request-otp")
async def request_otp(data: LoginRequest):
    """
    Passo 1: Recebe o telefone, gera código e envia no WhatsApp.
    """
    # 1. Gerar Código de 6 dígitos
    otp_code = str(random.randint(100000, 999999))
    logger.info(f"Gerando OTP para {data.phone_number}: {otp_code}")
    
    # 2. Salvar no Redis (Expira em 5 minutos / 300 segundos)
    # Chave: "otp:5511999999999" -> Valor: "123456"
    if clients.redis_client:
        await clients.redis_client.set(f"otp:{data.phone_number}", otp_code, ex=300)
    else:
        raise HTTPException(status_code=500, detail="Redis indisponível")

    # 3. Enviar via WhatsApp
    message_text = f"🔐 Seu código de acesso ao Cortex Brasil: *{otp_code}*\n\nNão compartilhe com ninguém."
    
    response = await clients.whatsapp_client.send_text_message(
        to=data.phone_number,
        body=message_text
    )
    
    if not response:
        # Em DEV, se não tiver WhatsApp configurado, logo
        logger.warning("Falha ao enviar WhatsApp. Verifique credenciais.")
        # Não raise error em dev para facilitar testes de API via swagger se precisar
        # raise HTTPException(status_code=500, detail="Falha ao enviar mensagem no WhatsApp")

    return {
        "message": "Código enviado para o WhatsApp.",
        "instruction": "Caso não receba o código, envie um 'Oi' para o bot no WhatsApp e tente novamente (Janela de 24h)."
    }

@router.post("/verify-otp")
async def verify_otp(data: VerifyOTPRequest):
    """
    Passo 2: Valida o código e retorna o Token JWT.
    """
    if not clients.redis_client:
         raise HTTPException(status_code=500, detail="Redis indisponível")

    # 1. Buscar código no Redis
    stored_code = await clients.redis_client.get(f"otp:{data.phone_number}")
    
    if not stored_code:
        raise HTTPException(status_code=400, detail="Código expirado ou inválido.")
    
    # 2. Verificar igualdade
    if stored_code != data.code:
        raise HTTPException(status_code=400, detail="Código incorreto.")
    
    # 3. Código correto! Remover do Redis (para não usar 2x)
    await clients.redis_client.delete(f"otp:{data.phone_number}")
    
    # 4. Gerar Token JWT
    from datetime import timedelta
    from backend.core.auth import ACCESS_TOKEN_EXPIRE_MINUTES
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": data.phone_number}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": data.phone_number
    }
