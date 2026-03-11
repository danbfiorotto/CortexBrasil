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
        
    async def process_message(self, user_message: str, context_data: str = None, available_categories: list = None) -> str:
        """
        Sends a message to the local LLM and returns the response.
        """
        system_prompt = """Você é o Cortex Brasil, um assistente financeiro pessoal, sábio e proativo.
Seu objetivo é extrair informações financeiras de mensagens informais e realizar a contabilidade correta (Double-Entry).

Sempre responda em formato JSON estrito, sem markdown, com a seguinte estrutura:
{
    "action": "log_transaction" | "edit_last" | "chat",
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

## REGRAS DE CATEGORIAS
Use SEMPRE uma das categorias da lista abaixo (se disponível). Escolha a mais semanticamente próxima.
Só use o formato especial `__nova__: NomeSugerido` se absolutamente nenhuma categoria existente se encaixar.
{categories_section}

## EDIÇÃO DO ÚLTIMO LANÇAMENTO
Se o usuário pedir para corrigir/alterar algo do último lançamento registrado (ex: "muda a categoria", "era alimentação", "corrige pra Nubank", "o valor era 80"), retorne:
{
    "action": "edit_last",
    "data": { "category": "NovaCategoria" },
    "reply_text": "Claro! Vou corrigir o lançamento."
}
Inclua em `data` APENAS os campos que devem ser alterados (category, description, amount, account_name).

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
    "reply_text": "Aguardando confirmação."
}

Usuario: "Recebi 5000 da empresa"
Resposta: {
    "action": "log_transaction",
    "data": {"amount": 5000.0, "type": "INCOME", "category": "Salário", "description": "Salário Empresa", "account_name": "Itaú", "installments": null},
    "reply_text": "Aguardando confirmação."
}

Usuario: "muda a categoria pra Alimentação"
Resposta: {
    "action": "edit_last",
    "data": {"category": "Alimentação"},
    "reply_text": "Corrigido!"
}
"""
        # Build categories section
        if available_categories:
            cats_list = "\n".join(f"- {c}" for c in available_categories)
            categories_section = f"Categorias disponíveis:\n{cats_list}"
        else:
            categories_section = "Nenhuma categoria cadastrada ainda. Use nomes comuns em português (ex: Alimentação, Transporte, Saúde, Lazer, Moradia, Salário)."

        # Inject context and categories
        formatted_prompt = system_prompt.replace("{context_data}", context_data if context_data else "Nenhuma transação recente encontrada.")
        formatted_prompt = formatted_prompt.replace("{categories_section}", categories_section)

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
    "keywords": [string] | null,
    "start_date": string (ISO 8601) | null,
    "end_date": string (ISO 8601) | null,
    "min_amount": float | null,
    "max_amount": float | null,
    "type": "EXPENSE" | "INCOME" | "TRANSFER" | null
}}

IMPORTANTE sobre "keywords":
- Lista de termos para buscar em QUALQUER campo (descrição ou categoria). Resultados batem se UM DELES combinar.
- Inclua SINÔNIMOS, nomes de estabelecimentos, categorias relacionadas e variações. Seja abrangente.
- Exemplos de expansão semântica:
  * "comida" -> ["comida", "alimentação", "ifood", "rappi", "mercado", "restaurante", "hortifruti", "padaria", "lanche"]
  * "transporte" -> ["transporte", "uber", "99", "taxi", "onibus", "metrô", "combustível", "gasolina"]
  * "lazer" -> ["lazer", "cinema", "netflix", "spotify", "jogo", "bar", "entretenimento"]
  * "moradia" -> ["moradia", "aluguel", "condomínio", "água", "luz", "energia", "internet"]
- Para nomes específicos de estabelecimentos, inclua apenas o nome: ["uber", "nubank"]

Data de HOJE: {datetime.now().isoformat()}

Exemplos:
- "Quanto gastei com Uber mês passado?" -> {{"keywords": ["uber"], "start_date": "2026-01-01", "end_date": "2026-01-31"}}
- "Compras de comida" -> {{"keywords": ["comida", "alimentação", "ifood", "rappi", "mercado", "restaurante", "hortifruti", "padaria", "supermercado"], "type": "EXPENSE"}}
- "Gastos com alimentação" -> {{"keywords": ["alimentação", "comida", "ifood", "mercado", "restaurante", "hortifruti"], "type": "EXPENSE"}}
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
