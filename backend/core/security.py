from fastapi import Request, HTTPException, Security
from backend.core.config import settings
import hmac
import hashlib
import logging

logger = logging.getLogger(__name__)

async def verify_signature(request: Request):
    """
    Validates the X-Hub-Signature-256 header sent by WhatsApp.
    This ensures the request actually came from Meta.
    """
    signature = request.headers.get("X-Hub-Signature-256")
    
    # If no secret is configured, we might skip validation (Development only)
    # But for security phase, we should enforce it if set.
    if not settings.WHATSAPP_API_SECRET:
        logger.warning("WHATSAPP_API_SECRET not set. Skipping signature verification.")
        return True

    if not signature:
        logger.error("Missing X-Hub-Signature-256 header")
        raise HTTPException(status_code=403, detail="Missing signature header")

    # The header is in format: sha256=<sig>
    if not signature.startswith("sha256="):
        logger.error("Invalid signature format")
        raise HTTPException(status_code=403, detail="Invalid signature format")

    expected_sig = signature.split("=")[1]
    
    # Read the raw body
    body = await request.body()
    
    # Calculate HMAC
    calculated_sig = hmac.new(
        settings.WHATSAPP_API_SECRET.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(expected_sig, calculated_sig):
        logger.error(f"Signature mismatch! Expected: {expected_sig}, Calculated: {calculated_sig}")
        raise HTTPException(status_code=403, detail="Invalid signature")
    
    return True
