from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 horas
    
    # LLM Configuration - OpenAI, Ollama ou DeepSeek
    llm_provider: str = "openai"  # "openai", "ollama" ou "deepseek"
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4"
    
    # Ollama Configuration
    ollama_base_url: str = "http://localhost:11434"  # URL padrão do Ollama (use host.docker.internal em Docker)
    ollama_model: str = "llama3"  # ou "mistral", "codellama", etc.
    
    # DeepSeek Configuration
    deepseek_api_key: Optional[str] = None
    deepseek_model: str = "deepseek-chat"  # Modelo DeepSeek
    deepseek_base_url: str = "https://api.deepseek.com"  # URL base da API DeepSeek
    
    # APIs de enriquecimento de leads
    serper_api_key: Optional[str] = None  # Serper.dev API key (Google Search API)
    hunter_api_key: Optional[str] = None  # Hunter.io API key
    clearbit_api_key: Optional[str] = None  # Clearbit API key
    google_search_api_key: Optional[str] = None  # Google Custom Search API key
    google_search_engine_id: Optional[str] = None  # Google Custom Search Engine ID
    rapidapi_key: Optional[str] = None  # RapidAPI key (para LinkedIn e outras APIs)
    rapidapi_linkedin_host: str = "linkedin-data-api.p.rapidapi.com"  # Host da API do LinkedIn no RapidAPI
    rapidapi_linkedin_endpoint: Optional[str] = None  # Endpoint customizado (ex: "/", "/v1/profile", etc). Se None, usa "/" como padrão.
    
    # Casa dos Dados API
    casadosdados_api_key: Optional[str] = None  # API key da Casa dos Dados para prospecção

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"  # Ignorar campos extras no .env que não estão definidos
    )


settings = Settings()




