import httpx
import logging
import json
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
Seu objetivo é extrair informações financeiras de mensagens informais e fornecer insights breves.

Sempre responda em formato JSON estrito, sem markdown, com a seguinte estrutura:
{
    "action": "log_transaction" | "chat",
    "data": {
        "amount": float | null,
        "category": string | null,
        "description": string | null,
        "date": string (ISO 8601) | null,
        "installments": integer | null (Se for parcelado, ex: 10)
    },
    "reply_text": "Sua resposta curta e amigável para o usuário aqui."
}

## CONTEXTO FINANCEIRO (Memória Recente)
Use os dados abaixo para responder perguntas sobre histórico, totais ou hábitos.
Se não houver dados, responda apenas com base no conhecimento geral ou diga que não sabe.
--------------------------------------------------
{context_data}
--------------------------------------------------

Exemplos:
Usuario: "Gastei 50 no mcdonalds"
Resposta: {
    "action": "log_transaction",
    "data": {"amount": 50.0, "category": "Alimentação", "description": "McDonalds", "date": null, "installments": null},
    "reply_text": "Registrado: R$ 50,00 em Alimentação. 🍔"
}

Usuario: "Comprei um notebook de 3000 em 10x"
Resposta: {
    "action": "log_transaction",
    "data": {"amount": 3000.0, "category": "Eletrônicos", "description": "Notebook", "date": null, "installments": 10},
    "reply_text": "Anotado: Notebook de R$ 3.000,00 parcelado em 10x de R$ 300,00."
}

Usuario: "Quanto gastei essa semana?" (Com dados de contexto presentes)
Resposta: {
    "action": "chat",
    "data": null,
    "reply_text": "Essa semana você gastou R$ 150,00 no mercado e R$ 50,00 em lazer."
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
