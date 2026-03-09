from fastapi import FastAPI, Request, Response, HTTPException, Depends, BackgroundTasks
from backend.core.config import settings
from backend.core.whatsapp import WhatsAppClient
from backend.core.llm import LLMClient
from backend.core.audio import AudioTranscriber
from backend.db.session import engine, Base, get_db
from backend.core.repository import TransactionRepository
from backend.workers.benchmark_fetcher import fetch_all_benchmarks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from contextlib import asynccontextmanager
import asyncio
import hashlib
import hmac
import logging
import json
import redis.asyncio as redis
import os
import tempfile

# Shared Clients
from backend.core import clients
from backend.api import auth, dashboard, budgets, goals, accounts, analytics, settings as settings_api

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("app_logs.txt", encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)
logger.info("🚀 Cortex Backend Starting Up...")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Clients in Shared Module
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    clients.redis_client = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    
    clients.whatsapp_client = WhatsAppClient()
    clients.llm_client = LLMClient()
    
    # Initialize Audio Transcriber
    logger.info("⏳ Loading Whisper Model...")
    clients.audio_transcriber = AudioTranscriber()
    logger.info("✅ Whisper Model Loaded.")

    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Apply balance trigger migration (idempotent - safe to run multiple times)
    migration_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "006_fix_balance_trigger_with_update.sql")
    if os.path.exists(migration_path):
        async with engine.begin() as conn:
            with open(migration_path, "r") as f:
                sql = f.read()
            # asyncpg requires single-statement execution; use raw connection
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ Balance trigger migration applied (006)")

    # Recalculate all account balances (idempotent - fixes any drift)
    migration_007_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "007_recalculate_all_balances.sql")
    if os.path.exists(migration_007_path):
        async with engine.begin() as conn:
            with open(migration_007_path, "r") as f:
                sql = f.read()
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ Balance recalculation migration applied (007)")

    # Add unique constraint on (user_phone, name, type) to allow same name for different account types
    migration_008_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "008_unique_account_name_per_type.sql")
    if os.path.exists(migration_008_path):
        async with engine.begin() as conn:
            with open(migration_008_path, "r") as f:
                sql = f.read()
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ Account name uniqueness per type migration applied (008)")

    # Apply investment performance history tables migration
    migration_009_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "009_investment_performance_history.sql")
    if os.path.exists(migration_009_path):
        async with engine.begin() as conn:
            with open(migration_009_path, "r") as f:
                sql = f.read()
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ Investment performance history migration applied (009)")

    # Add is_active column to accounts (soft delete support)
    migration_010_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "010_add_is_active_to_accounts.sql")
    if os.path.exists(migration_010_path):
        async with engine.begin() as conn:
            with open(migration_010_path, "r") as f:
                sql = f.read()
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ is_active column migration applied (010)")

    # Add purchased_at column to assets table
    migration_011_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "011_add_purchased_at_to_assets.sql")
    if os.path.exists(migration_011_path):
        async with engine.begin() as conn:
            with open(migration_011_path, "r") as f:
                sql = f.read()
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ purchased_at column migration applied (011)")

    # Only cleared transactions affect balance (is_cleared = FALSE means pending/unpaid)
    migration_012_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "012_is_cleared_affects_balance.sql")
    if os.path.exists(migration_012_path):
        async with engine.begin() as conn:
            with open(migration_012_path, "r") as f:
                sql = f.read()
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ is_cleared balance logic migration applied (012)")

    # Populate benchmark history in background (idempotent - only inserts missing dates)
    asyncio.create_task(fetch_all_benchmarks())
    logger.info("⏳ Benchmark history fetch started in background")

    yield
    # Close Redis
    if clients.redis_client:
        await clients.redis_client.close()

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Cortex Brasil", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming Request: {request.method} {request.url}")
    logger.info(f"Headers: Origin={request.headers.get('origin')}, Host={request.headers.get('host')}")
    response = await call_next(request)
    return response

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://cortexbrasil.com.br",
    "https://www.cortexbrasil.com.br",
    "https://cortex-brasil.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(budgets.router)
app.include_router(goals.router)
app.include_router(accounts.router)
app.include_router(analytics.router)
app.include_router(settings_api.router)


@app.get("/")
async def root():
    return {"message": "Cortex Brasil API is running"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/webhook")
async def verify_webhook(request: Request):
    """
    Verifies the webhook subscription with Meta.
    """
    hub_mode = request.query_params.get("hub.mode")
    hub_challenge = request.query_params.get("hub.challenge")
    hub_verify_token = request.query_params.get("hub.verify_token")

    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        logger.info(f"Webhook verified successfully. Challenge: {hub_challenge}")
        from fastapi.responses import Response
        return Response(content=hub_challenge, media_type="text/plain")
    
    logger.error("Webhook verification failed.")
    raise HTTPException(status_code=403, detail="Verification failed")

async def process_whatsapp_message(message_body: str, phone_number: str, message_id: str, db: AsyncSession):
    """
    Background task to process the message with LLM and save to DB.
    """
    try:
        logger.info(f"🔄 Processando mensagem em background: {message_body}")
        
        from sqlalchemy import text
        
        from backend.core.ledger import LedgerService
        
        # 1. Recuperar Contexto (RAG + Saldos)
        context_str = ""
        from backend.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            # RLS: Set current user context
            await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})
            
            ledger = LedgerService(session)
            
            # Get Account Balances
            accounts = await ledger.get_accounts(phone_number)
            if accounts:
                context_str += "💰 Saldos Atuais:\n"
                for acc in accounts:
                    context_str += f"- {acc.name}: R$ {acc.current_balance:.2f}\n"
                context_str += "\n"

            # Get Recent Transactions (using raw repo for now or add to ledger)
            # Ideally LedgerService should handle this too, but keeping minimal changes
            from backend.core.repository import TransactionRepository
            repo = TransactionRepository(session)
            recent_txs = await repo.get_recent_transactions(phone_number, limit=15)
            
            if recent_txs:
                context_str += "📜 Histórico Recente:\n"
                for tx in recent_txs:
                    date_str = tx.date.strftime("%d/%m") if tx.date else "Data desc."
                    # Use emoji for type if available, fallback to sign
                    sign = "-" if tx.type == "EXPENSE" else "+"
                    context_str += f"- {date_str}: {sign} R$ {tx.amount} ({tx.category}) - {tx.description}\n"
            else:
                context_str += "Nenhuma transação anterior encontrada."

        # 2. Processa com IA (com Contexto)
        try:
            llm_response_str = await clients.llm_client.process_message(message_body, context_data=context_str)
            logger.info(f"🧠 Raciocínio da IA: {llm_response_str}")
            
            reply_text = "Recebido." # Default

            # Tenta fazer parse do JSON (o LLM pode retornar texto as vezes)
            try:
                llm_data = json.loads(llm_response_str)
                reply_text = llm_data.get("reply_text", "Recebido.")
                
                # Persistência de Dados
                action = llm_data.get("action")
                if action == "log_transaction" and "data" in llm_data:
                    data = llm_data["data"]
                    # Validate data integrity - simple check
                    if data and data.get("amount"):
                        # Re-instantiate session for DB operations
                         async with AsyncSessionLocal() as session:
                            await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})
                            ledger = LedgerService(session)
                            
                            await ledger.register_transaction(
                                user_phone=phone_number,
                                amount=data.get("amount"),
                                category=data.get("category"),
                                description=data.get("description"),
                                tx_type=data.get("type", "EXPENSE"),
                                account_name=data.get("account_name"),
                                destination_account_name=data.get("destination_account_name"),
                                installments=data.get("installments")
                            )
                            await session.commit()
                            logger.info(f"✅ Transação salva no Ledger para {phone_number}")

            except json.JSONDecodeError:
                # Fallback se o LLM não retornar JSON válido
                logger.warning("IA não retornou JSON válido. Usando texto bruto.")
                reply_text = llm_response_str
                llm_data = {} # Handle unstructured response
            except Exception as e:
                logger.error(f"Erro de persistência: {e}") 
                reply_text = "Tive um erro ao salvar os dados."

        except Exception as e:
            logger.error(f"Erro no processamento da IA: {e}")
            reply_text = "Estou com uma breve enxaqueca digital. Tente novamente em instantes."

        # Envia resposta
        logger.info(f"📤 Preparando para enviar resposta de {phone_number}. APP_ENV={settings.APP_ENV}")
        if settings.APP_ENV == "development": 
            logger.info(f"🚀 Enviando resposta via WhatsApp para {phone_number}")
            await clients.whatsapp_client.send_text_message(
                to=phone_number, 
                body=reply_text,
                reply_to_message_id=message_id
            )
        else:
            logger.warning(f"⚠️ Resposta não enviada porque APP_ENV={settings.APP_ENV} (não é 'development')")

    except Exception as e:
         logger.error(f"FATAL Background Error: {e}")

async def process_audio_message(media_id: str, phone_number: str, message_id: str):
    """
    Downloads audio, transcribes it, and triggers text processing.
    """
    try:
        logger.info(f"🎙️ Processando áudio ID: {media_id}")
        
        # 1. Get URL
        media_url = await clients.whatsapp_client.get_media_url(media_id)
        if not media_url:
            logger.error("Falha ao obter URL de mídia.")
            return

        # 2. Download Content
        audio_bytes = await clients.whatsapp_client.download_media(media_url)
        if not audio_bytes:
            logger.error("Falha ao baixar conteúdo de mídia.")
            return
            
        # 3. Save to Temp File
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as temp_audio:
            temp_audio.write(audio_bytes)
            temp_file_path = temp_audio.name
            
        try:
            # 4. Transcribe
            logger.info("Transcrevendo áudio...")
            transcription = clients.audio_transcriber.transcribe(temp_file_path)
            logger.info(f"📝 Transcrição: {transcription}")
            
            # 5. Pipeline -> Text Processing
            # We explicitly mention it's a transcription
            final_text = f"[Transcrição de Áudio]: {transcription}"
            await process_whatsapp_message(final_text, phone_number, message_id, None)
            
        finally:
            # Cleanup
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    except Exception as e:
        logger.error(f"Erro no processamento de áudio: {e}")
        await clients.whatsapp_client.send_text_message(phone_number, "Tive um problema para ouvir seu áudio.", message_id)

from backend.core.security import verify_signature

@app.post("/webhook", dependencies=[Depends(verify_signature)])
async def handle_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Recebe mensagens do WhatsApp e extrai o conteúdo.
    """
    try:
        payload = await request.json()
        logger.info(f"📦 Webhook Payload Recebido: {json.dumps(payload)}")

        # Navega no JSON complexo do WhatsApp para achar a mensagem
        if not payload.get("entry"):
            logger.warning("⚠️ Payload recebido sem 'entry'")
            return Response(status_code=200)

        entry = payload.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        
        # Verifica se é uma mensagem real (às vezes é só status de "lido")
        if "messages" in value:
            messages = value.get("messages", [])
            if not messages:
               return Response(status_code=200)
               
            message_data = messages[0]
            phone_number = message_data["from"] # Quem enviou
            msg_type = message_data["type"]
            message_id = message_data["id"]
            
            # Deduplication Check
            if clients.redis_client:
                is_processed = await clients.redis_client.get(f"msg:{message_id}")
                if is_processed:
                    logger.warning(f"⚠️ Mensagem duplicada detectada e ignorada: {message_id}")
                    return Response(status_code=200)
                
                # Mark as processed with 10 min expiry
                await clients.redis_client.set(f"msg:{message_id}", "1", ex=600)

            # --- TEXT MESSAGE ---
            if msg_type == "text":
                message_body = message_data["text"]["body"]
                logger.info(f"📩 MENSAGEM RECEBIDA (Texto): {message_body}")
                background_tasks.add_task(process_whatsapp_message, message_body, phone_number, message_id, None)
                
            # --- AUDIO/VOICE MESSAGE ---
            elif msg_type == "audio" or msg_type == "voice":
                logger.info(f"🎙️ MENSAGEM DE ÁUDIO RECEBIDA")
                media_id = message_data.get("audio", {}).get("id") or message_data.get("voice", {}).get("id")
                
                if media_id:
                     background_tasks.add_task(process_audio_message, media_id, phone_number, message_id)
                else:
                    logger.error("Audio ID not found in payload.")

            else:
                logger.info(f"Recebido formato não-suportado: {msg_type}")

        return Response(status_code=200)

    except Exception as e:
        logger.error(f"Erro ao processar webhook: {str(e)}")
        # Sempre retorne 200 para o WhatsApp não ficar tentando reenviar
        return Response(status_code=200)
