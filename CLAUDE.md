# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cortex Brasil is a personal financial management app accessed via WhatsApp + a web dashboard. Users send text/audio messages to record transactions, check balances, and get financial insights. A local LLM (Qwen2.5-7B via vLLM) parses messages into structured financial data.

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

## Architecture

### Backend (`backend/`)
- **FastAPI** with async SQLAlchemy (asyncpg) and Pydantic validation
- **Lifespan pattern**: `main.py` initializes global clients (Redis, WhatsApp, LLM, AudioTranscriber) at startup and runs idempotent SQL migrations from `db/migrations/`
- **Global clients** (`core/clients.py`): Shared singleton instances imported by route handlers
- **API routers** (`api/`): auth, dashboard, accounts, budgets, goals, analytics, settings
- **Business logic** (`core/`): `ledger.py` (account management, transaction registration), `repository.py` (transaction CRUD), `llm.py` (vLLM client), `whatsapp.py` (Meta API)

### Frontend (`frontend/`)
- **Next.js 16** with App Router, all pages use `'use client'` with client-side data fetching
- **API client** (`lib/api.ts`): Axios instance with JWT interceptor (token stored in cookie)
- **Styling**: Tailwind CSS + Tremor charts + Recharts + Framer Motion
- **Path alias**: `@/*` → `./src/*`

### Database
- **PostgreSQL 16** with pgvector extension
- **Row-Level Security (RLS)**: Per-request user context set via `SET app.current_user_phone` — all transaction queries are filtered by RLS policies
- **Trigger-based balance updates**: PostgreSQL triggers on `transactions` table auto-sync account balances (double-entry bookkeeping)
- **Migrations**: Raw SQL files in `backend/db/migrations/`, executed idempotently at app startup

### WhatsApp Flow
1. Meta webhook → `POST /webhook` in `main.py`
2. Redis deduplication prevents double-processing
3. Audio messages: downloaded → transcribed via faster-whisper → treated as text
4. LLM extracts structured JSON (action, amount, category, account)
5. `LedgerService` commits transaction and updates balances
6. Response sent back via WhatsApp API

### Authentication
- Phone number + OTP sent via WhatsApp, verified against Redis (5 min TTL)
- JWT tokens issued after verification, used for all dashboard API calls
- Webhook verification uses HMAC-SHA256 signature

## Key Patterns

- **Async-first**: All DB and HTTP operations use `async/await`
- **Type hints** throughout backend; strict TypeScript in frontend
- **Commit convention**: `<type>: <message>` (feat, fix, docs, refactor)
- **Language**: Code comments in English; user-facing text in Portuguese
- **APP_ENV**: WhatsApp responses only sent when `APP_ENV=development`

## Workflow

- Always commit + push to GitHub after code changes
- Remote: `https://github.com/danbfiorotto/CortexBrasil.git` (branch: main)
