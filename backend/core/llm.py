import httpx
import logging
import json
from datetime import datetime
from backend.core.config import settings

logger = logging.getLogger(__name__)

class LLMClient:
    def __init__(self):
        # vLLM is running on a specific port (mapped to 8001 in docker-compose)
        # However, inside the docker network, it is accessible via the service name 'vllm' and port 8000
        self.base_url = "http://vllm:8000/v1" 
        self.model = "Qwen/Qwen2.5-7B-Instruct-AWQ"
        self.headers = {
            "Content-Type": "application/json",
            # "Authorization": f"Bearer {settings.HUGGING_FACE_HUB_TOKEN}" # Not needed for local vllm usually unless gated
        }
        
    async def process_message(self, user_message: str, context_data: str = None) -> str:
        """
        Sends a message to the local LLM and returns the response.
        """
        system_prompt = """Você é o Cortex Brasil, um assistente financeiro pessoal, sábio e proativo.
Seu objetivo é extrair informações financeiras de mensagens informais e realizar a contabilidade correta (Double-Entry).

Sempre responda em formato JSON estrito, sem markdown, com a seguinte estrutura:
{
    "action": "log_transaction" | "chat",
    "data": {
        "amount": float | null,
        "type": "EXPENSE" | "INCOME" | "TRANSFER",
        "category": string | null,
        "description": string | null,
        "account_name": string | null ("Nubank", "Itaú", "Carteira", "Cofre"),
        "destination_account_name": string | null (Apenas para TRANSFER),
        "date": string (ISO 8601) | null,
        "installments": integer | null
    },
    "reply_text": "Sua resposta curta e amigável para o usuário aqui."
}

## REGRAS DE CONTABILIDADE
1. **GASTOS (EXPENSE):** "Gastei 50 no almoço", "Comprei um livro".
   - `account_name`: De onde saiu o dinheiro? Se não falado, assuma "Carteira".
2. **ENTRADAS (INCOME):** "Recebi 5000 de salário", "Caiu um pix de 50".
   - `category`: "Salário", "Renda Extra", "Reembolso".
3. **TRANSFERÊNCIAS (TRANSFER):** "Paguei o cartão Nubank com o Itaú", "Mandei 500 pra poupança".
   - `account_name`: Origem (De onde saiu).
   - `destination_account_name`: Destino (Para onde foi).

## CONTEXTO FINANCEIRO (Memória Recente e Contas)
Use os dados abaixo para responder perguntas sobre histórico, saldos ou hábitos.
--------------------------------------------------
{context_data}
--------------------------------------------------

Exemplos:
Usuario: "Gastei 50 no mcdonalds no débito do itau"
Resposta: {
    "action": "log_transaction",
    "data": {"amount": 50.0, "type": "EXPENSE", "category": "Alimentação", "description": "McDonalds", "account_name": "Itaú", "installments": null},
    "reply_text": "Registrado: R$ 50,00 no Itaú (Alimentação). 🍔"
}

Usuario: "Recebi 5000 da empresa"
Resposta: {
    "action": "log_transaction",
    "data": {"amount": 5000.0, "type": "INCOME", "category": "Salário", "description": "Salário Empresa", "account_name": "Itaú", "installments": null},
    "reply_text": "Boa! R$ 5.000,00 de entrada registrados. 💸"
}
"""
        
        # Inject context or empty string
        formatted_prompt = system_prompt.replace("{context_data}", context_data if context_data else "Nenhuma transação recente encontrada.")

        messages = [{"role": "system", "content": formatted_prompt}]
        messages.append({"role": "user", "content": user_message})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 1000 # Increased for context answers
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                logger.info(f"Sending request to LLM: {self.model}")
                response = await client.post(f"{self.base_url}/chat/completions", headers=self.headers, json=payload)
                
                if response.status_code != 200:
                    logger.error(f"LLM Error {response.status_code}: {response.text}")
                    return json.dumps({
                        "action": "chat",
                        "reply_text": "Desculpe, estou com dificuldades técnicas no momento."
                    })
                    
                result = response.json()
                content = result['choices'][0]['message']['content']
                return content
            except httpx.ConnectError:
                logger.error("Could not connect to vLLM service.")
                return json.dumps({
                    "reply_text": "🧠 O Cortex está acordando. Tente novamente em alguns segundos."
                })
            except httpx.ReadTimeout:
                logger.error("LLM Request Timed Out")
                return json.dumps({
                    "action": "chat", 
                    "reply_text": "🧠 O processamento está demorando mais que o esperado. Tente uma frase mais curta?"
                })
            except Exception as e:
                logger.error(f"Error calling LLM: {str(e)}")
                return json.dumps({
                    "action": "chat", 
                    "reply_text": "Ops, tive um pensamento confuso. Tente novamente."
                })

    async def analyze_search_query(self, query: str) -> dict:
        """
        Translates a natural language query into structured filters.
        """
        system_prompt = f"""Você é um especialista em busca de dados financeiros. 
Sua tarefa é converter uma frase do usuário em filtros JSON estruturados.

Retorne APENAS o JSON com os seguintes campos (use null se não identificado):
{{
    "category": string | null,
    "description": string | null,
    "start_date": string (ISO 8601) | null,
    "end_date": string (ISO 8601) | null,
    "min_amount": float | null,
    "max_amount": float | null,
    "type": "EXPENSE" | "INCOME" | "TRANSFER" | null
}}

Data de HOJE: {datetime.now().isoformat()}

Exemplos:
- "Quanto gastei com Uber mês passado?" -> {{"category": "Transporte", "description": "Uber", "start_date": "2026-01-01", "end_date": "2026-01-31"}}
- "Lançamentos acima de 500 reais esse mês" -> {{"min_amount": 500.0, "start_date": "2026-02-01"}}
- "Entradas de janeiro" -> {{"type": "INCOME", "start_date": "2026-01-01", "end_date": "2026-01-31"}}
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.0,
            "max_tokens": 500
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(f"{self.base_url}/chat/completions", headers=self.headers, json=payload)
                if response.status_code == 200:
                    content = response.json()['choices'][0]['message']['content']
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0].strip()
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0].strip()
                    return json.loads(content)
            except Exception as e:
                logger.error(f"Error parsing search query with LLM: {e}")
            
            return {}
