"""
Serviço para rastrear uso de tokens LLM
"""
import logging
from typing import Optional
from datetime import datetime
from sqlmodel import Session, select, func
from app.models import LLMTokenUsage, User

logger = logging.getLogger(__name__)


def track_llm_tokens(
    session: Session,
    tenant_id: int,
    user_id: Optional[int],
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    endpoint: Optional[str] = None,
    feature: Optional[str] = None
) -> None:
    """
    Registra o uso de tokens LLM
    
    Args:
        session: Sessão do banco de dados
        tenant_id: ID do tenant
        user_id: ID do usuário (opcional)
        provider: Provedor do LLM ("openai" ou "ollama")
        model: Nome do modelo usado
        prompt_tokens: Tokens do prompt
        completion_tokens: Tokens da resposta
        total_tokens: Total de tokens
        endpoint: Endpoint que gerou o uso (opcional)
        feature: Feature usada (opcional, ex: "insight_generation", "linkedin_message")
    """
    try:
        token_usage = LLMTokenUsage(
            tenant_id=tenant_id,
            user_id=user_id,
            provider=provider,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            endpoint=endpoint,
            feature=feature
        )
        session.add(token_usage)
        session.commit()
        logger.debug(f"✅ Tokens rastreados: {total_tokens} tokens ({provider}/{model})")
    except Exception as e:
        logger.error(f"❌ Erro ao rastrear tokens: {e}")
        session.rollback()
        # Não falhar a requisição se o tracking falhar


def get_tokens_usage(
    session: Session,
    tenant_id: int,
    month_start: Optional[datetime] = None
) -> int:
    """
    Retorna o total de tokens usados pelo tenant no mês
    
    Args:
        session: Sessão do banco de dados
        tenant_id: ID do tenant
        month_start: Início do mês (opcional, usa início do mês atual se None)
    
    Returns:
        Total de tokens usados
    """
    if month_start is None:
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    try:
        result = session.exec(
            select(func.sum(LLMTokenUsage.total_tokens)).where(
                LLMTokenUsage.tenant_id == tenant_id,
                LLMTokenUsage.created_at >= month_start
            )
        ).first()
        
        return int(result) if result else 0
    except Exception as e:
        logger.error(f"❌ Erro ao buscar uso de tokens: {e}")
        return 0

