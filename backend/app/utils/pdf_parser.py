"""
Utilitários para processamento de PDFs do LinkedIn
"""
import logging
import json
import io
from typing import Dict, Any, Optional
from fastapi import UploadFile
from sqlmodel import Session
import pdfplumber
from app.agents.llm_helper import get_llm, is_llm_available, extract_token_usage
from app.services.token_tracker import track_llm_tokens
from app.config import settings

logger = logging.getLogger(__name__)


async def extract_text_from_pdf(pdf_file: UploadFile) -> str:
    """
    Extrai texto de um arquivo PDF
    
    Args:
        pdf_file: Arquivo PDF enviado via upload
        
    Returns:
        String com todo o texto extraído do PDF
        
    Raises:
        ValueError: Se o PDF estiver corrompido ou inválido
    """
    try:
        # Ler conteúdo do arquivo
        contents = await pdf_file.read()
        
        # Criar objeto BytesIO para pdfplumber
        pdf_bytes = io.BytesIO(contents)
        
        # Extrair texto de todas as páginas
        full_text = ""
        with pdfplumber.open(pdf_bytes) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + "\n"
        
        if not full_text.strip():
            raise ValueError("PDF não contém texto extraível. Pode ser um PDF escaneado (imagem).")
        
        logger.info(f"✅ [PDF PARSER] Texto extraído: {len(full_text)} caracteres")
        return full_text
        
    except pdfplumber.exceptions.PDFSyntaxError as e:
        logger.error(f"❌ [PDF PARSER] Erro de sintaxe no PDF: {e}")
        raise ValueError(f"PDF inválido ou corrompido: {str(e)}")
    except Exception as e:
        logger.error(f"❌ [PDF PARSER] Erro ao extrair texto do PDF: {e}")
        raise ValueError(f"Erro ao processar PDF: {str(e)}")


async def parse_linkedin_data_with_llm(text: str, session: Session, tenant_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Usa LLM para analisar texto extraído de PDF do LinkedIn e extrair dados estruturados
    
    Args:
        text: Texto extraído do PDF
        
    Returns:
        Dicionário com dados estruturados do LinkedIn
        
    Raises:
        ValueError: Se LLM não estiver disponível ou houver erro na análise
    """
    if not is_llm_available():
        raise ValueError("LLM não está configurado. Configure OpenAI, Ollama ou DeepSeek no arquivo .env")
    
    llm = get_llm(temperature=0.2)  # Baixa temperatura para extração precisa
    
    if not llm:
        raise ValueError("Não foi possível inicializar o LLM. Verifique as configurações.")
    
    prompt = f"""Você é um assistente especializado em extrair informações estruturadas de perfis do LinkedIn exportados em PDF.

Analise o seguinte texto extraído de um PDF do LinkedIn e extraia as informações relevantes. Retorne APENAS um JSON válido, sem texto adicional antes ou depois.

Texto do PDF:
---
{text}
---

Extraia as seguintes informações e retorne em formato JSON:

{{
  "linkedin_headline": "Título profissional/headline (ex: 'Especialista Backend | 10+ anos | Python, Django, FastAPI')",
  "linkedin_about": "Texto completo do campo 'Sobre' ou resumo profissional",
  "linkedin_experience_json": [
    {{
      "position": "Cargo/Posição",
      "company": "Nome da empresa",
      "start_date": "Data de início (formato: YYYY-MM ou YYYY)",
      "end_date": "Data de término (formato: YYYY-MM ou YYYY, ou null se atual)",
      "description": "Descrição das responsabilidades e conquistas"
    }}
  ],
  "linkedin_education_json": [
    {{
      "institution": "Nome da instituição",
      "degree": "Grau obtido (ex: 'Bacharelado', 'Mestrado')",
      "field": "Área de estudo",
      "start_date": "Ano de início (YYYY)",
      "end_date": "Ano de conclusão (YYYY ou null se não concluído)"
    }}
  ],
  "linkedin_certifications_json": [
    {{
      "name": "Nome da certificação",
      "issuer": "Organização emissora",
      "issue_date": "Data de emissão (formato: YYYY-MM ou YYYY)",
      "expiration_date": "Data de expiração (formato: YYYY-MM ou YYYY, ou null se não expira)",
      "credential_id": "ID da credencial (se disponível)"
    }}
  ],
  "linkedin_skills": "Lista de habilidades separadas por vírgula (ex: 'Python, Django, FastAPI, PostgreSQL, AWS')",
  "linkedin_articles_json": [
    {{
      "title": "Título do artigo",
      "published_date": "Data de publicação (formato: YYYY-MM ou YYYY)",
      "url": "URL do artigo (se disponível)",
      "description": "Breve descrição (se disponível)"
    }}
  ],
  "linkedin_connections_count": número de conexões (se mencionado, senão null),
  "linkedin_followers_count": número de seguidores (se mencionado, senão null)
}}

IMPORTANTE:
- Retorne APENAS o JSON, sem markdown, sem código, sem explicações
- Se alguma informação não estiver disponível, use null
- Para arrays vazios, retorne []
- Para strings vazias, use ""
- Mantenha o formato de datas consistente
- linkedin_skills deve ser uma string única separada por vírgula, não um array
"""

    try:
        logger.info("🤖 [PDF PARSER] Enviando texto para LLM para análise...")
        response = llm.invoke(prompt)
        
        # Rastrear uso de tokens
        try:
            provider = settings.llm_provider.lower()
            model = settings.openai_model if provider == "openai" else settings.ollama_model
            token_info = extract_token_usage(response, provider)
            # Estimar prompt_tokens se não disponível (para Ollama)
            if token_info['prompt_tokens'] == 0 and token_info['total_tokens'] > 0:
                estimated_prompt = int(token_info['total_tokens'] * 0.7)
                token_info['prompt_tokens'] = estimated_prompt
                token_info['completion_tokens'] = token_info['total_tokens'] - estimated_prompt
            track_llm_tokens(
                session=session,
                tenant_id=tenant_id,
                user_id=user_id,
                provider=provider,
                model=model,
                prompt_tokens=token_info['prompt_tokens'],
                completion_tokens=token_info['completion_tokens'],
                total_tokens=token_info['total_tokens'],
                endpoint="/api/leads/parse-linkedin-pdf",
                feature="pdf_parsing"
            )
        except Exception as e:
            logger.warning(f"⚠️ Erro ao rastrear tokens: {e}")
        
        # Extrair conteúdo da resposta
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Limpar resposta (remover markdown code blocks se houver)
        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        elif response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parsear JSON
        try:
            parsed_data = json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.error(f"❌ [PDF PARSER] Erro ao parsear JSON da resposta do LLM: {e}")
            logger.error(f"❌ [PDF PARSER] Resposta recebida: {response_text[:500]}")
            raise ValueError(f"Resposta do LLM não é um JSON válido: {str(e)}")
        
        # Validar e normalizar dados
        normalized_data = {
            "linkedin_headline": parsed_data.get("linkedin_headline") or None,
            "linkedin_about": parsed_data.get("linkedin_about") or None,
            "linkedin_experience_json": json.dumps(parsed_data.get("linkedin_experience_json", []), ensure_ascii=False) if parsed_data.get("linkedin_experience_json") else None,
            "linkedin_education_json": json.dumps(parsed_data.get("linkedin_education_json", []), ensure_ascii=False) if parsed_data.get("linkedin_education_json") else None,
            "linkedin_certifications_json": json.dumps(parsed_data.get("linkedin_certifications_json", []), ensure_ascii=False) if parsed_data.get("linkedin_certifications_json") else None,
            "linkedin_skills": parsed_data.get("linkedin_skills") or None,
            "linkedin_articles_json": json.dumps(parsed_data.get("linkedin_articles_json", []), ensure_ascii=False) if parsed_data.get("linkedin_articles_json") else None,
            "linkedin_connections_count": parsed_data.get("linkedin_connections_count") if isinstance(parsed_data.get("linkedin_connections_count"), int) else None,
            "linkedin_followers_count": parsed_data.get("linkedin_followers_count") if isinstance(parsed_data.get("linkedin_followers_count"), int) else None,
        }
        
        # Remover campos None
        normalized_data = {k: v for k, v in normalized_data.items() if v is not None}
        
        logger.info(f"✅ [PDF PARSER] Dados extraídos: {list(normalized_data.keys())}")
        return normalized_data
        
    except ValueError:
        raise
    except ConnectionError as e:
        logger.error(f"❌ [PDF PARSER] Erro de conexão com LLM: {e}")
        raise ValueError(f"Erro de conexão com LLM: {str(e)}")
    except Exception as e:
        logger.error(f"❌ [PDF PARSER] Erro ao processar com LLM: {e}")
        raise ValueError(f"Erro ao analisar PDF com LLM: {str(e)}")

