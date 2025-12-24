import logging
from typing import Optional
from langchain_openai import ChatOpenAI
from app.config import settings

# Configurar logger
logger = logging.getLogger(__name__)

# Importar Ollama apenas se disponível
try:
    from langchain_ollama import ChatOllama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False
    logger.warning("⚠️ langchain-ollama não instalado. Ollama não disponível.")


def get_llm(temperature: float = 0.2, model_override: Optional[str] = None):
    """
    Retorna uma instância do LLM configurado (OpenAI ou Ollama)
    
    Args:
        temperature: Temperatura para o modelo (padrão: 0.2)
        model_override: Sobrescrever o modelo padrão (opcional)
    
    Returns:
        Instância do LLM ou None se não configurado
    """
    provider = settings.llm_provider.lower()
    
    if provider == "ollama":
        if not OLLAMA_AVAILABLE:
            logger.error("❌ [LLM] Ollama selecionado mas langchain-ollama não está instalado")
            logger.info("💡 [LLM] Instale com: pip install langchain-ollama")
            return None
        
        model = model_override or settings.ollama_model
        logger.info(f"🤖 [LLM] Usando Ollama - Modelo: {model}, URL: {settings.ollama_base_url}")
        try:
            return ChatOllama(
                model=model,
                base_url=settings.ollama_base_url,
                temperature=temperature,
                num_ctx=4096  # Contexto maior para melhor análise
            )
        except Exception as e:
            logger.error(f"❌ [LLM] Erro ao inicializar Ollama: {e}")
            logger.info(f"💡 [LLM] Certifique-se de que o Ollama está rodando em {settings.ollama_base_url}")
            return None
    
    elif provider == "openai":
        if not settings.openai_api_key:
            logger.warning("⚠️ [LLM] OpenAI selecionado mas API key não configurada")
            return None
        
        model = model_override or settings.openai_model
        logger.info(f"🤖 [LLM] Usando OpenAI - Modelo: {model}")
        return ChatOpenAI(
            model=model,
            temperature=temperature,
            openai_api_key=settings.openai_api_key
        )
    
    else:
        logger.error(f"❌ [LLM] Provedor desconhecido: {provider}. Use 'openai' ou 'ollama'")
        return None


def is_llm_available() -> bool:
    """Verifica se algum LLM está disponível"""
    llm = get_llm()
    return llm is not None

