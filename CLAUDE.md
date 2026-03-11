# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cortex Brasil is a personal financial management app accessed via WhatsApp + a web dashboard. Users send text/audio messages to record transactions, check balances, and get financial insights. A local LLM (Qwen2.5-7B via vLLM) parses messages into structured financial data with double-entry bookkeeping. The backend runs on a remote Windows server via Docker; the frontend is Next.js.

---

## Commands

### Backend (Python/FastAPI)
```bash
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev        # Dev server on :3000
npm run build      # Production build
npm run lint       # ESLint
```

### Full Stack (Docker)
```bash
docker-compose up -d   # Starts: app, db, redis, vllm, cloudflared
```

### Remote Server Operations
The backend runs on a remote Windows server via SSH:
```bash
# Restart backend container
ssh danilo_fiorotto@ssh.cortexbrasil.com.br "docker restart cortex-app-1"

# List running containers
ssh danilo_fiorotto@ssh.cortexbrasil.com.br "docker ps"

# Pull latest code on remote (repo mounted as /app volume)
ssh danilo_fiorotto@ssh.cortexbrasil.com.br 'cd "C:\Users\Danilo Fiorotto\Documents\programacao\Cortex" && git pull'
```

---

## Mandatory Workflow After Any Change

**ALWAYS** after any code change (frontend or backend):
1. `git add` + `git commit` + `git push` to GitHub
2. `git pull` on the remote server (volume `.:/app` mounts the repo in the container)
3. `docker restart cortex-app-1` — **only for backend changes**
4. Frontend-only changes (Next.js) do NOT need a backend restart, but still need git pull.

**Remote repo path**: `C:\Users\Danilo Fiorotto\Documents\programacao\Cortex`
**GitHub remote**: `https://github.com/danbfiorotto/CortexBrasil.git` (branch: `main`)

---

## Architecture

### Backend (`backend/`)
- **FastAPI** with async SQLAlchemy (asyncpg) and Pydantic validation
- **Lifespan pattern**: `main.py` initializes all global clients (Redis, WhatsApp, LLM, AudioTranscriber) at startup and runs idempotent SQL migrations from `db/migrations/`
- **Global clients** (`core/clients.py`): Shared singletons imported by route handlers
- **API routers** (`api/`): auth, dashboard, accounts, budgets, goals, analytics, settings
- **Business logic** (`core/`): `ledger.py`, `repository.py`, `llm.py`, `whatsapp.py`, `audio.py`
- **Workers** (`workers/`): `investment_snapshotter.py`, `anomaly_detector.py`, `benchmark_fetcher.py`
- **Market data** (`integrations/`): `market_scrapers.py`, `symbol_cache.py`
- **Analytics** (`analytics/`): `forecasting.py`
- **Simulators** (`simulators/`): `what_if.py`

### Frontend (`frontend/`)
- **Next.js 16** with App Router; all pages use `'use client'` with client-side data fetching
- **API client** (`lib/api.ts`): Axios instance with JWT interceptor (token stored in cookie); `NEXT_PUBLIC_API_URL` sets base URL
- **Styling**: Tailwind CSS + Recharts + Tremor + Framer Motion
- **Path alias**: `@/*` → `./src/*`
- **Custom theme** (`tailwind.config.ts`): dark palette — charcoal-bg (#18181b), graphite-card (#232326), royal-purple (#8b5cf6), emerald-vibrant (#10b981), crimson-bright (#f43f5e)

### Database
- **PostgreSQL 16** with pgvector extension (via `ankane/pgvector` Docker image)
- **Row-Level Security (RLS)**: Per-request context set via `SET app.current_user_phone` — all user-scoped queries are filtered automatically
- **Trigger-based balance updates**: PostgreSQL trigger on `transactions` auto-syncs `accounts.current_balance` on INSERT/UPDATE/DELETE
- **Only cleared transactions affect balance**: `is_cleared=true` flag gates balance impact
- **Migrations**: Raw SQL in `backend/db/migrations/` (001–013), executed idempotently at app startup

### Docker Services
| Service | Image | Port | Purpose |
|---|---|---|---|
| `cortex-app-1` | `cortex-app:latest` | 8000 | FastAPI backend |
| `cortex-db-1` | `ankane/pgvector:v0.5.1` | 5432 | PostgreSQL + pgvector |
| `cortex-redis-1` | `redis:alpine` | 6379 | Cache & dedup |
| `cortex-cloudflared-1` | `cloudflare/cloudflared` | — | Tunnel (exposes behind NAT) |
| `cortex-vllm` | `vllm/vllm-openai` | 8001→8000 | Qwen2.5-7B-Instruct-AWQ (GPU) |

---

## Backend: Core Modules

### `backend/core/`
| File | Purpose |
|---|---|
| `config.py` | Pydantic `BaseSettings`; loads DB, WhatsApp, Cloudflare, HuggingFace env vars |
| `clients.py` | Global singletons: `redis_client`, `whatsapp_client`, `llm_client`, `audio_transcriber` |
| `auth.py` | JWT (HS256, 60-min expiry); `create_access_token()`, `get_current_user()` FastAPI dependency |
| `whatsapp.py` | Meta WhatsApp API client: `send_text_message()`, `get_media_url()`, `download_media()` |
| `llm.py` | vLLM client for Qwen2.5-7B; `process_message()` returns structured JSON (action, amount, type, category, description, account_name, date, installments) |
| `audio.py` | Faster-Whisper (tiny model, CPU); `transcribe()` → Portuguese text |
| `ledger.py` | `LedgerService`: `create_account()`, `register_transaction()`, `recalculate_balances()`, `get_accounts()`, `get_account_by_name()` |
| `repository.py` | `TransactionRepository`: `create_transaction()` with installment splitting (precise rounding: remainder on last installment), `get_recent_transactions()`, `get_transactions_by_category()` |

### `backend/api/` — API Endpoints

**`/auth`**
- `POST /auth/request-otp` — Generates 6-digit OTP, stores in Redis (5 min TTL), sends via WhatsApp
- `POST /auth/verify-otp` — Validates OTP, returns JWT
- `POST /auth/register` — Creates `UserProfile`

**`/api/dashboard`**
- `GET /api/dashboard/summary` — Recent transactions, total balance, monthly spending
- `GET /api/dashboard/hud` — Safe-to-spend, burn rate, invoice projection, income forecast

**`/api/accounts`**
- `GET /` — Lists all active accounts
- `POST /` — Creates account (CHECKING, CREDIT, INVESTMENT, CASH)
- `GET /{id}` — Account details
- `PUT /{id}` — Updates name, credit_limit, due_day
- `POST /{id}/adjust-balance` — Manual balance adjustment
- `DELETE /{id}` — Soft delete (`is_active=false`)

**`/api/budgets`**
- `GET /?month=YYYY-MM` — Lists budgets for month
- `POST /` — Creates/updates budget for category
- `DELETE /{id}` — Deletes budget

**`/api/goals`**
- `GET /` — Lists goals
- `POST /` — Creates goal
- `PUT /{id}` — Updates goal progress

**`/api/analytics`**
- `GET /exchange-rate?currency=USD` — Current exchange rate to BRL
- `GET /assets` — User holdings
- `POST /assets` — Adds holding (ticker, type, quantity, avg_price)
- `PUT /assets/{id}` — Updates holding
- `POST /assets/{id}/sell` — Records sale (creates INCOME transaction)
- `GET /portfolio` — Portfolio value, allocations, gains/losses
- `POST /scenarios/what-if` — Simulates purchase scenario
- `GET /forecast` — Projects balance 3 months ahead (linear extrapolation)
- `GET /anomalies` — Detects anomalies (2σ) in recurring expense categories

**`/api/settings`**
- `POST /delete-request` — Initiates account deletion (sends OTP)
- `POST /delete-confirm` — Verifies OTP + phrase, wipes all user data
- `GET /categories` — Lists custom categories
- `POST /categories` — Creates custom category
- `PUT /categories` — Renames category (updates all related transactions)
- `DELETE /categories` — Deletes category (moves transactions to "Outros")

**Webhook (in `main.py`)**
- `GET /webhook` — Meta subscription verification
- `POST /webhook` — Incoming WhatsApp messages (see flow below)
- `GET /health` — Health check

### `backend/workers/`
| File | Purpose |
|---|---|
| `investment_snapshotter.py` | Daily portfolio snapshots → `investment_snapshots` table (by asset type) |
| `anomaly_detector.py` | Detects 2σ anomalies in recurring categories; alerts via WhatsApp |
| `benchmark_fetcher.py` | Populates historical benchmark data (Ibovespa, S&P 500, etc.) |

### `backend/integrations/`
| File | Purpose |
|---|---|
| `market_scrapers.py` | Multi-source market data: Brapi (B3/FIIs), yfinance (US/B3), CoinGecko (crypto), Binance (crypto fallback). Functions: `get_user_portfolio_value()`, `search_ticker()`, `update_market_data()` |
| `symbol_cache.py` | Warms up Brapi, CoinGecko, Binance symbol caches at startup |

### `backend/analytics/` & `backend/simulators/`
| File | Purpose |
|---|---|
| `analytics/forecasting.py` | `get_monthly_cashflow()` (6-month history), `project_balance()` (linear, 3-month ahead) |
| `simulators/what_if.py` | `simulate_scenario()` — projects impact of hypothetical purchase on future balance |

---

## Database Schema

### Core Tables

**`accounts`**: `id` (UUID), `user_phone`, `name`, `type` (CHECKING/CREDIT/INVESTMENT/CASH), `initial_balance`, `current_balance` (trigger-maintained), `credit_limit`, `due_day`, `closing_day`, `is_active`, timestamps

**`transactions`**: `id` (UUID), `user_phone`, `account_id`, `destination_account_id`, `type` (EXPENSE/INCOME/TRANSFER), `amount`, `category`, `description`, `date`, `raw_message`, `installments_count`, `installment_number`, `group_id`, `is_cleared`, `created_at`

**`budgets`**: `id`, `user_phone`, `category`, `amount`, `month` (YYYY-MM). Unique: (user_phone, category, month)

**`goals`**: `id`, `user_phone`, `name`, `target_amount`, `current_amount`, `deadline`, `created_at`

**`user_profiles`**: `id`, `user_phone` (unique), `name`, `email`, `monthly_income`, `onboarding_completed`, `custom_categories` (JSON), timestamps

**`assets`**: `id`, `user_phone`, `ticker`, `name`, `type` (STOCK/FII/CRYPTO/FIXED_INCOME), `quantity`, `avg_price`, `purchased_at`, timestamps

**`market_data`**: `ticker` (PK), `price`, `change_pct`, `dividend_yield`, `last_updated` — public, no RLS

**`investment_snapshots`**: `user_phone` + `snapshot_date` (composite PK), `total_value`, `total_cost`, `stocks_value`, `fii_value`, `crypto_value`, `fixed_income_value`

**`category_learning`**: `id`, `user_phone`, `original_description`, `corrected_category`, `embedding` (pgvector 384-dim) — RAG for category classification

**`net_worth_history`**: `id`, `user_phone`, `total_balance`, `total_investments`, `total_debts`, `net_worth`, `snapshot_date`

### Migrations (`backend/db/migrations/`)
| File | What it does |
|---|---|
| `001_initial_ledger.sql` | accounts/transactions tables, RLS policies, balance update trigger |
| `002_analytics_investments.sql` | assets, market_data, net_worth_history, category_learning (pgvector) |
| `003_add_is_cleared_to_transactions.sql` | Pending transaction support |
| `004_add_credit_card_fields_to_accounts.sql` | credit_limit, due_day, closing_day |
| `005_add_profile_fields.sql` | Extended user_profiles fields |
| `006_fix_balance_trigger_with_update.sql` | Trigger handles UPDATE (pending→cleared transitions) |
| `007_recalculate_all_balances.sql` | Idempotent full balance recalculation |
| `008_unique_account_name_per_type.sql` | Unique constraint per (user_phone, name, type) |
| `009_investment_performance_history.sql` | investment_snapshots table |
| `010_add_is_active_to_accounts.sql` | Soft delete (is_active flag) |
| `011_add_purchased_at_to_assets.sql` | Track purchase date for investments |
| `012_is_cleared_affects_balance.sql` | Only cleared transactions affect balance |
| `013_add_custom_categories_to_profiles.sql` | custom_categories JSON in user_profiles |

---

## Frontend: Pages & Components

### Pages (`frontend/src/app/`)
| Route | File | Purpose |
|---|---|---|
| `/` | `page.tsx` | Redirects to `/dashboard` |
| `/login` | `login/page.tsx` | 2-step: phone → OTP via WhatsApp |
| `/register` | `register/page.tsx` | New user: name, email, phone |
| `/dashboard` | `dashboard/page.tsx` | Home: HUD, CommitmentMountain, Goals, Budgets, PulseFeed |
| `/dashboard/transactions` | `dashboard/transactions/page.tsx` | Transaction list with filters, edit, bulk category, AI search |
| `/dashboard/accounts` | `dashboard/accounts/page.tsx` | Account CRUD, balance adjustment |
| `/dashboard/investments` | `dashboard/investments/page.tsx` | Portfolio, holdings, charts, sell flow |
| `/dashboard/analytics` | `dashboard/analytics/page.tsx` | Balance forecast, cashflow bars, anomalies |
| `/dashboard/settings` | `dashboard/settings/page.tsx` | Custom categories, account deletion |

### Components (`frontend/src/components/`)
| File | Purpose |
|---|---|
| `HUD.tsx` | Safe-to-spend, burn rate, invoice projection, income status, onboarding trigger |
| `CommitmentMountain.tsx` | Goal progress area chart |
| `GoalsCard.tsx` | Goals with progress bars, create/update/delete |
| `BudgetsCard.tsx` | Monthly budgets with progress bars, create/update |
| `PulseFeed.tsx` | Real-time recent transaction feed |
| `OnboardingModal.tsx` | First-time user onboarding wizard |
| `DeleteAccountModal.tsx` | Account deletion confirmation (OTP + phrase) |
| `ForexTicker.tsx` | Live forex rates: USD, EUR, GBP → BRL |

### Chart Components (`frontend/src/components/charts/`)
| File | Purpose |
|---|---|
| `chartConfig.ts` | Shared colors, labels, tooltip/label formatters by asset type |
| `PortfolioAllocation.tsx` | Pie chart of allocation by asset type |
| `AssetTypeBreakdown.tsx` | Holdings breakdown by type |
| `HoldingsTreemap.tsx` | Treemap: cell size = allocation (sqrt scale), color = gain/loss heatmap |
| `BalanceForecast.tsx` | Line chart of projected balance |
| `CashflowBars.tsx` | Bar chart: income vs expenses (6 months) |
| `GainLossWaterfall.tsx` | Waterfall chart of portfolio gains/losses |
| `PerformanceBenchmark.tsx` | Portfolio vs benchmark (Ibovespa, S&P 500) |
| `DividendYield.tsx` | Dividend yield display |

---

## Key Flows

### WhatsApp Message Processing
1. `POST /webhook` receives Meta message
2. Redis deduplication (prevents double-processing)
3. Audio: download → transcribe (faster-whisper, tiny, CPU) → Portuguese text
4. LLM (Qwen2.5-7B): extracts `{action, amount, type, category, description, account_name, date, installments, reply}`
5. `LedgerService.register_transaction()` → inserts transaction(s) + triggers balance update
6. `WhatsAppClient.send_text_message()` sends reply back
7. WhatsApp responses only sent when `APP_ENV=development`

### Authentication
1. User enters phone → `POST /auth/request-otp` → OTP in Redis (5 min TTL) + WhatsApp message
2. User enters OTP → `POST /auth/verify-otp` → JWT (60 min) → stored in browser cookie
3. Axios interceptor auto-attaches `Authorization: Bearer <token>` to all requests
4. 401 response → redirect to `/login`

### Transaction Processing
- **Single**: Direct insert
- **Installments**: Split into N equal parts; remainder on last installment (precise rounding)
- **Transfer**: Debit source account + credit destination account (double-entry)
- **Balance formula**: `initial_balance + Σ(cleared incomes) − Σ(cleared expenses) + Σ(incoming transfers) − Σ(outgoing transfers)`
- **Pending transactions** (`is_cleared=false`): visible in history but do NOT affect balance

### RLS (Row-Level Security)
Every DB-bound request calls: `SELECT set_config('app.current_user_phone', :phone, false)`
All user-scoped tables (accounts, transactions, budgets, goals, assets, etc.) filter automatically by this session variable.

---

## Key Patterns

- **Async-first**: All DB and HTTP use `async/await`
- **Type hints** throughout backend; strict TypeScript in frontend
- **Commit convention**: `<type>: <message>` (feat, fix, docs, refactor)
- **Language**: Code comments in English; user-facing text in Portuguese
- **No frontend SSR**: All pages are `'use client'`, data fetched client-side
- **Soft deletes**: Accounts use `is_active=false`, not physical deletion
- **Market data sources** (priority order): Brapi → yfinance → CoinGecko → Binance
- **Balance recalculation**: `LedgerService.recalculate_balances()` is idempotent — rebuilds from scratch from `initial_balance`

---

## Key Files Quick Reference

| Category | Path |
|---|---|
| Backend entry | `backend/main.py` |
| Auth (backend) | `backend/core/auth.py`, `backend/api/auth.py` |
| Ledger | `backend/core/ledger.py`, `backend/core/repository.py` |
| LLM / WhatsApp / Audio | `backend/core/llm.py`, `backend/core/whatsapp.py`, `backend/core/audio.py` |
| DB models | `backend/db/models.py`, `backend/db/session.py` |
| Migrations | `backend/db/migrations/001_*.sql` … `013_*.sql` |
| Market data | `backend/integrations/market_scrapers.py` |
| Forecasting | `backend/analytics/forecasting.py` |
| What-if | `backend/simulators/what_if.py` |
| Frontend API client | `frontend/src/lib/api.ts` |
| Dashboard layout | `frontend/src/app/dashboard/layout.tsx` |
| Investments page | `frontend/src/app/dashboard/investments/page.tsx` |
| HoldingsTreemap | `frontend/src/components/charts/HoldingsTreemap.tsx` |
| Chart config | `frontend/src/components/charts/chartConfig.ts` |
| Tailwind theme | `frontend/tailwind.config.ts` |
| Docker | `docker-compose.yml`, `Dockerfile` |
