from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
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
    total_spent_month = result.scalar()

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
            "installment_info": f"{tx.installment_number}/{tx.installments_count}" if tx.installments_count and tx.installments_count > 1 else None
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
    from backend.db.models import Budget
    from sqlalchemy import func
    
    # RLS
    await db.execute(text("SELECT set_config('app.current_user_phone', :phone, false)"), {"phone": current_user_phone})
    
    # Logic moved inside try/except block below
    try: # Added this line
        # 1. Constants / Settings (Mocked for now)
        ESTIMATED_INCOME = 5000.00
        
        # 2. Get Current Month Data
        now = datetime.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        days_in_month = (start_of_month.replace(month=start_of_month.month % 12 + 1) - timedelta(days=1)).day
        days_passed = now.day
        
        repo = TransactionRepository(db)
        
        # Total Spent MTD
        result = await db.execute(
            text("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_phone = :phone AND date >= :start_date"),
            {"phone": current_user_phone, "start_date": start_of_month}
        )
        total_spent_mtd = result.scalar() or 0.0
        
        # 3. Safe-to-Spend Logic
        # Formula: Income - (Fixed Costs/Budgets + Committed Installments)
        # For MVP: Income - Sum(Budgets) - (Unbudgeted Installments?)
        # Let's simplify: Safe = Income - Total Budgets.
        # If user hasn't set budgets, Safe = Income - Spent.
        
        # Get Total Budgets
        budget_stmt = select(func.sum(Budget.amount)).where(
            Budget.user_phone == current_user_phone,
            Budget.month == now.strftime("%Y-%m")
        )
        total_budget_result = await db.execute(budget_stmt)
        total_budget = total_budget_result.scalar() or 0.0
        
        # If no budgets, assume 50% of income is committed? Or just 0?
        committed = total_budget if total_budget > 0 else 2000.00 
        
        safe_to_spend = ESTIMATED_INCOME - committed
        
        # 4. Burn Rate
        # Speed (R$/day)
        daily_avg = total_spent_mtd / max(1, days_passed)
        projected_spend = daily_avg * days_in_month
        
        burn_rate_pct = (projected_spend / ESTIMATED_INCOME) * 100 if ESTIMATED_INCOME > 0 else 0
        
        # 5. Invoice Projection (Same as projected spend for now)
        invoice_projection = projected_spend
        
        return {
            "safe_to_spend": safe_to_spend,
            "burn_rate": {
                "value": burn_rate_pct,
                "status": "Critical" if burn_rate_pct > 100 else "Warning" if burn_rate_pct > 80 else "Good",
                "daily_avg": daily_avg
            },
            "invoice_projection": invoice_projection,
            "income": ESTIMATED_INCOME
        }
    except Exception as e: # Added this line
        logger.error(f"Error in HUD: {e}", exc_info=True) # Added this line
        raise HTTPException(status_code=500, detail=str(e)) # Added this line

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
