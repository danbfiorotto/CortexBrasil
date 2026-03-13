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
from datetime import datetime
from uuid import UUID

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
    clients.audio_transcriber = AudioTranscriber(model_size="large-v3", device="cpu", compute_type="int8")
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

    # Add custom_categories column to user_profiles
    migration_013_path = os.path.join(os.path.dirname(__file__), "db", "migrations", "013_add_custom_categories_to_profiles.sql")
    if os.path.exists(migration_013_path):
        async with engine.begin() as conn:
            with open(migration_013_path, "r") as f:
                sql = f.read()
            raw = await conn.get_raw_connection()
            await raw.driver_connection.execute(sql)
            logger.info("✅ custom_categories column migration applied (013)")

    # Populate benchmark history in background (idempotent - only inserts missing dates)
    asyncio.create_task(fetch_all_benchmarks())
    logger.info("⏳ Benchmark history fetch started in background")

    # Pre-populate symbol caches (Binance, CoinGecko, Brapi) in background
    from backend.integrations.symbol_cache import warm_up_caches
    asyncio.create_task(warm_up_caches())
    logger.info("⏳ Symbol cache warm-up started in background")

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

CONFIRM_KEYWORDS = {"sim", "ok", "confirma", "confirmado", "certo", "pode", "salva", "salvar", "yes", "s", "👍"}
CANCEL_KEYWORDS = {"não", "nao", "cancela", "cancelar", "errado", "errei", "volta", "no", "n"}

def _format_confirmation_card(data: dict) -> str:
    """Formata o card de confirmação de lançamento."""
    from datetime import datetime
    tx_type = data.get("type", "EXPENSE")
    type_label = {"EXPENSE": "Despesa 📉", "INCOME": "Receita 📈", "TRANSFER": "Transferência 🔄"}.get(tx_type, tx_type)
    amount = data.get("amount", 0)
    date_raw = data.get("date")
    try:
        date_str = datetime.fromisoformat(date_raw).strftime("%d/%m/%Y") if date_raw else datetime.now().strftime("%d/%m/%Y")
    except Exception:
        date_str = datetime.now().strftime("%d/%m/%Y")

    account = data.get("account_name") or "Carteira"
    category = data.get("category") or "—"
    description = data.get("description") or "—"
    installments = data.get("installments")
    installments_line = f"\n🔢 Parcelas: {installments}x" if installments and installments > 1 else ""
    dest = data.get("destination_account_name")
    dest_line = f"\n➡️ Destino: {dest}" if dest else ""

    return (
        f"📋 *Confirmar lançamento?*\n\n"
        f"📅 Data: {date_str}\n"
        f"📝 Descrição: {description}\n"
        f"🏦 Conta: {account}{dest_line}\n"
        f"🏷️ Categoria: {category}\n"
        f"💰 Valor: R$ {amount:,.2f}\n"
        f"📊 Tipo: {type_label}{installments_line}\n\n"
        f"Responda *sim/ok* para confirmar ou *não/cancela* para cancelar.\n"
        f"_(ou reaja com 👍 para confirmar)_"
    )

async def _get_conv_state(phone: str) -> dict:
    """Busca estado da conversa no Redis."""
    if not clients.redis_client:
        return {}
    raw = await clients.redis_client.get(f"conv:{phone}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return {}

async def _set_conv_state(phone: str, state: dict, ttl: int = 300):
    """Salva estado da conversa no Redis."""
    if clients.redis_client:
        await clients.redis_client.set(f"conv:{phone}", json.dumps(state), ex=ttl)

async def _clear_conv_state(phone: str):
    """Remove estado da conversa do Redis."""
    if clients.redis_client:
        await clients.redis_client.delete(f"conv:{phone}")

async def _send_whatsapp(phone: str, body: str, reply_to: str = None):
    """Envia mensagem WhatsApp respeitando APP_ENV."""
    if settings.APP_ENV == "development":
        await clients.whatsapp_client.send_text_message(to=phone, body=body, reply_to_message_id=reply_to)
    else:
        logger.warning(f"⚠️ Resposta não enviada (APP_ENV={settings.APP_ENV}): {body[:80]}")

async def _send_confirmation_card(phone: str, data: dict):
    """Envia o card de confirmação com botões interativos."""
    card_text = _format_confirmation_card(data)
    if settings.APP_ENV == "development":
        await clients.whatsapp_client.send_interactive_buttons(
            to=phone,
            body=card_text,
            buttons=[
                {"id": "btn_confirm", "title": "✅ Confirmar"},
                {"id": "btn_edit",    "title": "✏️ Editar"},
                {"id": "btn_cancel",  "title": "❌ Cancelar"},
            ]
        )
    else:
        logger.warning(f"⚠️ Card de confirmação não enviado (APP_ENV={settings.APP_ENV})")

async def _send_edit_field_list(phone: str):
    """Envia lista de campos editáveis."""
    if settings.APP_ENV == "development":
        await clients.whatsapp_client.send_interactive_list(
            to=phone,
            header="✏️ O que deseja corrigir?",
            body="Selecione o campo que quer alterar:",
            button_label="Ver campos",
            sections=[{
                "title": "Campos do lançamento",
                "rows": [
                    {"id": "edit_amount",      "title": "💰 Valor"},
                    {"id": "edit_category",    "title": "🏷️ Categoria"},
                    {"id": "edit_account",     "title": "🏦 Conta"},
                    {"id": "edit_description", "title": "📝 Descrição"},
                    {"id": "edit_date",        "title": "📅 Data"},
                    {"id": "edit_type",        "title": "📊 Tipo (despesa/receita)"},
                ]
            }]
        )
    else:
        logger.warning(f"⚠️ Lista de edição não enviada (APP_ENV={settings.APP_ENV})")

async def _send_account_disambiguation(phone: str, accounts: list, message_id: str):
    """Pergunta ao usuário qual conta usar quando há múltiplas correspondências."""
    if settings.APP_ENV == "development":
        rows = [{"id": f"acct_{acc.id}", "title": acc.name} for acc in accounts[:10]]
        await clients.whatsapp_client.send_interactive_list(
            to=phone,
            header="🏦 Qual conta?",
            body="Encontrei mais de uma conta com esse nome. Qual delas?",
            button_label="Ver contas",
            sections=[{"title": "Contas disponíveis", "rows": rows}]
        )
    else:
        logger.warning(f"⚠️ Lista de desambiguação não enviada (APP_ENV={settings.APP_ENV})")

async def _confirm_and_save(phone: str, conv_state: dict, message_id: str):
    """Persiste a transação pendente e atualiza estado."""
    from backend.db.session import AsyncSessionLocal
    from backend.core.ledger import LedgerService

    data = conv_state.get("pending_tx", {})
    if not data or not data.get("amount"):
        await _send_whatsapp(phone, "Não há lançamento pendente para confirmar.", message_id)
        await _clear_conv_state(phone)
        return

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone})
            ledger = LedgerService(session)
            tx = await ledger.register_transaction(
                user_phone=phone,
                amount=data.get("amount"),
                category=data.get("category"),
                description=data.get("description"),
                tx_type=data.get("type", "EXPENSE"),
                account_name=data.get("account_name"),
                account_id=UUID(data["account_id"]) if data.get("account_id") else None,
                destination_account_name=data.get("destination_account_name"),
                installments=data.get("installments"),
            )
            await session.commit()
            tx_id = str(tx.id) if tx else None
            logger.info(f"✅ Transação salva para {phone}: {tx_id}")

        # Atualiza estado: limpa pending, guarda last_tx_id
        new_state = {"state": None, "last_tx_id": tx_id}
        await _set_conv_state(phone, new_state, ttl=600)

        amount = data.get("amount", 0)
        category = data.get("category") or "—"
        await _send_whatsapp(phone, f"✅ *Lançamento confirmado!*\nR$ {amount:,.2f} em _{category}_ registrado com sucesso.", message_id)

    except ValueError as e:
        logger.error(f"Conta inválida ao salvar transação confirmada: {e}")
        await _clear_conv_state(phone)
        await _send_whatsapp(phone, f"⚠️ {e}", message_id)
    except Exception as e:
        logger.error(f"Erro ao salvar transação confirmada: {e}")
        await _send_whatsapp(phone, "Tive um erro ao salvar o lançamento. Tente novamente.", message_id)

async def process_whatsapp_message(message_body: str, phone_number: str, message_id: str, db: AsyncSession):
    """
    Background task to process the message with LLM and save to DB.
    """
    try:
        logger.info(f"🔄 Processando mensagem em background: {message_body}")

        from backend.core.ledger import LedgerService
        from backend.db.session import AsyncSessionLocal

        # --- 1. Verificar estado da conversa ---
        conv_state = await _get_conv_state(phone_number)
        current_state = conv_state.get("state")

        # --- Estado: aguardando confirmação (fallback texto — botões são tratados em handle_interactive) ---
        if current_state == "pending_confirmation":
            msg_lower = message_body.strip().lower()
            if msg_lower in CONFIRM_KEYWORDS:
                await _confirm_and_save(phone_number, conv_state, message_id)
                return
            elif msg_lower in CANCEL_KEYWORDS:
                await _clear_conv_state(phone_number)
                await _send_whatsapp(phone_number, "❌ Lançamento cancelado.", message_id)
                return
            else:
                # Usuário digitou algo livre — reexibir card com botões
                pending_tx = conv_state.get("pending_tx", {})
                await _send_confirmation_card(phone_number, pending_tx)
                return

        # --- Estado: aguardando valor do campo a editar ---
        if current_state == "pending_field_edit":
            field = conv_state.get("editing_field")
            pending_tx = conv_state.get("pending_tx", {})

            if field:
                # Para categoria, usar o texto literal do usuário (capitalizado) sem passar pelo LLM
                if field == "category":
                    new_category = message_body.strip().capitalize()
                    pending_tx["category"] = new_category
                    async with AsyncSessionLocal() as cat_session:
                        await cat_session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})
                        from backend.db.models import UserProfile as _UP2, Transaction as _TX2
                        from sqlalchemy import select as _sel2
                        tx_cats_res2 = await cat_session.execute(
                            _sel2(_TX2.category).where(_TX2.user_phone == phone_number, _TX2.category.isnot(None)).distinct()
                        )
                        existing_cats2 = {r[0] for r in tx_cats_res2.fetchall() if r[0]}
                        prof_res2 = await cat_session.execute(_sel2(_UP2.custom_categories).where(_UP2.user_phone == phone_number))
                        prof_cats_raw2 = prof_res2.scalar_one_or_none()
                        if prof_cats_raw2:
                            try:
                                existing_cats2 |= set(json.loads(prof_cats_raw2))
                            except Exception:
                                pass

                    if new_category not in existing_cats2:
                        new_state = {
                            "state": "pending_category",
                            "suggested_category": new_category,
                            "pending_tx": pending_tx,
                            "last_tx_id": conv_state.get("last_tx_id"),
                        }
                        await _set_conv_state(phone_number, new_state)
                        await _send_whatsapp(
                            phone_number,
                            f"❓ A categoria *\"{new_category}\"* não existe ainda. Deseja criá-la?\nResponda *sim* para criar ou *não* para usar _Outros_.",
                            message_id
                        )
                        return

                    updated_state = {
                        "state": "pending_confirmation",
                        "pending_tx": pending_tx,
                        "last_tx_id": conv_state.get("last_tx_id"),
                    }
                    await _set_conv_state(phone_number, updated_state)
                    await _send_confirmation_card(phone_number, pending_tx)
                    return

                field_labels = {
                    "amount": "valor", "category": "categoria", "account_name": "conta",
                    "description": "descrição", "date": "data", "type": "tipo",
                }
                field_context = (
                    f"O usuário está corrigindo o campo '{field_labels.get(field, field)}' de um lançamento.\n"
                    f"Lançamento atual: {_format_confirmation_card(pending_tx)}\n\n"
                    f"Extraia APENAS o novo valor para o campo '{field}' da mensagem do usuário.\n"
                    f"Regras:\n"
                    f"- amount: número float (ex: '80 reais' → 80.0)\n"
                    f"- category: string em português (ex: 'alimentação' → 'Alimentação')\n"
                    f"- account_name: nome da conta (ex: 'nubank', 'itaú', 'carteira')\n"
                    f"- description: texto livre descritivo\n"
                    f"- date: converter para ISO 8601 (hoje={datetime.now().strftime('%Y-%m-%d')}; 'ontem', 'dia 10', etc.)\n"
                    f"- type: 'EXPENSE', 'INCOME' ou 'TRANSFER'\n\n"
                    f"Retorne SEMPRE: {{\"action\": \"edit_pending\", \"data\": {{\"{field}\": <novo_valor>}}, \"reply_text\": \"mensagem curta\"}}"
                )

                try:
                    llm_response_str = await clients.llm_client.process_message(message_body, context_data=field_context)
                    llm_data = json.loads(llm_response_str)
                    edit_data = llm_data.get("data") or {}

                    if edit_data.get(field) is not None:
                        pending_tx[field] = edit_data[field]

                    updated_state = {
                        "state": "pending_confirmation",
                        "pending_tx": pending_tx,
                        "last_tx_id": conv_state.get("last_tx_id"),
                    }
                    await _set_conv_state(phone_number, updated_state)
                    await _send_confirmation_card(phone_number, pending_tx)
                except Exception as e:
                    logger.error(f"Erro ao processar edição de campo: {e}")
                    await _send_whatsapp(phone_number, "Não consegui processar. Tente novamente.", message_id)
                return

        # --- Estado: aguardando resposta sobre nova categoria ---
        if current_state == "pending_category":
            msg_lower = message_body.strip().lower()
            if msg_lower in CONFIRM_KEYWORDS:
                # Criar a categoria sugerida e voltar para confirmação
                suggested_cat = conv_state.get("suggested_category", "Nova Categoria")
                async with AsyncSessionLocal() as session:
                    await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})
                    from backend.db.models import UserProfile
                    from sqlalchemy import select as sa_select
                    result = await session.execute(sa_select(UserProfile).where(UserProfile.user_phone == phone_number))
                    profile = result.scalar_one_or_none()
                    if profile:
                        existing = json.loads(profile.custom_categories) if profile.custom_categories else []
                        if suggested_cat not in existing:
                            existing.append(suggested_cat)
                            profile.custom_categories = json.dumps(existing)
                            await session.commit()

                # Atualizar categoria no pending_tx e voltar para pending_confirmation
                pending_tx = conv_state.get("pending_tx", {})
                pending_tx["category"] = suggested_cat
                new_state = {
                    "state": "pending_confirmation",
                    "pending_tx": pending_tx,
                    "last_tx_id": conv_state.get("last_tx_id"),
                }
                await _set_conv_state(phone_number, new_state)
                await _send_whatsapp(phone_number, f"✅ Categoria *{suggested_cat}* criada!", message_id)
                await _send_confirmation_card(phone_number, pending_tx)
                return
            elif msg_lower in CANCEL_KEYWORDS:
                # Voltar para pending_confirmation com categoria genérica "Outros"
                pending_tx = conv_state.get("pending_tx", {})
                pending_tx["category"] = "Outros"
                new_state = {
                    "state": "pending_confirmation",
                    "pending_tx": pending_tx,
                    "last_tx_id": conv_state.get("last_tx_id"),
                }
                await _set_conv_state(phone_number, new_state)
                await _send_confirmation_card(phone_number, pending_tx)
                return

        # --- Estado: aguardando seleção de conta ambígua (fallback texto) ---
        if current_state == "pending_account_selection":
            pending_tx = conv_state.get("pending_tx", {})
            candidates = conv_state.get("account_candidates", [])  # list of {id, name}
            msg_stripped = message_body.strip()

            # Tenta correspondência por número (ex: "1", "2") ou por nome parcial
            chosen = None
            if msg_stripped.isdigit():
                idx = int(msg_stripped) - 1
                if 0 <= idx < len(candidates):
                    chosen = candidates[idx]
            else:
                msg_lower = msg_stripped.lower()
                for c in candidates:
                    if msg_lower in c["name"].lower() or c["name"].lower() in msg_lower:
                        chosen = c
                        break

            if chosen:
                pending_tx["account_name"] = chosen["name"]
                pending_tx["account_id"] = chosen["id"]
                new_state = {
                    "state": "pending_confirmation",
                    "pending_tx": pending_tx,
                    "last_tx_id": conv_state.get("last_tx_id"),
                }
                await _set_conv_state(phone_number, new_state)
                await _send_confirmation_card(phone_number, pending_tx)
            else:
                # Não entendeu — reexibir opções
                async with AsyncSessionLocal() as session:
                    await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})
                    from backend.core.ledger import LedgerService as _LS
                    _ledger = _LS(session)
                    accts = [a for a in await _ledger.search_accounts_by_partial_name(phone_number, "") if a.id in {c["id"] for c in candidates}]
                if candidates:
                    options = "\n".join(f"{i+1}. {c['name']}" for i, c in enumerate(candidates))
                    await _send_whatsapp(phone_number, f"Não entendi. Responda com o número ou nome da conta:\n\n{options}", message_id)
            return

        # --- 2. Recuperar Contexto (saldos + histórico + categorias) ---
        context_str = ""
        available_categories = []
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})

            ledger = LedgerService(session)
            accounts = await ledger.get_accounts(phone_number)
            if accounts:
                context_str += "💰 Saldos Atuais:\n"
                for acc in accounts:
                    context_str += f"- {acc.name}: R$ {acc.current_balance:.2f}\n"
                context_str += "\n"

            from backend.core.repository import TransactionRepository
            repo = TransactionRepository(session)
            recent_txs = await repo.get_recent_transactions(phone_number, limit=15)
            if recent_txs:
                context_str += "📜 Histórico Recente:\n"
                for tx in recent_txs:
                    date_str = tx.date.strftime("%d/%m") if tx.date else "Data desc."
                    sign = "-" if tx.type == "EXPENSE" else "+"
                    context_str += f"- {date_str}: {sign} R$ {tx.amount} ({tx.category}) - {tx.description}\n"
            else:
                context_str += "Nenhuma transação anterior encontrada."

            # Buscar categorias disponíveis (transações + custom)
            from sqlalchemy import select as sa_select
            from backend.db.models import UserProfile, Transaction
            cats_result = await session.execute(
                sa_select(Transaction.category).where(
                    Transaction.user_phone == phone_number,
                    Transaction.category.isnot(None)
                ).distinct()
            )
            tx_cats = {row[0] for row in cats_result.fetchall() if row[0]}

            profile_result = await session.execute(sa_select(UserProfile).where(UserProfile.user_phone == phone_number))
            profile = profile_result.scalar_one_or_none()
            custom_cats = []
            if profile and profile.custom_categories:
                try:
                    custom_cats = json.loads(profile.custom_categories)
                except Exception:
                    custom_cats = []

            available_categories = sorted(tx_cats | set(custom_cats))

        # --- 3. Processar com IA ---
        try:
            llm_response_str = await clients.llm_client.process_message(
                message_body,
                context_data=context_str,
                available_categories=available_categories if available_categories else None
            )
            logger.info(f"🧠 Resposta da IA: {llm_response_str}")

            reply_text = "Recebido."
            try:
                llm_data = json.loads(llm_response_str)
                action = llm_data.get("action")
                data = llm_data.get("data", {})

                # --- Action: editar último lançamento ---
                if action == "edit_last":
                    last_tx_id = conv_state.get("last_tx_id")
                    if last_tx_id and data:
                        async with AsyncSessionLocal() as session:
                            await session.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})
                            from backend.core.repository import TransactionRepository
                            repo = TransactionRepository(session)
                            updated = await repo.update_transaction(
                                tx_id=last_tx_id,
                                user_phone=phone_number,
                                category=data.get("category"),
                                description=data.get("description"),
                                amount=data.get("amount"),
                            )
                            await session.commit()
                        if updated:
                            changes = []
                            if data.get("category"):
                                changes.append(f"categoria → *{data['category']}*")
                            if data.get("description"):
                                changes.append(f"descrição → *{data['description']}*")
                            if data.get("amount"):
                                changes.append(f"valor → *R$ {data['amount']:,.2f}*")
                            reply_text = f"✏️ Lançamento corrigido: {', '.join(changes)}." if changes else "✏️ Lançamento atualizado."
                        else:
                            reply_text = "Não encontrei o lançamento para editar."
                    else:
                        reply_text = "Não há lançamento recente para editar."
                    await _send_whatsapp(phone_number, reply_text, message_id)
                    return

                # --- Action: registrar transação (com confirmação) ---
                elif action == "log_transaction" and data and data.get("amount"):
                    category = data.get("category", "")

                    # Verificar se LLM sugeriu nova categoria
                    if category and category.startswith("__nova__:"):
                        suggested = category.replace("__nova__:", "").strip()
                        new_state = {
                            "state": "pending_category",
                            "suggested_category": suggested,
                            "pending_tx": data,
                            "last_tx_id": conv_state.get("last_tx_id"),
                        }
                        await _set_conv_state(phone_number, new_state)
                        await _send_whatsapp(
                            phone_number,
                            f"❓ Não reconheci a categoria. Posso criar *\"{suggested}\"*?\nResponda *sim* para criar ou *não* para usar _Outros_.",
                            message_id
                        )
                        return

                    # Verificar ambiguidade de conta
                    account_name_raw = data.get("account_name", "")
                    from backend.core.ledger import LedgerService as _LS2
                    async with AsyncSessionLocal() as _sess:
                        await _sess.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": phone_number})
                        _ledger2 = _LS2(_sess)
                        user_accounts = await _ledger2.get_accounts(phone_number)

                        if not user_accounts:
                            await _send_whatsapp(phone_number, "⚠️ Você não possui contas cadastradas. Acesse o painel web para criar uma conta antes de registrar transações.", message_id)
                            return

                        if account_name_raw:
                            exact = await _ledger2.get_account_by_name(phone_number, account_name_raw)
                            if exact:
                                data["account_name"] = exact.name
                                data["account_id"] = str(exact.id)
                            else:
                                candidates = await _ledger2.search_accounts_by_partial_name(phone_number, account_name_raw)
                                if len(candidates) > 1:
                                    candidate_list = [{"id": str(a.id), "name": a.name} for a in candidates]
                                    new_state = {
                                        "state": "pending_account_selection",
                                        "pending_tx": data,
                                        "account_candidates": candidate_list,
                                        "last_tx_id": conv_state.get("last_tx_id"),
                                    }
                                    await _set_conv_state(phone_number, new_state)
                                    await _send_account_disambiguation(phone_number, candidates, message_id)
                                    return
                                elif len(candidates) == 1:
                                    # Só uma correspondência — usar diretamente
                                    data["account_name"] = candidates[0].name
                                    data["account_id"] = str(candidates[0].id)
                                else:
                                    # Conta mencionada não existe — pedir ao usuário para escolher
                                    candidate_list = [{"id": str(a.id), "name": a.name} for a in user_accounts]
                                    new_state = {
                                        "state": "pending_account_selection",
                                        "pending_tx": data,
                                        "account_candidates": candidate_list,
                                        "last_tx_id": conv_state.get("last_tx_id"),
                                    }
                                    await _set_conv_state(phone_number, new_state)
                                    options = "\n".join(f"{i+1}. {a.name}" for i, a in enumerate(user_accounts))
                                    await _send_whatsapp(phone_number, f"⚠️ Conta *\"{account_name_raw}\"* não encontrada. Em qual conta deseja registrar?\n\n{options}", message_id)
                                    return
                        else:
                            # LLM não identificou conta — pedir ao usuário para escolher
                            if len(user_accounts) == 1:
                                data["account_name"] = user_accounts[0].name
                                data["account_id"] = str(user_accounts[0].id)
                            else:
                                candidate_list = [{"id": str(a.id), "name": a.name} for a in user_accounts]
                                new_state = {
                                    "state": "pending_account_selection",
                                    "pending_tx": data,
                                    "account_candidates": candidate_list,
                                    "last_tx_id": conv_state.get("last_tx_id"),
                                }
                                await _set_conv_state(phone_number, new_state)
                                options = "\n".join(f"{i+1}. {a.name}" for i, a in enumerate(user_accounts))
                                await _send_whatsapp(phone_number, f"Em qual conta deseja registrar?\n\n{options}", message_id)
                                return

                    # Categoria válida — mostrar card de confirmação com botões
                    new_state = {
                        "state": "pending_confirmation",
                        "pending_tx": data,
                        "last_tx_id": conv_state.get("last_tx_id"),
                    }
                    await _set_conv_state(phone_number, new_state)
                    await _send_confirmation_card(phone_number, data)
                    return

                # --- Action: chat ---
                else:
                    reply_text = llm_data.get("reply_text", "Recebido.")

            except json.JSONDecodeError:
                logger.warning("IA não retornou JSON válido. Usando texto bruto.")
                reply_text = llm_response_str
            except Exception as e:
                logger.error(f"Erro de persistência: {e}")
                reply_text = "Tive um erro ao processar sua mensagem."

        except Exception as e:
            logger.error(f"Erro no processamento da IA: {e}")
            reply_text = "Estou com uma breve enxaqueca digital. Tente novamente em instantes."

        await _send_whatsapp(phone_number, reply_text, message_id)

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

async def handle_interactive(phone_number: str, button_id: str, message_id: str):
    """Trata cliques em botões e seleções de lista interativa."""
    try:
        conv_state = await _get_conv_state(phone_number)

        # --- Botões do card de confirmação ---
        if button_id == "btn_confirm":
            if conv_state.get("state") == "pending_confirmation":
                await _confirm_and_save(phone_number, conv_state, message_id)
            else:
                await _send_whatsapp(phone_number, "Nenhum lançamento pendente para confirmar.", message_id)

        elif button_id == "btn_cancel":
            await _clear_conv_state(phone_number)
            await _send_whatsapp(phone_number, "❌ Lançamento cancelado.", message_id)

        elif button_id == "btn_edit":
            if conv_state.get("state") == "pending_confirmation":
                await _send_edit_field_list(phone_number)
            else:
                await _send_whatsapp(phone_number, "Nenhum lançamento pendente para editar.", message_id)

        # --- Seleção de conta na lista de desambiguação ---
        elif button_id.startswith("acct_"):
            if conv_state.get("state") == "pending_account_selection":
                account_id_str = button_id[len("acct_"):]
                candidates = conv_state.get("account_candidates", [])
                chosen = next((c for c in candidates if c["id"] == account_id_str), None)
                if chosen:
                    pending_tx = conv_state.get("pending_tx", {})
                    pending_tx["account_name"] = chosen["name"]
                    pending_tx["account_id"] = chosen["id"]
                    new_state = {
                        "state": "pending_confirmation",
                        "pending_tx": pending_tx,
                        "last_tx_id": conv_state.get("last_tx_id"),
                    }
                    await _set_conv_state(phone_number, new_state)
                    await _send_confirmation_card(phone_number, pending_tx)

        # --- Seleção de campo na lista de edição ---
        elif button_id.startswith("edit_"):
            field_map = {
                "edit_amount":      "amount",
                "edit_category":    "category",
                "edit_account":     "account_name",
                "edit_description": "description",
                "edit_date":        "date",
                "edit_type":        "type",
            }
            field = field_map.get(button_id)
            if field and conv_state.get("state") == "pending_confirmation":
                field_prompts = {
                    "amount":       "💰 Qual o novo *valor*? (ex: 80, 150.50)",
                    "category":     "🏷️ Qual a nova *categoria*? (ex: Alimentação, Transporte)",
                    "account_name": "🏦 Qual a *conta*? (ex: Nubank, Itaú, Carteira)",
                    "description":  "📝 Qual a nova *descrição*?",
                    "date":         "📅 Qual a nova *data*? (ex: hoje, ontem, 10/03)",
                    "type":         "📊 É uma *despesa*, *receita* ou *transferência*?",
                }
                updated_state = {**conv_state, "state": "pending_field_edit", "editing_field": field}
                await _set_conv_state(phone_number, updated_state)
                await _send_whatsapp(phone_number, field_prompts.get(field, "Qual o novo valor?"), message_id)

    except Exception as e:
        logger.error(f"Erro ao processar interação: {e}")

async def handle_reaction_confirmation(phone_number: str, reacted_msg_id: str):
    """Trata confirmação via reação 👍 na mensagem de confirmação."""
    try:
        conv_state = await _get_conv_state(phone_number)
        if conv_state.get("state") == "pending_confirmation":
            pending_msg_id = conv_state.get("pending_message_id")
            # Confirma se a reação foi na mensagem de confirmação ou se não temos o ID guardado
            if not pending_msg_id or pending_msg_id == reacted_msg_id:
                await _confirm_and_save(phone_number, conv_state, None)
            else:
                logger.info(f"Reação em mensagem diferente da confirmação pendente. Ignorando.")
        else:
            logger.info(f"Reação recebida mas sem confirmação pendente para {phone_number}.")
    except Exception as e:
        logger.error(f"Erro ao processar reação: {e}")

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

            # --- INTERACTIVE (button click / list selection) ---
            elif msg_type == "interactive":
                interactive = message_data.get("interactive", {})
                itype = interactive.get("type")
                button_id = None
                if itype == "button_reply":
                    button_id = interactive.get("button_reply", {}).get("id")
                elif itype == "list_reply":
                    button_id = interactive.get("list_reply", {}).get("id")
                if button_id:
                    logger.info(f"🔘 INTERAÇÃO RECEBIDA: {button_id}")
                    background_tasks.add_task(handle_interactive, phone_number, button_id, message_id)

            # --- REACTION MESSAGE ---
            elif msg_type == "reaction":
                reaction = message_data.get("reaction", {})
                emoji = reaction.get("emoji", "")
                reacted_msg_id = reaction.get("message_id", "")
                logger.info(f"👍 REAÇÃO RECEBIDA: {emoji} na mensagem {reacted_msg_id}")
                if emoji == "👍":
                    background_tasks.add_task(handle_reaction_confirmation, phone_number, reacted_msg_id)

            else:
                logger.info(f"Recebido formato não-suportado: {msg_type}")

        return Response(status_code=200)

    except Exception as e:
        logger.error(f"Erro ao processar webhook: {str(e)}")
        # Sempre retorne 200 para o WhatsApp não ficar tentando reenviar
        return Response(status_code=200)
