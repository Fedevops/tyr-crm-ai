import json
import re
import asyncio
import logging
import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional, List
from urllib.parse import urljoin
from app.agents.llm_helper import get_llm, is_llm_available
from app.config import settings
from datetime import datetime

# Configurar logger
logger = logging.getLogger(__name__)

# Importar googlesearch apenas se disponível
try:
    from googlesearch import search as google_search
    GOOGLE_SEARCH_AVAILABLE = True
except ImportError:
    GOOGLE_SEARCH_AVAILABLE = False
    logger.warning("⚠️ googlesearch-python não instalado. Google Search fallback não disponível.")

async def scrape_website(url: str) -> Dict[str, Any]:
    """Faz scraping do website do lead"""
    try:
        # Normalizar URL - adicionar https:// se não tiver protocolo
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
            logger.debug(f"🔧 [RESEARCHER] URL normalizada para: {url}")
        
        # Headers mais completos para evitar bloqueio
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        }
        
        logger.info(f"🌐 [RESEARCHER] Fazendo requisição para: {url}")
        
        # Adicionar timeout maior e verificar SSL
        response = requests.get(
            url, 
            headers=headers, 
            timeout=15,
            verify=True,
            allow_redirects=True
        )
        
        logger.info(f"📡 [RESEARCHER] Resposta recebida. Status: {response.status_code}")
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        logger.info(f"✅ [RESEARCHER] HTML parseado com sucesso. Tamanho: {len(response.content)} bytes")
        
        # Extrair informações básicas
        title = soup.find('title')
        meta_description = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
        
        # Extrair textos principais
        texts = []
        for tag in ['h1', 'h2', 'h3', 'p']:
            elements = soup.find_all(tag)
            texts.extend([elem.get_text(strip=True) for elem in elements if elem.get_text(strip=True)])
        
        logger.info(f"📝 [RESEARCHER] Extraídos {len(texts)} textos do site")
        
        # Extrair links importantes
        links = []
        for link in soup.find_all('a', href=True)[:20]:
            href = link.get('href')
            text = link.get_text(strip=True)
            if href and text:
                # Converter URLs relativas para absolutas
                if href.startswith('/'):
                    href = urljoin(url, href)
                links.append({'text': text, 'url': href})
        
        result = {
            'title': title.get_text(strip=True) if title else None,
            'description': meta_description.get('content') if meta_description else None,
            'main_texts': texts[:50],  # Limitar quantidade
            'important_links': links,
            'url': url,
            'soup': soup  # Retornar soup para extração de contatos
        }
        
        logger.info(f"✅ [RESEARCHER] Scraping concluído com sucesso!")
        return result
    except requests.exceptions.HTTPError as e:
        status_code = None
        if hasattr(e, 'response') and e.response is not None:
            status_code = e.response.status_code
        
        logger.error(f"❌ [RESEARCHER] Erro HTTP ao acessar {url}: Status {status_code}, Erro: {str(e)}")
        
        if status_code == 403:
            return {
                'success': False,
                'error': 'Acesso negado (403 Forbidden). O website possui proteção anti-bot que impede acesso automatizado.',
                'url': url,
                'status_code': 403,
                'suggestion': 'O site bloqueou o acesso automatizado. Tente acessar manualmente para coletar informações ou considere usar uma ferramenta de scraping mais avançada.'
            }
        return {
            'success': False,
            'error': f'Erro HTTP {status_code or "desconhecido"}: {str(e)}',
            'url': url,
            'status_code': status_code
        }
    except requests.exceptions.Timeout as e:
        logger.error(f"⏱️ [RESEARCHER] Timeout ao acessar {url}: {str(e)}")
        return {'success': False, 'error': 'Timeout ao acessar o website. O servidor demorou muito para responder.', 'url': url}
    except requests.exceptions.ConnectionError as e:
        logger.error(f"🔌 [RESEARCHER] Erro de conexão ao acessar {url}: {str(e)}")
        return {'success': False, 'error': f'Erro de conexão: {str(e)}', 'url': url}
    except requests.exceptions.SSLError as e:
        logger.error(f"🔒 [RESEARCHER] Erro SSL ao acessar {url}: {str(e)}")
        return {'success': False, 'error': f'Erro SSL ao acessar o website: {str(e)}', 'url': url}
    except Exception as e:
        logger.error(f"❌ [RESEARCHER] Erro inesperado ao acessar {url}: {str(e)}")
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': f'Erro inesperado: {str(e)}', 'url': url}


def extract_contact_info(soup: BeautifulSoup) -> Dict[str, Any]:
    """Extrai informações de contato do website"""
    contact_info = {
        'phone': None,
        'email': None,
        'address': None,
        'city': None,
        'state': None,
        'zip_code': None,
        'country': None
    }
    
    if not soup:
        return contact_info
    
    all_text = soup.get_text()
    
    # Extrair telefones (padrões brasileiros e internacionais)
    phone_patterns = [
        r'\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4}',  # Brasil: (11) 98765-4321
        r'\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}',  # Internacional
    ]
    
    for pattern in phone_patterns:
        matches = re.findall(pattern, all_text)
        if matches:
            phone = matches[0].strip()
            # Limpar formatação mas manter números e +
            phone_clean = re.sub(r'[^\d+]', '', phone)
            if len(phone_clean) >= 10:
                contact_info['phone'] = phone_clean
                break
    
    # Extrair emails
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, all_text)
    if emails:
        # Filtrar emails genéricos
        valid_emails = [e for e in emails if not any(x in e.lower() for x in ['example', 'test', 'noreply', 'no-reply'])]
        if valid_emails:
            contact_info['email'] = valid_emails[0]
    
    # Extrair endereço (buscar em seções específicas)
    contact_sections = soup.find_all(['footer', 'div'], class_=re.compile(r'contact|address|footer', re.I))
    for section in contact_sections:
        section_text = section.get_text()
        
        # Tentar encontrar CEP brasileiro
        cep_match = re.search(r'\d{5}[-]?\d{3}', section_text)
        if cep_match:
            contact_info['zip_code'] = cep_match.group()
        
        # Tentar encontrar cidade e estado
        city_state_pattern = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-,\s]*\s*([A-Z]{2})'
        city_state_match = re.search(city_state_pattern, section_text)
        if city_state_match:
            contact_info['city'] = city_state_match.group(1)
            contact_info['state'] = city_state_match.group(2)
        
        # Tentar encontrar endereço completo
        address_match = re.search(r'(?:Rua|Av|Avenida|Rodovia|Estrada|Praça|Alameda)[^,]+,\s*\d+[^,]*', section_text)
        if address_match:
            contact_info['address'] = address_match.group().strip()
    
    return contact_info


async def analyze_website_content(website_data: Dict[str, Any], lead_info: Dict[str, Any]) -> Dict[str, Any]:
    """Usa LLM para analisar o conteúdo do site e extrair informações relevantes"""
    llm = get_llm(temperature=0.3)
    
    if not llm:
        # Fallback sem LLM
        return {
            'summary': 'Análise básica do website realizada',
            'key_findings': website_data.get('main_texts', [])[:5],
            'recommendations': 'Configure LLM (OpenAI ou Ollama) no arquivo .env para análise avançada'
        }
    
    # Preparar conteúdo para análise
    content_text = '\n'.join(website_data.get('main_texts', [])[:100])
    
    prompt = f"""
    Você é um pesquisador especializado em análise de empresas para vendas B2B.
    
    Informações do Lead:
    - Nome: {lead_info.get('name', 'N/A')}
    - Empresa: {lead_info.get('company', 'N/A')}
    - Cargo: {lead_info.get('position', 'N/A')}
    
    Conteúdo do Website da Empresa:
    {content_text}
    
    Analise o website e extraia informações estruturadas. Retorne APENAS um JSON válido com a seguinte estrutura:
    {{
        "industry": "setor/indústria da empresa ou null",
        "company_size": "tamanho estimado (ex: '50-200 funcionários', 'Startup', 'Grande empresa') ou null",
        "context": "resumo completo da empresa incluindo: o que fazem, principais produtos/serviços, tecnologias utilizadas, dores/pain points identificados, oportunidades de vendas, e qualquer informação relevante para prospecção. Seja detalhado mas objetivo.",
        "pain_points": ["dor 1", "dor 2", "..."],
        "opportunities": ["oportunidade 1", "oportunidade 2", "..."]
    }}
    
    IMPORTANTE:
    - O campo "context" deve ser um texto completo e detalhado (mínimo 200 palavras) sobre a empresa
    - Se um campo não for encontrado, retorne null
    - Seja preciso e extraia apenas informações claramente presentes no conteúdo
    - O contexto deve ser útil para um SDR fazer uma abordagem personalizada
    """
    
    try:
        response = llm.invoke(prompt)
        # Tentar extrair JSON da resposta
        content = response.content
        
        # Se a resposta já é JSON, parsear
        if content.strip().startswith('{'):
            return json.loads(content)
        else:
            # Se não, criar estrutura básica
            return {
                'summary': content[:500],
                'analysis': content,
                'extracted_data': {
                    'industry': 'A ser identificado',
                    'company_size': 'A ser identificado',
                    'products': 'A ser identificado'
                }
            }
    except Exception as e:
        return {
            'error': f'Erro na análise: {str(e)}',
            'raw_content': content_text[:500]
        }


async def enrich_lead_data_with_llm(website_data: Dict[str, Any], contact_info: Dict[str, Any], lead_info: Dict[str, Any]) -> Dict[str, Any]:
    """Usa LLM para extrair e estruturar dados do lead"""
    llm = get_llm(temperature=0.2)  # Mais preciso para extração de dados
    
    if not llm:
        # Fallback sem LLM - retornar apenas dados de contato extraídos
        return {
            **contact_info,
            'industry': None,
            'company_size': None,
            'context': 'Análise básica realizada. Configure LLM (OpenAI ou Ollama) no arquivo .env para análise avançada.'
        }
    
    content_text = '\n'.join(website_data.get('main_texts', [])[:150])
    
    prompt = f"""
    Você é um especialista em extração de dados de empresas a partir de websites.
    
    Informações já conhecidas do Lead:
    - Nome: {lead_info.get('name', 'N/A')}
    - Empresa: {lead_info.get('company', 'N/A')}
    - Cargo: {lead_info.get('position', 'N/A')}
    
    Conteúdo do Website:
    {content_text}
    
    Informações de contato já extraídas:
    {json.dumps(contact_info, indent=2)}
    
    Analise o conteúdo e extraia informações estruturadas. Retorne APENAS um JSON válido com a seguinte estrutura:
    {{
        "phone": "telefone encontrado ou null",
        "email": "email encontrado ou null",
        "address": "endereço completo ou null",
        "city": "cidade ou null",
        "state": "estado (sigla) ou null",
        "zip_code": "CEP ou null",
        "country": "país ou 'Brasil'",
        "industry": "setor/indústria da empresa",
        "company_size": "tamanho estimado (ex: '50-200 funcionários', 'Startup', 'Grande empresa')",
        "context": "resumo completo da empresa incluindo: o que fazem, principais produtos/serviços, tecnologias utilizadas, dores/pain points identificados, oportunidades de vendas, e qualquer informação relevante para prospecção. Seja detalhado mas objetivo (mínimo 200 palavras)."
    }}
    
    IMPORTANTE:
    - Se um campo não for encontrado, retorne null
    - Para telefone, use apenas números e + se internacional
    - Para CEP brasileiro, use formato 12345-678
    - Para estado, use sigla (SP, RJ, MG, etc)
    - O campo "context" é crítico e deve ser um texto completo e detalhado
    - Seja preciso e extraia apenas informações claramente presentes no conteúdo
    """
    
    try:
        response = llm.invoke(prompt)
        content = response.content.strip()
        
        # Remover markdown code blocks se existirem
        if '```json' in content:
            content = content.split('```json')[1].split('```')[0]
        elif '```' in content:
            content = content.split('```')[1].split('```')[0]
        
        extracted = json.loads(content)
        
        # Mesclar com informações já extraídas (priorizar dados já encontrados)
        enriched_data = {**contact_info}
        for key, value in extracted.items():
            if value and (not enriched_data.get(key) or enriched_data.get(key) == 'null'):
                enriched_data[key] = value
        
        return enriched_data
    except Exception as e:
        logger.error(f"Erro ao enriquecer dados com LLM: {e}")
        return contact_info


async def enrich_via_google_search(company_name: str, domain: str, lead_info: Dict[str, Any]) -> Dict[str, Any]:
    """Enriquece lead usando busca no Google + LLM quando scraping direto falha"""
    if not GOOGLE_SEARCH_AVAILABLE:
        return {'success': False, 'error': 'Google Search não disponível (biblioteca não instalada)'}
    
    if not is_llm_available():
        return {'success': False, 'error': 'LLM não configurado. Configure OpenAI ou Ollama no arquivo .env'}
    
    logger.info(f"🔍 [GOOGLE SEARCH] Buscando informações sobre: {company_name}")
    
    # Verificar assinatura da função google_search para debug
    try:
        import inspect
        sig = inspect.signature(google_search)
        logger.debug(f"📋 [GOOGLE SEARCH] Assinatura da função: {sig}")
    except Exception as e:
        logger.debug(f"⚠️ [GOOGLE SEARCH] Não foi possível obter assinatura: {e}")
    
    try:
        # Buscar informações públicas sobre a empresa
        # Usar queries mais simples e diretas para aumentar chances de resultados
        search_queries = [
            company_name,  # Query mais simples primeiro
            f'{company_name} contato',
            f'{company_name} telefone endereço',
            f'site:{domain}',
        ]
        
        search_results = []
        for i, query in enumerate(search_queries[:3], 1):  # Limitar para não exceder rate limits
            try:
                logger.info(f"🔍 [GOOGLE SEARCH] Buscando query {i}/3: {query}")
                # googlesearch-python: baseado na assinatura real: (term, num_results=10, lang='en', ...)
                # A biblioteca aceita: term, num_results, lang, mas NÃO aceita tld, stop, pause
                results = []
                try:
                    # Usar parâmetros corretos: term (query), num_results, lang
                    # Aumentar num_results para 10 para ter mais chances de encontrar resultados
                    logger.info(f"📋 [GOOGLE SEARCH] Buscando: '{query}' (num_results=10, lang='pt')")
                    results = list(google_search(term=query, num_results=10, lang='pt'))
                    logger.info(f"✅ [GOOGLE SEARCH] Query {i} retornou {len(results)} resultados")
                    if results:
                        logger.info(f"📋 [GOOGLE SEARCH] Primeiros resultados da query {i}: {results[:3]}")
                        search_results.extend(results[:5])  # Usar mais resultados por query
                    else:
                        logger.warning(f"⚠️ [GOOGLE SEARCH] Query {i} não retornou resultados")
                except Exception as e:
                    logger.warning(f"⚠️ [GOOGLE SEARCH] Erro na busca para query '{query}': {e}")
                    import traceback
                    traceback.print_exc()
                    continue
                await asyncio.sleep(1)  # Delay entre buscas
            except Exception as e:
                logger.warning(f"⚠️ [GOOGLE SEARCH] Erro na busca Google para query '{query}': {e}")
                logger.warning(f"⚠️ [GOOGLE SEARCH] Tipo do erro: {type(e).__name__}")
                import traceback
                traceback.print_exc()
                continue
        
        # Remover duplicatas mantendo ordem
        seen = set()
        unique_results = []
        for url in search_results:
            if url not in seen:
                seen.add(url)
                unique_results.append(url)
        search_results = unique_results
        
        logger.info(f"📊 [GOOGLE SEARCH] Total de resultados únicos: {len(search_results)}")
        if search_results:
            logger.info(f"📋 [GOOGLE SEARCH] Primeiros resultados: {search_results[:3]}")
        
        if not search_results:
            return {'success': False, 'error': f'Nenhum resultado encontrado no Google para "{company_name}". Tente verificar o nome da empresa ou usar APIs pagas como Hunter.io ou Clearbit.'}
        
        logger.info(f"✅ [GOOGLE SEARCH] Encontrados {len(search_results)} resultados únicos")
        
        # Usar LLM para analisar resultados e extrair informações
        llm = get_llm(temperature=0.2)
        if not llm:
            return {'success': False, 'error': 'LLM não disponível para análise de resultados'}
        
        results_text = '\n'.join([f"- {url}" for url in search_results[:10]])
        
        prompt = f"""
        Você é um especialista em pesquisa de empresas para vendas B2B.
        
        Informações conhecidas do Lead:
        - Nome: {lead_info.get('name', 'N/A')}
        - Empresa: {company_name}
        - Cargo: {lead_info.get('position', 'N/A')}
        - Domínio: {domain}
        
        Resultados de busca no Google sobre esta empresa:
        {results_text}
        
        Com base nos resultados de busca acima, extraia informações estruturadas sobre a empresa.
        Retorne APENAS um JSON válido com a seguinte estrutura:
        {{
            "phone": "telefone encontrado ou null",
            "email": "email encontrado ou null",
            "address": "endereço completo ou null",
            "city": "cidade ou null",
            "state": "estado (sigla) ou null",
            "zip_code": "CEP ou null",
            "country": "país ou 'Brasil'",
            "industry": "setor/indústria da empresa",
            "company_size": "tamanho estimado (ex: '50-200 funcionários', 'Startup', 'Grande empresa')",
            "context": "resumo completo da empresa incluindo: o que fazem, principais produtos/serviços, tecnologias utilizadas, dores/pain points identificados, oportunidades de vendas, e qualquer informação relevante para prospecção. Seja detalhado mas objetivo (mínimo 200 palavras)."
        }}
        
        IMPORTANTE:
        - Se um campo não for encontrado, retorne null
        - Para telefone, use apenas números e + se internacional
        - Para CEP brasileiro, use formato 12345-678
        - Para estado, use sigla (SP, RJ, MG, etc)
        - O campo "context" é crítico e deve ser um texto completo e detalhado
        - Seja preciso e extraia apenas informações que podem ser inferidas dos resultados de busca
        """
        
        logger.info(f"🤖 [GOOGLE SEARCH] Enviando {len(search_results)} resultados para análise com LLM...")
        logger.info(f"📝 [GOOGLE SEARCH] Prompt length: {len(prompt)} caracteres")
        
        try:
            response = llm.invoke(prompt)
            logger.info(f"✅ [GOOGLE SEARCH] Resposta do LLM recebida. Tamanho: {len(response.content)} caracteres")
            content = response.content.strip()
            
            # Remover markdown code blocks se existirem
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
                logger.debug("🔧 [GOOGLE SEARCH] Removido markdown code block (```json)")
            elif '```' in content:
                content = content.split('```')[1].split('```')[0]
                logger.debug("🔧 [GOOGLE SEARCH] Removido markdown code block (```)")
            
            logger.info(f"📋 [GOOGLE SEARCH] Tentando fazer parse do JSON...")
            logger.debug(f"📋 [GOOGLE SEARCH] Primeiros 500 caracteres da resposta: {content[:500]}")
            
            extracted = json.loads(content)
            logger.info(f"✅ [GOOGLE SEARCH] JSON parseado com sucesso! Campos extraídos: {list(extracted.keys())}")
            
            return {
                'success': True,
                'enriched_data': extracted,
                'method': 'google_search',
                'sources': search_results[:5]
            }
        except json.JSONDecodeError as json_error:
            logger.error(f"❌ [GOOGLE SEARCH] Erro ao fazer parse do JSON retornado pelo LLM: {json_error}")
            logger.error(f"📋 [GOOGLE SEARCH] Conteúdo que falhou: {content[:1000]}")
            return {'success': False, 'error': f'Erro ao processar resposta do LLM: JSON inválido. O modelo pode ter retornado texto não estruturado.'}
        except Exception as llm_error:
            logger.error(f"❌ [GOOGLE SEARCH] Erro ao invocar LLM: {llm_error}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': f'Erro ao processar com LLM: {str(llm_error)}'}
        
    except Exception as e:
        logger.error(f"❌ [GOOGLE SEARCH] Erro geral: {e}")
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': f'Erro na busca Google: {str(e)}'}


async def enrich_via_hunter_api(domain: str, company_name: str = None) -> Dict[str, Any]:
    """Enriquece lead usando Hunter.io API para buscar emails e informações por domínio"""
    if not settings.hunter_api_key:
        return {'success': False, 'error': 'Hunter.io API key não configurada'}
    
    logger.info(f"🔍 [HUNTER.IO] Buscando informações do domínio: {domain}")
    
    try:
        # Buscar informações do domínio
        url = f"https://api.hunter.io/v2/domain-search"
        params = {
            'domain': domain,
            'api_key': settings.hunter_api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get('data'):
            domain_data = data['data']
            
            # Extrair emails encontrados
            emails = []
            if domain_data.get('emails'):
                emails = [email.get('value') for email in domain_data['emails'][:5]]
            
            # Extrair outras informações
            enriched_data = {
                'email': emails[0] if emails else None,
                'phone': domain_data.get('phone_numbers', [None])[0] if domain_data.get('phone_numbers') else None,
                'company_size': f"{domain_data.get('employees', 'N/A')} funcionários" if domain_data.get('employees') else None,
                'industry': domain_data.get('industry') if domain_data.get('industry') else None,
                'country': domain_data.get('country') if domain_data.get('country') else 'Brasil',
                'context': f"Informações da empresa {company_name or domain}: "
            }
            
            # Adicionar contexto se houver descrição
            if domain_data.get('description'):
                enriched_data['context'] += domain_data['description']
            
            logger.info(f"✅ [HUNTER.IO] Encontradas informações: email={enriched_data.get('email')}, telefone={enriched_data.get('phone')}")
            
            return {
                'success': True,
                'enriched_data': enriched_data,
                'method': 'hunter_io',
                'emails_found': emails
            }
        else:
            return {'success': False, 'error': 'Nenhuma informação encontrada no Hunter.io'}
            
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if hasattr(e, 'response') and e.response else None
        error_msg = f'Erro HTTP {status_code} na API Hunter.io'
        if status_code == 401:
            error_msg = 'API key do Hunter.io inválida ou expirada'
        elif status_code == 429:
            error_msg = 'Limite de requisições do Hunter.io excedido'
        return {'success': False, 'error': error_msg}
    except Exception as e:
        logger.error(f"❌ [HUNTER.IO] Erro: {e}")
        return {'success': False, 'error': f'Erro na API Hunter.io: {str(e)}'}


async def enrich_via_clearbit_api(domain: str) -> Dict[str, Any]:
    """Enriquece lead usando Clearbit API para buscar informações empresariais"""
    if not settings.clearbit_api_key:
        return {'success': False, 'error': 'Clearbit API key não configurada'}
    
    logger.info(f"🔍 [CLEARBIT] Buscando informações do domínio: {domain}")
    
    try:
        url = f"https://company.clearbit.com/v2/companies/find?domain={domain}"
        headers = {
            'Authorization': f'Bearer {settings.clearbit_api_key}'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        enriched_data = {
            'phone': data.get('phone') if data.get('phone') else None,
            'address': data.get('geo', {}).get('streetNumber', '') + ' ' + data.get('geo', {}).get('streetName', '') if data.get('geo') else None,
            'city': data.get('geo', {}).get('city') if data.get('geo') else None,
            'state': data.get('geo', {}).get('state') if data.get('geo') else None,
            'zip_code': data.get('geo', {}).get('zip') if data.get('geo') else None,
            'country': data.get('geo', {}).get('country') if data.get('geo') else None,
            'industry': data.get('category', {}).get('industry') if data.get('category') else None,
            'company_size': f"{data.get('metrics', {}).get('employees', 'N/A')} funcionários" if data.get('metrics', {}).get('employees') else None,
            'context': data.get('description') if data.get('description') else None
        }
        
        # Limpar valores None
        enriched_data = {k: v for k, v in enriched_data.items() if v}
        
        logger.info(f"✅ [CLEARBIT] Encontradas informações: {len(enriched_data)} campos")
        
        return {
            'success': True,
            'enriched_data': enriched_data,
            'method': 'clearbit'
        }
        
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if hasattr(e, 'response') and e.response else None
        error_msg = f'Erro HTTP {status_code} na API Clearbit'
        if status_code == 401:
            error_msg = 'API key do Clearbit inválida ou expirada'
        elif status_code == 404:
            error_msg = 'Domínio não encontrado no Clearbit'
        elif status_code == 429:
            error_msg = 'Limite de requisições do Clearbit excedido'
        return {'success': False, 'error': error_msg}
    except Exception as e:
        logger.error(f"❌ [CLEARBIT] Erro: {e}")
        return {'success': False, 'error': f'Erro na API Clearbit: {str(e)}'}


async def enrich_via_serper_api(company_name: str, domain: str, lead_info: Dict[str, Any]) -> Dict[str, Any]:
    """Enriquece lead usando Serper.dev API (Google Search + Knowledge Graph)"""
    logger.info(f"🔍 [SERPER] Função chamada para: {company_name} (domínio: {domain})")
    logger.info(f"🔍 [SERPER] API key presente: {settings.serper_api_key is not None}")
    
    if not settings.serper_api_key:
        logger.warning("⚠️ [SERPER] API key não configurada")
        return {'success': False, 'error': 'Serper.dev API key não configurada'}
    
    logger.info(f"🔍 [SERPER] Buscando informações sobre: {company_name} (domínio: {domain})")
    
    try:
        enriched_data = {}
        sources = []
        
        # Usar Serper Search API que retorna knowledge graph automaticamente
        search_url = "https://google.serper.dev/search"
        search_payload = {
            "q": company_name,
            "gl": "br",  # Brasil
            "hl": "pt",  # Português
            "num": 10
        }
        
        headers = {
            'X-API-KEY': settings.serper_api_key,
            'Content-Type': 'application/json'
        }
        
        try:
            logger.info(f"📋 [SERPER] Fazendo requisição POST para: {search_url}")
            logger.info(f"📋 [SERPER] Payload: {search_payload}")
            response = requests.post(search_url, json=search_payload, headers=headers, timeout=10)
            logger.info(f"📡 [SERPER] Resposta recebida. Status: {response.status_code}")
            response.raise_for_status()
            
            data = response.json()
            logger.info(f"✅ [SERPER] JSON parseado com sucesso. Keys: {list(data.keys())}")
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if hasattr(e, 'response') and e.response else None
            error_msg = f'Erro HTTP {status_code} na API Serper'
            if status_code == 401:
                error_msg = 'API key do Serper inválida ou expirada'
            elif status_code == 429:
                error_msg = 'Limite de requisições do Serper excedido'
            logger.error(f"❌ [SERPER] {error_msg}")
            return {'success': False, 'error': error_msg}
        
        # Extrair informações do Knowledge Graph se disponível
        if 'knowledgeGraph' in data:
            kg = data['knowledgeGraph']
            logger.info(f"✅ [SERPER] Knowledge Graph encontrado!")
            
            if kg.get('title'):
                logger.debug(f"📋 [SERPER] Título: {kg.get('title')}")
            
            if kg.get('description'):
                enriched_data['context'] = kg.get('description')
            
            if kg.get('type'):
                enriched_data['industry'] = kg.get('type')
            
            # Extrair atributos do Knowledge Graph
            if 'attributes' in kg:
                attrs = kg['attributes']
                for attr in attrs:
                    if attr.get('label') == 'Telefone' or attr.get('label') == 'Phone':
                        enriched_data['phone'] = attr.get('value')
                    elif attr.get('label') == 'Endereço' or attr.get('label') == 'Address':
                        enriched_data['address'] = attr.get('value')
                    elif attr.get('label') == 'Cidade' or attr.get('label') == 'City':
                        enriched_data['city'] = attr.get('value')
                    elif attr.get('label') == 'Estado' or attr.get('label') == 'State':
                        enriched_data['state'] = attr.get('value')
        
        # Extrair informações dos resultados de busca orgânicos
        if 'organic' in data:
            organic_results = data['organic'][:5]  # Primeiros 5 resultados
            sources = [r.get('link', '') for r in organic_results if r.get('link')]
            logger.info(f"📋 [SERPER] Encontrados {len(organic_results)} resultados orgânicos")
            
            # Usar LLM para extrair informações dos snippets
            if is_llm_available() and organic_results:
                snippets = [r.get('snippet', '') for r in organic_results if r.get('snippet')]
                snippets_text = '\n'.join(snippets[:3])  # Primeiros 3 snippets
                
                llm = get_llm(temperature=0.2)
                if llm:
                    prompt = f"""
                    Você é um especialista em pesquisa de empresas para vendas B2B.
                    
                    Informações conhecidas do Lead:
                    - Nome: {lead_info.get('name', 'N/A')}
                    - Empresa: {company_name}
                    - Cargo: {lead_info.get('position', 'N/A')}
                    - Domínio: {domain}
                    
                    Snippets de resultados do Google sobre esta empresa:
                    {snippets_text}
                    
                    Com base nos snippets acima, extraia informações estruturadas sobre a empresa.
                    Retorne APENAS um JSON válido com a seguinte estrutura:
                    {{
                        "phone": "telefone encontrado ou null",
                        "email": "email encontrado ou null",
                        "address": "endereço completo ou null",
                        "city": "cidade ou null",
                        "state": "estado (sigla) ou null",
                        "zip_code": "CEP ou null",
                        "country": "país ou 'Brasil'",
                        "industry": "setor/indústria da empresa",
                        "company_size": "tamanho estimado (ex: '50-200 funcionários', 'Startup', 'Grande empresa')",
                        "context": "resumo completo da empresa incluindo: o que fazem, principais produtos/serviços, tecnologias utilizadas, dores/pain points identificados, oportunidades de vendas, e qualquer informação relevante para prospecção. Seja detalhado mas objetivo (mínimo 200 palavras)."
                    }}
                    
                    IMPORTANTE:
                    - Se um campo não for encontrado, retorne null
                    - Para telefone, use apenas números e + se internacional
                    - Para CEP brasileiro, use formato 12345-678
                    - Para estado, use sigla (SP, RJ, MG, etc)
                    - O campo "context" é crítico e deve ser um texto completo e detalhado
                    - Seja preciso e extraia apenas informações que podem ser inferidas dos snippets
                    """
                    
                    try:
                        llm_response = llm.invoke(prompt)
                        content = llm_response.content.strip()
                        
                        # Remover markdown code blocks se existirem
                        if '```json' in content:
                            content = content.split('```json')[1].split('```')[0]
                        elif '```' in content:
                            content = content.split('```')[1].split('```')[0]
                        
                        extracted = json.loads(content)
                        
                        # Mesclar dados extraídos (priorizar dados do Knowledge Graph)
                        for key, value in extracted.items():
                            if value and (key not in enriched_data or not enriched_data.get(key)):
                                enriched_data[key] = value
                        
                        logger.info(f"✅ [SERPER] LLM extraiu {len(extracted)} campos dos snippets")
                    except Exception as llm_error:
                        logger.warning(f"⚠️ [SERPER] Erro ao processar com LLM: {llm_error}")
        
        # Limpar valores None
        enriched_data = {k: v for k, v in enriched_data.items() if v}
        
        if enriched_data:
            logger.info(f"✅ [SERPER] Encontradas informações: {list(enriched_data.keys())}")
            return {
                'success': True,
                'enriched_data': enriched_data,
                'method': 'serper',
                'sources': sources[:5]
            }
        else:
            return {'success': False, 'error': 'Nenhuma informação estruturada encontrada no Serper'}
            
    except Exception as e:
        logger.error(f"❌ [SERPER] Erro na função enrich_via_serper_api: {e}")
        import traceback
        logger.error(f"❌ [SERPER] Traceback completo: {traceback.format_exc()}")
        return {'success': False, 'error': f'Erro na API Serper: {str(e)}'}


async def enrich_via_rapidapi_linkedin(linkedin_url: str, lead_info: Dict[str, Any]) -> Dict[str, Any]:
    """Enriquece lead usando RapidAPI para extrair dados do LinkedIn"""
    logger.info(f"🔍 [RAPIDAPI LINKEDIN] Função chamada. URL: {linkedin_url}")
    logger.info(f"🔍 [RAPIDAPI LINKEDIN] RapidAPI key presente: {settings.rapidapi_key is not None}")
    logger.info(f"🔍 [RAPIDAPI LINKEDIN] Host configurado: {settings.rapidapi_linkedin_host}")
    
    if not settings.rapidapi_key:
        logger.warning("⚠️ [RAPIDAPI LINKEDIN] API key não configurada")
        return {'success': False, 'error': 'RapidAPI key não configurada'}
    
    if not linkedin_url:
        logger.warning("⚠️ [RAPIDAPI LINKEDIN] URL do LinkedIn não fornecida")
        return {'success': False, 'error': 'URL do LinkedIn não fornecida'}
    
    logger.info(f"🔍 [RAPIDAPI LINKEDIN] Buscando informações do LinkedIn: {linkedin_url}")
    
    try:
        enriched_data = {}
        sources = []
        
        # Extrair username ou ID do LinkedIn da URL
        # Exemplos: linkedin.com/in/username, linkedin.com/company/company-name
        linkedin_username = None
        if '/in/' in linkedin_url:
            linkedin_username = linkedin_url.split('/in/')[-1].split('/')[0].split('?')[0]
        elif '/company/' in linkedin_url:
            linkedin_username = linkedin_url.split('/company/')[-1].split('/')[0].split('?')[0]
        
        if not linkedin_username:
            logger.warning(f"⚠️ [RAPIDAPI LINKEDIN] Não foi possível extrair username da URL: {linkedin_url}")
            return {'success': False, 'error': 'URL do LinkedIn inválida. Use formato: https://www.linkedin.com/in/username'}
        
        logger.info(f"📋 [RAPIDAPI LINKEDIN] Username extraído: {linkedin_username}")
        
        # Usar a API do RapidAPI para LinkedIn
        # Nota: O endpoint pode variar dependendo da API escolhida no RapidAPI
        # linkedin-api8 geralmente usa POST com a URL completa no body
        headers = {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': settings.rapidapi_linkedin_host,
            'Content-Type': 'application/json'
        }
        
        logger.info(f"📋 [RAPIDAPI LINKEDIN] Headers: X-RapidAPI-Key={'*' * 10}... (oculto por segurança)")
        logger.info(f"📋 [RAPIDAPI LINKEDIN] Host: {settings.rapidapi_linkedin_host}")
        
        # Formato correto baseado na documentação: GET com username como query parameter
        # curl --request GET --url 'https://linkedin-data-api.p.rapidapi.com/?username=adamselipsky'
        endpoint = settings.rapidapi_linkedin_endpoint if settings.rapidapi_linkedin_endpoint else "/"
        
        # Se endpoint customizado configurado, usar apenas ele
        if settings.rapidapi_linkedin_endpoint:
            logger.info(f"📋 [RAPIDAPI LINKEDIN] Usando endpoint customizado: {settings.rapidapi_linkedin_endpoint}")
            endpoints_to_try = [
                {
                    'method': 'GET',
                    'url': f"https://{settings.rapidapi_linkedin_host}{settings.rapidapi_linkedin_endpoint}",
                    'payload': None,
                    'params': {'username': linkedin_username},
                    'description': f'GET {settings.rapidapi_linkedin_endpoint}?username=...'
                },
            ]
        else:
            # Formato padrão baseado na documentação oficial
            endpoints_to_try = [
                # Formato oficial: GET com username como query parameter
                {
                    'method': 'GET',
                    'url': f"https://{settings.rapidapi_linkedin_host}/",
                    'payload': None,
                    'params': {'username': linkedin_username},
                    'description': 'GET /?username=... (formato oficial)'
                },
                # Fallback: tentar outros formatos comuns
                {
                    'method': 'GET',
                    'url': f"https://{settings.rapidapi_linkedin_host}/profile",
                    'payload': None,
                    'params': {'username': linkedin_username},
                    'description': 'GET /profile?username=...'
                },
                {
                    'method': 'POST',
                    'url': f"https://{settings.rapidapi_linkedin_host}/",
                    'payload': {'username': linkedin_username},
                    'description': 'POST / com username no body'
                },
            ]
        
        last_error = None
        for endpoint_config in endpoints_to_try:
            try:
                method = endpoint_config['method']
                api_url = endpoint_config['url']
                payload = endpoint_config.get('payload')
                params = endpoint_config.get('params')
                description = endpoint_config['description']
                
                logger.info(f"📋 [RAPIDAPI LINKEDIN] Tentando {description}: {method} {api_url}")
                
                if method == 'POST':
                    if payload:
                        logger.info(f"📋 [RAPIDAPI LINKEDIN] Payload: {payload}")
                        response = requests.post(api_url, json=payload, headers=headers, timeout=15)
                    else:
                        response = requests.post(api_url, headers=headers, timeout=15)
                else:  # GET
                    if params:
                        response = requests.get(api_url, params=params, headers=headers, timeout=15)
                    else:
                        response = requests.get(api_url, headers=headers, timeout=15)
                
                logger.info(f"📡 [RAPIDAPI LINKEDIN] Resposta recebida ({description}). Status: {response.status_code}")
                
                # Log do conteúdo da resposta (primeiros 500 caracteres)
                response_text = response.text[:500]
                logger.info(f"📡 [RAPIDAPI LINKEDIN] Conteúdo da resposta (primeiros 500 chars): {response_text}")
                
                # Se sucesso HTTP (2xx), verificar o conteúdo da resposta
                if 200 <= response.status_code < 300:
                    data = response.json()
                    logger.info(f"✅ [RAPIDAPI LINKEDIN] {description} retornou HTTP 200. Keys: {list(data.keys())}")
                    logger.info(f"✅ [RAPIDAPI LINKEDIN] Dados recebidos (primeiros 1000 chars): {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}")
                    
                    # Verificar se a resposta indica sucesso ou falha
                    if data.get('success') is False:
                        error_message = data.get('message', 'Serviço não disponível')
                        logger.warning(f"⚠️ [RAPIDAPI LINKEDIN] API retornou success=false: {error_message}")
                        
                        # Se a mensagem indica que o serviço não está mais disponível
                        if 'no longer providing' in error_message.lower() or 'not available' in error_message.lower():
                            error_msg = f'A API do LinkedIn não está mais disponível: {error_message}. Tente usar outra API do RapidAPI ou configure uma alternativa.'
                            logger.error(f"❌ [RAPIDAPI LINKEDIN] {error_msg}")
                            return {'success': False, 'error': error_msg, 'api_unavailable': True}
                        
                        # Outro tipo de erro na resposta
                        last_error = f'API retornou success=false: {error_message}'
                        logger.warning(f"⚠️ [RAPIDAPI LINKEDIN] {last_error}. Tentando próximo formato...")
                        continue
                    
                    # Se chegou aqui, a resposta indica sucesso
                    # Sair do loop - encontramos o formato correto e os dados
                    break
                elif response.status_code == 404:
                    # 404 pode significar endpoint incorreto, tentar próximo
                    error_detail = response.text[:500] if response.text else "Sem detalhes"
                    logger.warning(f"⚠️ [RAPIDAPI LINKEDIN] {description} retornou 404: {error_detail}. Tentando próximo formato...")
                    last_error = f'Endpoint não encontrado: {error_detail}'
                    continue
                else:
                    # Outro erro HTTP, tentar próximo formato
                    error_detail = response.text[:500] if response.text else "Sem detalhes"
                    logger.warning(f"⚠️ [RAPIDAPI LINKEDIN] {description} retornou {response.status_code}: {error_detail}. Tentando próximo formato...")
                    last_error = f'Erro HTTP {response.status_code}: {error_detail}'
                    continue
                    
            except requests.exceptions.RequestException as e:
                logger.warning(f"⚠️ [RAPIDAPI LINKEDIN] {description} falhou com exceção: {str(e)}. Tentando próximo formato...")
                last_error = f'Erro na requisição: {str(e)}'
                continue
        
        # Se chegou aqui, nenhum formato funcionou
        if 'data' not in locals():
            error_msg = f'''Todos os formatos de endpoint falharam. O endpoint '/profile' não existe nesta API.

Para resolver:
1. Acesse a página da API no RapidAPI (https://rapidapi.com)
2. Encontre a seção "Endpoints" ou "Documentation"
3. Identifique o endpoint correto (ex: /v1/profile, /api/profile, etc.)
4. Configure no .env: RAPIDAPI_LINKEDIN_ENDPOINT=/endpoint-correto

Último erro: {last_error if last_error else "desconhecido"}

Veja o arquivo ENCONTRAR_ENDPOINT_RAPIDAPI.md para instruções detalhadas.'''
            logger.error(f"❌ [RAPIDAPI LINKEDIN] {error_msg}")
            return {'success': False, 'error': error_msg}
        
        # Extrair informações do perfil do LinkedIn
        # A estrutura pode variar dependendo da API do RapidAPI usada
        # Vou criar uma estrutura genérica que funciona com diferentes formatos
        
        # Nome completo
        if 'fullName' in data or 'name' in data:
            # Já temos o nome do lead, mas podemos validar
            pass
        
        # Headline/Título Profissional
        if 'headline' in data:
            enriched_data['linkedin_headline'] = data.get('headline', '')
            # Também usar para position se não tiver
            if not lead_info.get('position') or lead_info.get('position') == '':
                enriched_data['position'] = data.get('headline', '')
        
        # Sobre/About
        if 'summary' in data or 'about' in data:
            summary = data.get('summary') or data.get('about', '')
            if summary:
                enriched_data['linkedin_about'] = summary
                # Adicionar ao contexto se já existir, ou criar novo
                current_context = lead_info.get('context', '')
                if current_context:
                    enriched_data['context'] = f"{current_context}\n\nInformações do LinkedIn:\n{summary}"
                else:
                    enriched_data['context'] = f"Informações do LinkedIn:\n{summary}"
        
        # Localização
        if 'location' in data:
            location = data.get('location', '')
            if location:
                # Tentar extrair cidade e estado
                location_parts = location.split(',')
                if len(location_parts) >= 2:
                    enriched_data['city'] = location_parts[0].strip()
                    enriched_data['state'] = location_parts[1].strip()
                else:
                    enriched_data['city'] = location
        
        # Empresa atual
        if 'currentCompany' in data:
            company = data.get('currentCompany', {})
            if isinstance(company, dict):
                if 'name' in company and not lead_info.get('company'):
                    enriched_data['company'] = company.get('name', '')
                if 'industry' in company:
                    enriched_data['industry'] = company.get('industry', '')
                if 'size' in company:
                    enriched_data['company_size'] = company.get('size', '')
        elif 'company' in data:
            if not lead_info.get('company'):
                enriched_data['company'] = data.get('company', '')
        
        # Experiências profissionais - salvar em JSON
        experiences = []
        if 'experiences' in data:
            experiences = data.get('experiences', [])
        elif 'experience' in data:
            experiences = data.get('experience', [])
        
        if experiences:
            # Normalizar formato das experiências
            normalized_experiences = []
            exp_list = experiences if isinstance(experiences, list) else [experiences]
            for exp in exp_list:
                if isinstance(exp, dict):
                    normalized_exp = {
                        'position': exp.get('title') or exp.get('position') or exp.get('jobTitle', ''),
                        'company': exp.get('company') or exp.get('companyName') or exp.get('company_name', ''),
                        'start_date': exp.get('startDate') or exp.get('start_date') or exp.get('start', ''),
                        'end_date': exp.get('endDate') or exp.get('end_date') or exp.get('end') or None,
                        'description': exp.get('description') or exp.get('summary', '')
                    }
                    normalized_experiences.append(normalized_exp)
            
            if normalized_experiences:
                enriched_data['linkedin_experience_json'] = json.dumps(normalized_experiences, ensure_ascii=False)
            
            # Usar a experiência mais recente para enriquecer campos básicos
            latest_exp = exp_list[0] if exp_list else None
            if isinstance(latest_exp, dict):
                if 'company' in latest_exp and not lead_info.get('company'):
                    enriched_data['company'] = latest_exp.get('company', '') or latest_exp.get('companyName', '')
                if 'title' in latest_exp and not lead_info.get('position'):
                    enriched_data['position'] = latest_exp.get('title', '') or latest_exp.get('position', '')
                if 'industry' in latest_exp:
                    enriched_data['industry'] = latest_exp.get('industry', '')
        
        # Educação - salvar em JSON
        if 'education' in data:
            education = data.get('education', [])
            if education:
                normalized_education = []
                edu_list = education if isinstance(education, list) else [education]
                for edu in edu_list:
                    if isinstance(edu, dict):
                        normalized_edu = {
                            'institution': edu.get('school') or edu.get('institution') or edu.get('schoolName', ''),
                            'degree': edu.get('degree') or edu.get('fieldOfStudy') or edu.get('field_of_study', ''),
                            'field': edu.get('fieldOfStudy') or edu.get('field_of_study') or edu.get('major', ''),
                            'start_date': edu.get('startDate') or edu.get('start_date') or edu.get('start', ''),
                            'end_date': edu.get('endDate') or edu.get('end_date') or edu.get('end') or None
                        }
                        normalized_education.append(normalized_edu)
                
                if normalized_education:
                    enriched_data['linkedin_education_json'] = json.dumps(normalized_education, ensure_ascii=False)
        
        # Certificações - salvar em JSON
        if 'certifications' in data:
            certifications = data.get('certifications', [])
            if certifications:
                normalized_certs = []
                cert_list = certifications if isinstance(certifications, list) else [certifications]
                for cert in cert_list:
                    if isinstance(cert, dict):
                        normalized_cert = {
                            'name': cert.get('name') or cert.get('title') or cert.get('certificationName', ''),
                            'issuer': cert.get('issuer') or cert.get('issuingOrganization') or cert.get('issuing_organization', ''),
                            'issue_date': cert.get('issueDate') or cert.get('issue_date') or cert.get('issued', ''),
                            'expiration_date': cert.get('expirationDate') or cert.get('expiration_date') or None,
                            'credential_id': cert.get('credentialId') or cert.get('credential_id', '')
                        }
                        normalized_certs.append(normalized_cert)
                
                if normalized_certs:
                    enriched_data['linkedin_certifications_json'] = json.dumps(normalized_certs, ensure_ascii=False)
        
        # Habilidades/Skills
        if 'skills' in data:
            skills = data.get('skills', [])
            if skills:
                if isinstance(skills, list):
                    skills_text = ', '.join(skills)
                else:
                    skills_text = str(skills)
                enriched_data['linkedin_skills'] = skills_text
                # Adicionar ao contexto também
                current_context = enriched_data.get('context', lead_info.get('context', ''))
                if current_context:
                    enriched_data['context'] = f"{current_context}\n\nHabilidades: {skills_text}"
                else:
                    enriched_data['context'] = f"Habilidades: {skills_text}"
        
        # Artigos/Publicações - salvar em JSON
        if 'articles' in data or 'publications' in data:
            articles = data.get('articles') or data.get('publications', [])
            if articles:
                normalized_articles = []
                art_list = articles if isinstance(articles, list) else [articles]
                for article in art_list:
                    if isinstance(article, dict):
                        normalized_article = {
                            'title': article.get('title') or article.get('name', ''),
                            'url': article.get('url') or article.get('link', ''),
                            'published_date': article.get('publishedDate') or article.get('published_date') or article.get('date', ''),
                            'description': article.get('description') or article.get('summary', '')
                        }
                        normalized_articles.append(normalized_article)
                
                if normalized_articles:
                    enriched_data['linkedin_articles_json'] = json.dumps(normalized_articles, ensure_ascii=False)
        
        # Conexões e Seguidores
        if 'connections' in data:
            connections = data.get('connections')
            if isinstance(connections, (int, str)):
                try:
                    enriched_data['linkedin_connections_count'] = int(connections)
                except (ValueError, TypeError):
                    pass
        
        if 'followers' in data or 'followersCount' in data:
            followers = data.get('followers') or data.get('followersCount')
            if isinstance(followers, (int, str)):
                try:
                    enriched_data['linkedin_followers_count'] = int(followers)
                except (ValueError, TypeError):
                    pass
        
        # Atividades recentes (pode ser um resumo das últimas atividades)
        if 'recentActivity' in data or 'activities' in data:
            activity = data.get('recentActivity') or data.get('activities', '')
            if activity:
                if isinstance(activity, list):
                    activity_text = '\n'.join([str(a) for a in activity[:5]])  # Últimas 5 atividades
                else:
                    activity_text = str(activity)
                enriched_data['linkedin_recent_activity'] = activity_text
        
        # Telefone (raramente disponível no LinkedIn público, mas verificar)
        if 'phone' in data:
            enriched_data['phone'] = data.get('phone', '')
        
        # Email (raramente disponível no LinkedIn público, mas verificar)
        if 'email' in data and not lead_info.get('email'):
            enriched_data['email'] = data.get('email', '')
        
        # Limpar valores None ou vazios
        enriched_data = {k: v for k, v in enriched_data.items() if v and v != ''}
        
        # Adicionar fonte
        sources.append(linkedin_url)
        
        if enriched_data:
            logger.info(f"✅ [RAPIDAPI LINKEDIN] Encontradas informações: {list(enriched_data.keys())}")
            return {
                'success': True,
                'enriched_data': enriched_data,
                'method': 'rapidapi_linkedin',
                'sources': sources
            }
        else:
            logger.warning("⚠️ [RAPIDAPI LINKEDIN] Nenhuma informação estruturada encontrada")
            return {'success': False, 'error': 'Nenhuma informação estruturada encontrada no LinkedIn'}
            
    except Exception as e:
        logger.error(f"❌ [RAPIDAPI LINKEDIN] Erro na função enrich_via_rapidapi_linkedin: {e}")
        import traceback
        logger.error(f"❌ [RAPIDAPI LINKEDIN] Traceback completo: {traceback.format_exc()}")
        return {'success': False, 'error': f'Erro ao processar RapidAPI LinkedIn: {str(e)}'}


async def research_lead_website_with_fallback(lead_website: str, lead_info: Dict[str, Any]) -> Dict[str, Any]:
    """Pesquisa com múltiplas estratégias de fallback em cascata"""
    logger.info(f"🔍 [RESEARCHER] Iniciando pesquisa com fallback para: {lead_website}")
    
    company_name = lead_info.get('company', '')
    domain = lead_website.replace('https://', '').replace('http://', '').split('/')[0]
    
    # ESTRATÉGIA 1: Scraping direto do website
    logger.info("📋 [ESTRATÉGIA 1] Tentando scraping direto...")
    website_data = await scrape_website(lead_website)
    
    # Verificar se scraping foi bem-sucedido
    # Sucesso = não tem 'success': False E não tem 'error' E tem 'soup' ou 'main_texts'
    has_error = website_data.get('success') is False or 'error' in website_data
    has_content = website_data.get('soup') is not None or len(website_data.get('main_texts', [])) > 0
    
    logger.info(f"🔍 [RESEARCHER] Verificação de sucesso: has_error={has_error}, has_content={has_content}")
    logger.debug(f"🔍 [RESEARCHER] website_data keys: {list(website_data.keys())}")
    
    if not has_error and has_content:
        logger.info("✅ [ESTRATÉGIA 1] Scraping direto bem-sucedido!")
        soup = website_data.get('soup')
        contact_info = extract_contact_info(soup) if soup else {}
        logger.info(f"📞 [RESEARCHER] Informações de contato extraídas: {list(contact_info.keys())}")
        
        enriched_data = await enrich_lead_data_with_llm(website_data, contact_info, lead_info)
        logger.info(f"✨ [RESEARCHER] Dados enriquecidos: {list(enriched_data.keys())}")
        
        analysis = await analyze_website_content(website_data, lead_info)
        
        return {
            'success': True,
            'url': lead_website,
            'enriched_data': enriched_data,
            'analysis': analysis,
            'method': 'direct_scraping',
            'timestamp': datetime.utcnow().isoformat()
        }
    
    # Se bloqueado (403) ou outro erro, tentar estratégias alternativas
    status_code = website_data.get('status_code')
    error_msg = website_data.get('error', 'Erro desconhecido')
    logger.warning(f"⚠️ [ESTRATÉGIA 1] Falhou. Status: {status_code}, Erro: {error_msg}. Tentando estratégias alternativas...")
    
    # ESTRATÉGIA 2: Serper.dev API (mais confiável que scraping do Google)
    logger.info(f"🔍 [DEBUG] Serper.dev API key configurada: {settings.serper_api_key is not None}")
    if settings.serper_api_key:
        logger.info("📋 [ESTRATÉGIA 2] Tentando Serper.dev API...")
        try:
            serper_result = await enrich_via_serper_api(company_name, domain, lead_info)
            logger.info(f"📊 [ESTRATÉGIA 2] Resultado do Serper.dev: success={serper_result.get('success')}, error={serper_result.get('error', 'N/A')}")
            if serper_result.get('success'):
                logger.info("✅ [ESTRATÉGIA 2] Serper.dev bem-sucedido!")
                return {
                    'success': True,
                    'url': lead_website,
                    'enriched_data': serper_result.get('enriched_data', {}),
                    'analysis': {'method': 'serper', 'sources': serper_result.get('sources', [])},
                    'method': 'serper',
                    'timestamp': datetime.utcnow().isoformat()
                }
            error_detail = serper_result.get('error', 'Erro desconhecido')
            logger.warning(f"⚠️ [ESTRATÉGIA 2] Falhou: {error_detail}")
        except Exception as e:
            logger.error(f"❌ [ESTRATÉGIA 2] Erro ao executar Serper.dev: {e}")
            import traceback
            traceback.print_exc()
    else:
        logger.info("⚠️ [ESTRATÉGIA 2] Serper.dev API key não configurada. Pulando...")
    
    # ESTRATÉGIA 2.5: RapidAPI LinkedIn (enriquecimento com dados profissionais)
    linkedin_url = lead_info.get('linkedin_url', '')
    logger.info(f"🔍 [DEBUG] RapidAPI key configurada: {settings.rapidapi_key is not None}")
    logger.info(f"🔍 [DEBUG] LinkedIn URL disponível: {linkedin_url is not None and linkedin_url != ''}")
    
    if settings.rapidapi_key and linkedin_url:
        logger.info("📋 [ESTRATÉGIA 2.5] Tentando RapidAPI LinkedIn...")
        try:
            linkedin_result = await enrich_via_rapidapi_linkedin(linkedin_url, lead_info)
            logger.info(f"📊 [ESTRATÉGIA 2.5] Resultado do RapidAPI LinkedIn: success={linkedin_result.get('success')}, error={linkedin_result.get('error', 'N/A')}")
            if linkedin_result.get('success'):
                logger.info("✅ [ESTRATÉGIA 2.5] RapidAPI LinkedIn bem-sucedido!")
                return {
                    'success': True,
                    'url': lead_website,
                    'enriched_data': linkedin_result.get('enriched_data', {}),
                    'analysis': {'method': 'rapidapi_linkedin', 'sources': linkedin_result.get('sources', [])},
                    'method': 'rapidapi_linkedin',
                    'timestamp': datetime.utcnow().isoformat()
                }
            error_detail = linkedin_result.get('error', 'Erro desconhecido')
            logger.warning(f"⚠️ [ESTRATÉGIA 2.5] Falhou: {error_detail}")
        except Exception as e:
            logger.error(f"❌ [ESTRATÉGIA 2.5] Erro ao executar RapidAPI LinkedIn: {e}")
            import traceback
            traceback.print_exc()
    else:
        if not settings.rapidapi_key:
            logger.info("⚠️ [ESTRATÉGIA 2.5] RapidAPI key não configurada. Pulando...")
        if not linkedin_url:
            logger.info("⚠️ [ESTRATÉGIA 2.5] LinkedIn URL não disponível. Pulando...")
    
    # ESTRATÉGIA 3: Google Search + LLM (fallback gratuito)
    logger.info(f"🔍 [DEBUG] Google Search disponível: {GOOGLE_SEARCH_AVAILABLE}")
    logger.info(f"🔍 [DEBUG] LLM disponível: {is_llm_available()}")
    logger.info(f"🔍 [DEBUG] Provedor LLM: {settings.llm_provider}")
    
    if GOOGLE_SEARCH_AVAILABLE:
        if is_llm_available():
            logger.info("📋 [ESTRATÉGIA 3] Tentando Google Search + LLM...")
            try:
                google_result = await enrich_via_google_search(company_name, domain, lead_info)
                if google_result.get('success'):
                    logger.info("✅ [ESTRATÉGIA 3] Google Search bem-sucedido!")
                    return {
                        'success': True,
                        'url': lead_website,
                        'enriched_data': google_result.get('enriched_data', {}),
                        'analysis': {'method': 'google_search', 'sources': google_result.get('sources', [])},
                        'method': 'google_search',
                        'timestamp': datetime.utcnow().isoformat()
                    }
                error_detail = google_result.get('error', 'Erro desconhecido')
                logger.warning(f"⚠️ [ESTRATÉGIA 3] Falhou: {error_detail}")
                # Adicionar mais contexto sobre o erro
                if 'LLM não' in error_detail:
                    logger.info(f"💡 [ESTRATÉGIA 3] Configure LLM: LLM_PROVIDER=ollama ou LLM_PROVIDER=openai")
                elif 'Nenhum resultado' in error_detail:
                    logger.info(f"💡 [ESTRATÉGIA 3] Nenhum resultado encontrado no Google para: {company_name}")
            except Exception as e:
                logger.error(f"❌ [ESTRATÉGIA 3] Erro ao executar Google Search: {e}")
                import traceback
                traceback.print_exc()
        else:
            logger.warning(f"⚠️ [ESTRATÉGIA 3] Google Search disponível mas LLM não configurado (provedor: {settings.llm_provider}). Pulando...")
            logger.info(f"💡 [ESTRATÉGIA 3] Configure LLM no .env: LLM_PROVIDER=ollama ou LLM_PROVIDER=openai com OPENAI_API_KEY")
    else:
        logger.warning("⚠️ [ESTRATÉGIA 3] Google Search não disponível (biblioteca não instalada). Pulando...")
    
    # ESTRATÉGIA 4: Hunter.io API
    if settings.hunter_api_key:
        logger.info("📋 [ESTRATÉGIA 4] Tentando Hunter.io API...")
        hunter_result = await enrich_via_hunter_api(domain, company_name)
        if hunter_result.get('success'):
            logger.info("✅ [ESTRATÉGIA 4] Hunter.io bem-sucedido!")
            return {
                'success': True,
                'url': lead_website,
                'enriched_data': hunter_result.get('enriched_data', {}),
                'analysis': {'method': 'hunter_io', 'emails_found': hunter_result.get('emails_found', [])},
                'method': 'hunter_io',
                'timestamp': datetime.utcnow().isoformat()
            }
        logger.warning(f"⚠️ [ESTRATÉGIA 4] Falhou: {hunter_result.get('error')}")
    
    # ESTRATÉGIA 6: Clearbit API
    if settings.clearbit_api_key:
        logger.info("📋 [ESTRATÉGIA 6] Tentando Clearbit API...")
        clearbit_result = await enrich_via_clearbit_api(domain)
        if clearbit_result.get('success'):
            logger.info("✅ [ESTRATÉGIA 5] Clearbit bem-sucedido!")
            return {
                'success': True,
                'url': lead_website,
                'enriched_data': clearbit_result.get('enriched_data', {}),
                'analysis': {'method': 'clearbit'},
                'method': 'clearbit',
                'timestamp': datetime.utcnow().isoformat()
            }
        logger.warning(f"⚠️ [ESTRATÉGIA 5] Falhou: {clearbit_result.get('error')}")
    
    # Se todas as estratégias falharam
    logger.error("❌ [RESEARCHER] Todas as estratégias falharam")
    
    # Construir mensagem detalhada sobre o que foi tentado
    attempted_strategies = ["Scraping Direto"]
    
    if settings.serper_api_key:
        attempted_strategies.append("Serper.dev (tentado)")
    else:
        attempted_strategies.append("Serper.dev (não configurado)")
    
    linkedin_url = lead_info.get('linkedin_url', '')
    if settings.rapidapi_key and linkedin_url:
        attempted_strategies.append("RapidAPI LinkedIn (tentado)")
    elif settings.rapidapi_key:
        attempted_strategies.append("RapidAPI LinkedIn (URL não disponível)")
    else:
        attempted_strategies.append("RapidAPI LinkedIn (não configurado)")
    
    google_status = ""
    
    if GOOGLE_SEARCH_AVAILABLE:
        if is_llm_available():
            attempted_strategies.append("Google Search + LLM (tentado)")
            google_status = "tentado mas falhou"
        else:
            attempted_strategies.append("Google Search (LLM não configurado)")
            google_status = "não executado - LLM não configurado"
    else:
        attempted_strategies.append("Google Search (biblioteca não instalada)")
        google_status = "não disponível"
    
    if settings.hunter_api_key:
        attempted_strategies.append("Hunter.io")
    else:
        attempted_strategies.append("Hunter.io (não configurado)")
    
    if settings.clearbit_api_key:
        attempted_strategies.append("Clearbit")
    else:
        attempted_strategies.append("Clearbit (não configurado)")
    
    error_message = f'Scraping direto bloqueado (status {status_code}). Estratégias tentadas: {", ".join(attempted_strategies)}.'
    
    suggestions = []
    
    # Sugestões específicas baseadas no que está faltando
    if not settings.serper_api_key:
        suggestions.append('Configure Serper.dev API key no arquivo .env (SERPER_API_KEY=sua-chave) - Mais confiável e rápido que scraping')
    
    if not GOOGLE_SEARCH_AVAILABLE:
        suggestions.append('Instale googlesearch-python: pip install googlesearch-python')
    
    if not is_llm_available():
        suggestions.append(f'Configure LLM no arquivo .env:')
        suggestions.append('  - Para Ollama (gratuito/local): LLM_PROVIDER=ollama OLLAMA_MODEL=llama3')
        suggestions.append('  - Para OpenAI: LLM_PROVIDER=openai OPENAI_API_KEY=sua-chave')
        suggestions.append('  - Instale Ollama: brew install ollama && ollama pull llama3')
    else:
        suggestions.append('Google Search + LLM está configurado mas falhou. Verifique os logs para mais detalhes.')
    
    if not settings.hunter_api_key and not settings.clearbit_api_key:
        suggestions.append('Configure Hunter.io ou Clearbit API keys no arquivo .env para fallback automático')
    
    suggestions.append('Acesse o website manualmente para coletar informações')
    
    return {
        'success': False,
        'error': error_message,
        'url': lead_website,
        'status_code': status_code,
        'suggestions': suggestions,
        'attempted_strategies': attempted_strategies
    }


async def research_lead_website(lead_website: str, lead_info: Dict[str, Any]) -> Dict[str, Any]:
    """Pesquisa completa do website do lead e enriquecimento de dados (usa fallback automático)"""
    return await research_lead_website_with_fallback(lead_website, lead_info)