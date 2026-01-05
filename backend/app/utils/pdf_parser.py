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
  "name": "Nome completo da pessoa (obrigatório se disponível)",
  "email": "Email de contato (se mencionado no PDF)",
  "phone": "Telefone de contato (se mencionado no PDF, apenas números e + se internacional)",
  "company": "Nome da empresa ATUAL onde a pessoa trabalha (OBRIGATÓRIO extrair da experiência mais recente ou do headline se não houver experiência explícita). Se não houver empresa atual, usar a mais recente. NUNCA deixe null se houver qualquer informação sobre empresa no texto.",
  "position": "Cargo/posição ATUAL da pessoa (OBRIGATÓRIO extrair da experiência mais recente ou do headline). Exemplos: 'Desenvolvedor Backend', 'Gerente de Vendas', 'CEO', 'Diretor de Marketing', etc. NUNCA deixe null se houver qualquer informação sobre cargo no texto.",
  "industry": "Setor/Indústria da empresa atual (ex: 'Tecnologia da Informação', 'Varejo', 'Saúde', 'Serviços Financeiros', 'Consultoria', 'Manufatura', 'Educação', 'Telecomunicações', etc.). Se não estiver explícito, INFERIR baseado no nome da empresa, tipo de cargo ou descrição da empresa. Exemplos: se a empresa é 'Microsoft' ou 'Google', industry é 'Tecnologia da Informação'. Se o cargo é 'Médico' ou 'Enfermeiro', industry pode ser 'Saúde'.",
  "website": "Website pessoal ou da empresa (se mencionado)",
  "linkedin_url": "URL do perfil do LinkedIn (se mencionado)",
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

INSTRUÇÕES CRÍTICAS:
- Retorne APENAS o JSON válido, sem markdown, sem código, sem explicações, sem texto antes ou depois
- NÃO use markdown code blocks (```json ou ```)
- NÃO adicione comentários ou explicações
- Se alguma informação não estiver disponível, use null (não use undefined, não deixe campos faltando)
- Para arrays vazios, retorne [] (array vazio, não null)
- Para strings vazias, use "" (string vazia, não null)
- Mantenha o formato de datas consistente
- linkedin_skills deve ser uma string única separada por vírgula, não um array
- ESCAPE corretamente todas as aspas dentro de strings usando \"
- NÃO use vírgulas finais antes de fechar objetos ou arrays
- Certifique-se de que todos os números estão sem aspas (exceto se forem parte de uma string)
- Certifique-se de que todos os valores null estão em minúsculas (null, não NULL ou None)

EXTRAÇÃO DE EMPRESA E CARGO:
- Para "company": SEMPRE extrair da experiência mais recente (atual) se disponível. Se não houver experiência explícita, extrair do headline ou do texto do perfil. NUNCA deixe null se houver qualquer menção a empresa no texto.
- Para "position": SEMPRE extrair da experiência mais recente (atual) se disponível. Se não houver experiência explícita, extrair do headline. NUNCA deixe null se houver qualquer menção a cargo/posição no texto.
- Se a pessoa tiver múltiplas experiências, priorizar SEMPRE a mais recente (atual) para company e position
- Exemplos de position: "Desenvolvedor Backend", "Gerente de Vendas", "CEO", "Diretor de Marketing", "Analista de Dados", etc.

EXTRAÇÃO DE SEGMENTO/INDUSTRIA:
- Para "industry": Tentar identificar o setor/indústria da empresa atual
- Se estiver explícito no texto, usar exatamente como está
- Se não estiver explícito, INFERIR baseado em:
  * Nome da empresa (ex: "Microsoft" → "Tecnologia da Informação", "Hospital X" → "Saúde")
  * Tipo de cargo (ex: "Médico" → "Saúde", "Engenheiro de Software" → "Tecnologia da Informação")
  * Descrição da empresa ou cargo
- Exemplos de industry: "Tecnologia da Informação", "Varejo", "Saúde", "Serviços Financeiros", "Consultoria", "Manufatura", "Educação", "Telecomunicações", "Construção Civil", "Alimentação", etc.
- Se realmente não conseguir inferir, use null
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
        
        # Tentar extrair JSON se houver texto antes/depois
        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(0)
        
        # Tentar corrigir problemas comuns de JSON
        # Remover vírgulas finais antes de fechar objetos/arrays
        response_text = re.sub(r',\s*}', '}', response_text)
        response_text = re.sub(r',\s*]', ']', response_text)
        
        # Parsear JSON
        parsed_data = None
        json_error = None
        try:
            parsed_data = json.loads(response_text)
        except json.JSONDecodeError as e:
            json_error = e
            logger.warning(f"⚠️ [PDF PARSER] Primeira tentativa de parse JSON falhou: {e}")
            logger.warning(f"⚠️ [PDF PARSER] Posição do erro: linha {e.lineno}, coluna {e.colno}")
            
            # Tentar corrigir problemas comuns
            try:
                # Tentar escapar caracteres de controle e quebras de linha problemáticas
                fixed_text = response_text
                # Remover caracteres de controle exceto \n, \r, \t
                fixed_text = ''.join(char for char in fixed_text if ord(char) >= 32 or char in '\n\r\t')
                
                # Tentar encontrar e extrair apenas o JSON válido
                # Procurar pelo primeiro { e último }
                first_brace = fixed_text.find('{')
                last_brace = fixed_text.rfind('}')
                if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                    fixed_text = fixed_text[first_brace:last_brace + 1]
                
                # Tentar corrigir problemas comuns de JSON
                # 1. Remover vírgulas finais
                fixed_text = re.sub(r',\s*}', '}', fixed_text)
                fixed_text = re.sub(r',\s*]', ']', fixed_text)
                
                # 2. Tentar corrigir aspas simples não escapadas (substituir por aspas duplas escapadas)
                # Mas apenas dentro de strings JSON (isso é complexo, então vamos ser conservadores)
                
                # 3. Tentar corrigir quebras de linha dentro de strings JSON
                # Substituir \n por \\n dentro de strings (mas isso é muito complexo sem parser)
                
                # 4. Tentar corrigir valores undefined/None para null
                fixed_text = re.sub(r'\bundefined\b', 'null', fixed_text)
                fixed_text = re.sub(r'\bNone\b', 'null', fixed_text)
                fixed_text = re.sub(r'\bNULL\b', 'null', fixed_text)
                
                # Tentar parsear novamente
                parsed_data = json.loads(fixed_text)
                logger.info("✅ [PDF PARSER] JSON corrigido com sucesso na segunda tentativa")
            except (json.JSONDecodeError, Exception) as e2:
                logger.error(f"❌ [PDF PARSER] Erro ao parsear JSON mesmo após correção: {e2}")
                logger.error(f"❌ [PDF PARSER] Resposta original (primeiros 1000 chars): {response_text[:1000]}")
                logger.error(f"❌ [PDF PARSER] Resposta original (últimos 500 chars): {response_text[-500:]}")
                
                # Tentar uma última vez com uma abordagem mais agressiva: usar json5 ou tentar reparar manualmente
                try:
                    # Tentar usar uma biblioteca de reparo de JSON se disponível
                    try:
                        import json5
                        parsed_data = json5.loads(response_text)
                        logger.info("✅ [PDF PARSER] JSON reparado usando json5")
                    except ImportError:
                        # json5 não disponível, tentar uma última correção manual
                        # Remover tudo que não seja JSON válido
                        lines = response_text.split('\n')
                        json_lines = []
                        in_json = False
                        brace_count = 0
                        for line in lines:
                            if '{' in line:
                                in_json = True
                            if in_json:
                                json_lines.append(line)
                                brace_count += line.count('{') - line.count('}')
                                if brace_count == 0 and '}' in line:
                                    break
                        
                        if json_lines:
                            fixed_text = '\n'.join(json_lines)
                            # Aplicar todas as correções novamente
                            fixed_text = re.sub(r',\s*}', '}', fixed_text)
                            fixed_text = re.sub(r',\s*]', ']', fixed_text)
                            fixed_text = re.sub(r'\bundefined\b', 'null', fixed_text)
                            fixed_text = re.sub(r'\bNone\b', 'null', fixed_text)
                            fixed_text = re.sub(r'\bNULL\b', 'null', fixed_text)
                            parsed_data = json.loads(fixed_text)
                            logger.info("✅ [PDF PARSER] JSON reparado manualmente na terceira tentativa")
                        else:
                            raise ValueError("Não foi possível extrair JSON válido")
                except Exception as e3:
                    logger.error(f"❌ [PDF PARSER] Todas as tentativas de reparo falharam: {e3}")
                    if json_error:
                        error_msg = f"Resposta do LLM não é um JSON válido: {str(json_error)}. Posição do erro: linha {json_error.lineno}, coluna {json_error.colno}"
                        # Adicionar contexto do erro
                        if json_error.lineno and json_error.colno:
                            lines = response_text.split('\n')
                            if json_error.lineno <= len(lines):
                                error_line = lines[json_error.lineno - 1]
                                error_msg += f"\nLinha com erro: {error_line[:200]}"
                                if json_error.colno:
                                    error_msg += f"\nPosição: {' ' * min(json_error.colno - 1, 50)}^"
                        raise ValueError(error_msg)
                    raise ValueError(f"Resposta do LLM não é um JSON válido: {str(e2)}")
        
        if parsed_data is None:
            raise ValueError("Não foi possível parsear a resposta do LLM como JSON")
        
        # Validar e normalizar dados
        normalized_data = {
            "name": parsed_data.get("name") or None,
            "email": parsed_data.get("email") or None,
            "phone": parsed_data.get("phone") or None,
            "company": parsed_data.get("company") or None,
            "position": parsed_data.get("position") or None,
            "industry": parsed_data.get("industry") or None,
            "website": parsed_data.get("website") or None,
            "linkedin_url": parsed_data.get("linkedin_url") or None,
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

