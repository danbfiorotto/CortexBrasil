from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy import text, select, func, insert, update
from backend.core.auth import get_current_user
from backend.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.repository import TransactionRepository
from datetime import datetime, timedelta
import logging

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])
logger = logging.getLogger(__name__)

@router.get("/summary")
async def get_dashboard_summary(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the summary for the dashboard:
    - Current Balance (Safe-to-Spend logic could be added here)
    - Recent Transactions
    - Basic categorization
    """
    logger.info(f"Dashboard access for user: {current_user_phone}")
    
    # RLS: Set current user context
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})

    repo = TransactionRepository(db)
    
    # Recent Transactions
    recent_txs = await repo.get_recent_transactions(current_user_phone, limit=5)
    
    # Calculate Total Spent Current Month
    now = datetime.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Simple query for total (could be moved to repository)
    result = await db.execute(
        text("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_phone = :phone AND date >= :start_date"),
        {"phone": current_user_phone, "start_date": start_of_month}
    )
    total_spent_month = result.scalar() or 0.0

    formatted_txs = []
    for tx in recent_txs:
        date_str = ""
        if tx.date:
            if isinstance(tx.date, str):
                date_str = tx.date[:10]
            else:
                date_str = tx.date.strftime("%Y-%m-%d")
        
        formatted_txs.append({
            "id": tx.id,
            "amount": tx.amount,
            "category": tx.category or "Outros",
            "description": tx.description,
            "date": date_str,
            "is_installment": bool(tx.installment_number)
        })

    return {
        "user": current_user_phone,
        "month_total_spent": float(total_spent_month),
        "recent_transactions": formatted_txs,
        "burn_rate_status": "Normal", # Placeholder logic
        "safe_to_spend": 1500.00 - float(total_spent_month) # Placeholder budget
    }

@router.get("/transactions")
async def get_transactions(
    page: int = 1,
    limit: int = 10,
    category: str = None,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    repo = TransactionRepository(db)
    skip = (page - 1) * limit
    
    txs, total = await repo.get_transactions(current_user_phone, skip=skip, limit=limit, category=category)
    
    data = []
    for tx in txs:
        date_iso = ""
        if tx.date:
            if isinstance(tx.date, str):
                date_iso = tx.date
            else:
                date_iso = tx.date.isoformat()
                
        data.append({
            "id": tx.id,
            "amount": tx.amount,
            "category": tx.category,
            "description": tx.description,
            "date": date_iso,
            "is_installment": bool(tx.installment_number),
            "installment_info": f"{tx.installment_number}/{tx.installments_count}" if tx.installments_count and tx.installments_count > 1 else None,
            "is_cleared": tx.is_cleared
        })

    return {
        "data": data,
        "meta": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    }

@router.post("/insights")
async def generate_insights(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from backend.core import clients
    
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    repo = TransactionRepository(db)
    # Get last 50 transactions for analysis
    recent_txs = await repo.get_recent_transactions(current_user_phone, limit=50)
    
    if not recent_txs:
        return {"insight": "Ainda não tenho dados suficientes para uma análise completa. Continue registrando suas compras!"}
    
    # Format for LLM
    context = "Histórico Financeiro Recente:\n"
    for tx in recent_txs:
        d_str = ""
        if tx.date:
            if isinstance(tx.date, str):
                 d_str = tx.date[:10] # Simple slice for YYYY-MM-DD
            else:
                 d_str = tx.date.strftime('%d/%m')
                 
        context += f"- {d_str}: R$ {tx.amount} ({tx.category}) - {tx.description}\n"
        
    prompt = f"""
    Analise os seguintes dados financeiros do usuário e forneça 3 insights curtos e acionáveis.
    Foque em: Padrões de gastos, categorias dominantes e dicas de economia.
    Seja direto, amigável e use emojis.
    
    {context}
    
    Retorne APENAS um JSON com a chave "insights" contendo uma lista de strings.
    Exemplo: {{ "insights": ["Gasto alto em Uber", "Parabéns por economizar", "Sugestão..."] }}
    """
    
    import traceback
    
    logger.info("Generating insights: Starting analysis")
    try:
        # Check clients
        if not clients.llm_client:
            logger.error("LLM Client is not initialized!")
            return {"insights": ["Erro interno: IA não inicializada."]}

        response = await clients.llm_client.process_message(prompt, context_data="")
        logger.info(f"LLM Response received: {response[:100]}...")
        
        # Simple cleanup if LLM returns markdown code blocks
        clean_response = response.replace("```json", "").replace("```", "").strip()
        import json
        data = json.loads(clean_response)
        
        # Ensure 'insights' key exists
        if "insights" not in data:
            logger.warning(f"LLM response missing 'insights' key: {data}")
            # Try to extract from reply_text if present, or fallback
            return {"insights": ["Não consegui processar a análise no momento."]}
            
        return data
    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        traceback.print_exc()
        return {"insights": ["Não consegui gerar uma análise agora. Tente novamente mais tarde."]}
        return {"insights": ["Não consegui gerar uma análise agora. Tente novamente mais tarde."]}

@router.get("/hud")
async def get_hud_metrics(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns data for the HUD (Head-Up Display):
    1. Safe-to-Spend
    2. Burn Rate
    3. Invoice Projection
    """
    from backend.db.models import Budget, UserProfile
    from sqlalchemy import func
    
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    # Logic moved inside try/except block below
    try:
        logger.info("HUD STEP 1: Fetching User Profile")
        # 1. Fetch User Profile
        profile_stmt = select(UserProfile).where(UserProfile.user_phone == current_user_phone)
        profile_result = await db.execute(profile_stmt)
        profile = profile_result.scalar_one_or_none()
        
        income = profile.monthly_income if profile else 0.0
        needs_onboarding = (income <= 0)
        
        # 2. Get Current Month Data
        now = datetime.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        days_in_month = (start_of_month.replace(month=start_of_month.month % 12 + 1) - timedelta(days=1)).day
        days_passed = now.day
        
        repo = TransactionRepository(db)
        
        logger.info("HUD STEP 2: Spent and Realized Income MTD")
        # Total Spent MTD
        spent_result = await db.execute(
            text("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_phone = :phone AND date >= :start_date AND type = 'EXPENSE'"),
            {"phone": current_user_phone, "start_date": start_of_month}
        )
        total_spent_mtd = spent_result.scalar() or 0.0
        
        # Total Realized Income MTD
        income_result = await db.execute(
            text("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_phone = :phone AND date >= :start_date AND type = 'INCOME'"),
            {"phone": current_user_phone, "start_date": start_of_month}
        )
        realized_income_mtd = income_result.scalar() or 0.0
        
        # Hybrid Income Logic: Max of expected and realized
        effective_income = max(income, realized_income_mtd)
        
        logger.info("HUD STEP 3: Budgets")
        # Total Budgets
        budget_stmt = select(func.sum(Budget.amount)).where(
            Budget.user_phone == current_user_phone,
            Budget.month == now.strftime("%Y-%m")
        )
        total_budget_result = await db.execute(budget_stmt)
        total_budget = total_budget_result.scalar() or 0.0
        
        # Safe-to-Spend: Effective Income - Budgets
        safe_to_spend = effective_income - total_budget if not needs_onboarding else 0.0
        
        logger.info("HUD STEP 4: Burn Rate")
        # Burn Rate Speed (R$/day)
        daily_avg = total_spent_mtd / max(1, days_passed)
        projected_spend = daily_avg * days_in_month
        
        burn_rate_pct = (projected_spend / effective_income) * 100 if effective_income > 0 else 0
        
        logger.info("HUD STEP 5: Returning Data")
        return {
            "safe_to_spend": safe_to_spend,
            "burn_rate": {
                "value": burn_rate_pct,
                "status": "Critical" if burn_rate_pct > 100 else "Warning" if burn_rate_pct > 80 else "Good",
                "daily_avg": daily_avg
            },
            "invoice_projection": projected_spend,
            "income": effective_income,
            "expected_income": income,
            "realized_income": realized_income_mtd,
            "needs_onboarding": needs_onboarding
        }
    except Exception as e:
        logger.error(f"Error in HUD: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/profile")
async def update_user_profile(
    payload: dict,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates or creates the user profile.
    Expected payload: {"monthly_income": 5000.0}
    """
    from backend.db.models import UserProfile
    
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    income = payload.get("monthly_income", 0.0)
    
    # Check if exists
    stmt = select(UserProfile).where(UserProfile.user_phone == current_user_phone)
    res = await db.execute(stmt)
    profile = res.scalar_one_or_none()
    
    if profile:
        profile.monthly_income = income
        profile.onboarding_completed = 1
    else:
        new_profile = UserProfile(
            user_phone=current_user_phone,
            monthly_income=income,
            onboarding_completed=1
        )
        db.add(new_profile)
        
    await db.commit()
    return {"status": "success", "monthly_income": income}

@router.get("/commitments")
async def get_commitments(
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns future commitments (installments) for the mountain chart.
    """
    repo = TransactionRepository(db)
    
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    now = datetime.now()
    data = await repo.get_future_commitments(current_user_phone, start_date=now)
    
    formatted = []
    for month, total in data:
        formatted.append({
            "month": month,
            "amount": float(total)
        })
        
    return formatted

@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: str,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Deletes a single transaction.
    """
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    repo = TransactionRepository(db)
    await repo.delete_transactions(current_user_phone, [transaction_id])
    
    return {"status": "success", "message": "Transaction deleted"}

@router.post("/transactions/bulk-delete")
async def bulk_delete_transactions(
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Deletes multiple transactions.
    """
    tx_ids = payload.get("ids", [])
    if not tx_ids:
        raise HTTPException(status_code=400, detail="No transaction IDs provided")
        
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    repo = TransactionRepository(db)
    await repo.delete_transactions(current_user_phone, tx_ids)
    
    return {"status": "success", "message": f"{len(tx_ids)} transactions deleted"}

@router.post("/transactions/bulk-update")
async def bulk_update_transactions(
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates multiple transactions.
    """
    tx_ids = payload.get("ids", [])
    if not tx_ids:
        raise HTTPException(status_code=400, detail="No transaction IDs provided")
        
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    repo = TransactionRepository(db)
    count = await repo.bulk_update_transactions(
        current_user_phone, 
        tx_ids, 
        category=payload.get("category"),
        description=payload.get("description"),
        is_cleared=payload.get("is_cleared")
    )
    
    return {"status": "success", "message": f"{count} transactions updated"}

@router.get("/transactions/export")
async def export_transactions(
    category: str = None,
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Exports transactions to CSV.
    """
    from fastapi.responses import StreamingResponse
    import io
    import csv
    
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    repo = TransactionRepository(db)
    # Get all matching transactions (no pagination for export)
    txs, _ = await repo.get_transactions(current_user_phone, limit=10000, category=category)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Data", "Descrição", "Categoria", "Valor", "Tipo", "Parcelas", "Status"])
    
    for tx in txs:
        writer.writerow([
            str(tx.id),
            tx.date.strftime("%Y-%m-%d") if tx.date else "",
            tx.description,
            tx.category,
            tx.amount,
            tx.type,
            f"{tx.installment_number}/{tx.installments_count}" if tx.installments_count else "1/1",
            "Cleared" if tx.is_cleared else "Pending"
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transacoes.csv"}
    )

@router.patch("/transactions/{transaction_id}")
async def patch_transaction(
    transaction_id: str,
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates a single transaction.
    """
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    amount = payload.get("amount")
    category = payload.get("category")
    description = payload.get("description")
    date_str = payload.get("date")
    is_cleared = payload.get("is_cleared")
    
    date_val = None
    if date_str:
        try:
            date_val = datetime.fromisoformat(date_str.replace('Z', '+00:00')).replace(tzinfo=None)
        except:
            raise HTTPException(status_code=400, detail="Invalid date format")

    repo = TransactionRepository(db)
    success = await repo.update_transaction(
        current_user_phone, 
        transaction_id, 
        category=category, 
        description=description,
        amount=amount,
        date=date_val,
        is_cleared=is_cleared
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Transaction not found or no changes provided")
        
    return {"status": "success", "message": "Transaction updated"}

@router.post("/transactions/search")
async def search_transactions(
    payload: dict = Body(...),
    current_user_phone: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    AI-powered natural language search for transactions.
    """
    query = payload.get("query")
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")
        
    # 1. Analyze query with LLM
    from backend.core.clients import llm_client
    if not llm_client:
        raise HTTPException(status_code=500, detail="AI Search service unavailable")
        
    filters = await llm_client.analyze_search_query(query)
    logger.info(f"AI Search Filters for '{query}': {filters}")
    
    # 2. Parse dates
    start_date = None
    end_date = None
    if filters.get("start_date"):
        try:
            start_date = datetime.fromisoformat(filters["start_date"].replace('Z', '+00:00')).replace(tzinfo=None)
        except: pass
    if filters.get("end_date"):
        try:
            end_date = datetime.fromisoformat(filters["end_date"].replace('Z', '+00:00')).replace(tzinfo=None)
        except: pass

    # 3. Query DB
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    repo = TransactionRepository(db)
    
    txs, total = await repo.get_transactions(
        user_phone=current_user_phone,
        limit=50, # Return more for search
        start_date=start_date,
        end_date=end_date,
        category=filters.get("category"),
        description=filters.get("description"),
        min_amount=filters.get("min_amount"),
        max_amount=filters.get("max_amount"),
        tx_type=filters.get("type")
    )
    
    # 4. Format response
    data = []
    for tx in txs:
        date_iso = tx.date.isoformat() if tx.date else ""
        data.append({
            "id": tx.id,
            "amount": tx.amount,
            "category": tx.category,
            "description": tx.description,
            "date": date_iso,
            "is_installment": bool(tx.installment_number),
            "installment_info": f"{tx.installment_number}/{tx.installments_count}" if tx.installment_number else None
        })
        
    return {
        "status": "success",
        "data": data,
        "filters_applied": filters,
        "total": total
    }
