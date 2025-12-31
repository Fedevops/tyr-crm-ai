"""
Serviço de chat com LLM e RAG
"""
import logging
from typing import Optional
from sqlmodel import Session
from app.models import User, AssistantChatMessage, AssistantChatMessageCreate
from app.services.rag_service import get_relevant_context
from app.agents.llm_helper import get_llm

logger = logging.getLogger(__name__)


def generate_chat_response(
    session: Session,
    user: User,
    message: str,
    language: str = "pt-BR"
) -> str:
    """
    Gera resposta do chat usando LLM com contexto RAG
    """
    try:
        # Buscar contexto relevante na base de conhecimento
        context = get_relevant_context(session, message, user.tenant_id)
        
        # Criar prompt para o LLM
        if language.startswith("pt"):
            system_prompt = """Você é um assistente virtual especializado em ajudar usuários a entender e usar o sistema TYR CRM AI.

Use APENAS as informações fornecidas no contexto abaixo para responder. Se a informação não estiver no contexto, diga que não tem essa informação específica, mas pode ajudar com outras funcionalidades.

Seja claro, objetivo e amigável. Use exemplos práticos quando possível.

Contexto da base de conhecimento:
{context}

Pergunta do usuário: {question}

Responda de forma útil e direta:"""
        else:
            system_prompt = """You are a virtual assistant specialized in helping users understand and use the TYR CRM AI system.

Use ONLY the information provided in the context below to answer. If the information is not in the context, say you don't have that specific information, but can help with other features.

Be clear, objective and friendly. Use practical examples when possible.

Knowledge base context:
{context}

User question: {question}

Answer in a helpful and direct way:"""
        
        # Montar prompt completo
        full_prompt = system_prompt.format(context=context, question=message)
        
        # Obter LLM
        llm = get_llm(temperature=0.7)
        
        if not llm:
            return "Desculpe, não foi possível conectar ao assistente. Tente novamente mais tarde." if language.startswith("pt") else "Sorry, could not connect to assistant. Please try again later."
        
        # Gerar resposta
        response = llm.invoke(full_prompt)
        
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Track token usage
        try:
            from app.services.token_tracker import track_llm_tokens
            from app.agents.llm_helper import extract_token_usage
            from app.config import settings
            
            provider = settings.llm_provider.lower()
            model = settings.openai_model if provider == "openai" else settings.ollama_model
            
            token_usage = extract_token_usage(response, provider)
            if token_usage.get('total_tokens', 0) > 0:
                track_llm_tokens(
                    session=session,
                    tenant_id=user.tenant_id,
                    user_id=user.id,
                    provider=provider,
                    model=model,
                    prompt_tokens=token_usage.get('prompt_tokens', 0),
                    completion_tokens=token_usage.get('completion_tokens', 0),
                    total_tokens=token_usage.get('total_tokens', 0),
                    endpoint="/api/chat",
                    feature="chat_assistant"
                )
        except Exception as e:
            logger.warning(f"⚠️ Erro ao rastrear uso de tokens: {e}")
        
        # Salvar no histórico
        chat_message = AssistantChatMessage(
            tenant_id=user.tenant_id,
            user_id=user.id,
            message=message,
            response=response_text,
            context_used_json={
                "context": context,
                "entries_found": len(context.split("---")) if context else 0
            }
        )
        session.add(chat_message)
        session.commit()
        session.refresh(chat_message)
        
        return response_text
        
    except Exception as e:
        logger.error(f"Erro ao gerar resposta do chat: {e}", exc_info=True)
        error_msg = f"Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente." if language.startswith("pt") else "Sorry, an error occurred processing your question. Please try again."
        return error_msg

