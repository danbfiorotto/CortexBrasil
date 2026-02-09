from typing import Optional
import redis.asyncio as redis
from backend.core.whatsapp import WhatsAppClient
from backend.core.llm import LLMClient
from backend.core.audio import AudioTranscriber

# Global Clients
redis_client: Optional[redis.Redis] = None
whatsapp_client: Optional[WhatsAppClient] = None
llm_client: Optional[LLMClient] = None
audio_transcriber: Optional[AudioTranscriber] = None
