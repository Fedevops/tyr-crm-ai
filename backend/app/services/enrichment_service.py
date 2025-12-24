"""
Serviço de Enriquecimento de Leads usando LangGraph
Implementa um grafo com 3 nós: Fetcher (Casa dos Dados), Hunter (Serper.dev), AI Brain (DeepSeek)
"""
import json
import logging
from typing import Dict, Any, TypedDict, Optional
from datetime import datetime
import httpx
from langgraph.graph import StateGraph, END
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from app.config import settings
from app.models import Lead

logger = logging.getLogger(__name__)


class EnrichmentState(TypedDict):
    """Estado do grafo de enriquecimento"""
    lead: Lead
    cnpj: str
    cnpj_data: Optional[Dict[str, Any]]
    website: Optional[str]
    social_media: Optional[Dict[str, str]]
    agent_suggestion: Optional[str]
    errors: list[str]


def get_deepseek_llm() -> Optional[BaseChatModel]:
    """Inicializa o modelo DeepSeek usando ChatOpenAI com base_url customizada"""
    if not settings.deepseek_api_key:
        logger.warning("⚠️ DeepSeek API key não configurada")
        return None
    
    try:
        # DeepSeek usa API compatível com OpenAI
        return ChatOpenAI(
            model=settings.deepseek_model,
            api_key=settings.deepseek_api_key,
            base_url=f"{settings.deepseek_base_url}/v1",
            temperature=0.7
        )
    except Exception as e:
        logger.error(f"❌ Erro ao inicializar DeepSeek: {e}")
        return None


async def fetcher_node(state: EnrichmentState) -> EnrichmentState:
    """
    Nó 1: Fetcher - Consulta API Casa dos Dados por CNPJ
    Preenche os campos do modelo Lead com dados da API
    """
    logger.info(f"🔍 [FETCHER] Consultando CNPJ: {state['cnpj']}")
    
    cnpj = state['cnpj'].replace('.', '').replace('/', '').replace('-', '')
    api_url = f"https://api.casadosdados.com.br/v1/cnpj/{cnpj}"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(api_url)
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"✅ [FETCHER] Dados recebidos da API Casa dos Dados")
            
            # Extrair dados principais
            cnpj_data = data.get('data', {})
            state['cnpj_data'] = cnpj_data
            
            lead = state['lead']
            
            # Preencher campos do Lead
            if 'razao_social' in cnpj_data:
                lead.razao_social = cnpj_data.get('razao_social')
                if not lead.company:
                    lead.company = cnpj_data.get('razao_social')
            
            if 'nome_fantasia' in cnpj_data:
                lead.nome_fantasia = cnpj_data.get('nome_fantasia')
            
            lead.cnpj = cnpj
            
            # Data de abertura
            if 'data_inicio_atividade' in cnpj_data:
                try:
                    data_str = cnpj_data.get('data_inicio_atividade')
                    if data_str:
                        lead.data_abertura = datetime.strptime(data_str, '%Y-%m-%d')
                except Exception as e:
                    logger.warning(f"⚠️ [FETCHER] Erro ao parsear data_abertura: {e}")
            
            # Capital social
            if 'capital_social' in cnpj_data:
                try:
                    capital = cnpj_data.get('capital_social')
                    if capital:
                        lead.capital_social = float(capital)
                except (ValueError, TypeError):
                    logger.warning(f"⚠️ [FETCHER] Erro ao parsear capital_social")
            
            # Situação cadastral
            if 'situacao_cadastral' in cnpj_data:
                lead.situacao_cadastral = str(cnpj_data.get('situacao_cadastral'))
            
            # Data e motivo situação cadastral
            if 'data_situacao_cadastral' in cnpj_data:
                try:
                    data_str = cnpj_data.get('data_situacao_cadastral')
                    if data_str:
                        lead.data_situacao_cadastral = datetime.strptime(data_str, '%Y-%m-%d')
                except Exception:
                    pass
            
            if 'motivo_situacao_cadastral' in cnpj_data:
                lead.motivo_situacao_cadastral = str(cnpj_data.get('motivo_situacao_cadastral', ''))
            
            # Natureza jurídica
            if 'natureza_juridica' in cnpj_data:
                lead.natureza_juridica = str(cnpj_data.get('natureza_juridica', ''))
            
            # Porte
            if 'porte' in cnpj_data:
                lead.porte = str(cnpj_data.get('porte', ''))
            
            # Endereço
            endereco = cnpj_data.get('endereco', {})
            if endereco:
                lead.logradouro = endereco.get('logradouro')
                lead.numero = endereco.get('numero')
                lead.bairro = endereco.get('bairro')
                lead.cep = endereco.get('cep')
                lead.municipio = endereco.get('municipio')
                lead.uf = endereco.get('uf')
                lead.complemento = endereco.get('complemento')
                
                # Montar endereço completo
                endereco_parts = []
                if lead.logradouro:
                    endereco_parts.append(lead.logradouro)
                if lead.numero:
                    endereco_parts.append(lead.numero)
                if lead.complemento:
                    endereco_parts.append(lead.complemento)
                if lead.bairro:
                    endereco_parts.append(lead.bairro)
                if lead.municipio:
                    endereco_parts.append(lead.municipio)
                if lead.uf:
                    endereco_parts.append(lead.uf)
                if lead.cep:
                    endereco_parts.append(f"CEP: {lead.cep}")
                
                lead.address = ', '.join(endereco_parts) if endereco_parts else None
                lead.city = lead.municipio
                lead.state = lead.uf
                lead.zip_code = lead.cep
            
            # CNAE Principal
            cnae = cnpj_data.get('cnae_principal', {})
            if cnae:
                lead.cnae_principal_codigo = cnae.get('codigo')
                lead.cnae_principal_descricao = cnae.get('descricao')
                if not lead.industry:
                    lead.industry = cnae.get('descricao')
            
            # CNAEs Secundários
            cnaes_secundarios = cnpj_data.get('cnaes_secundarios', [])
            if cnaes_secundarios:
                cnaes_data = []
                for cnae_sec in cnaes_secundarios:
                    cnaes_data.append({
                        'codigo': cnae_sec.get('codigo', ''),
                        'descricao': cnae_sec.get('descricao', '')
                    })
                lead.cnaes_secundarios_json = json.dumps(cnaes_data, ensure_ascii=False)
            
            # Telefone e Email da empresa
            if 'telefone' in cnpj_data:
                lead.telefone_empresa = str(cnpj_data.get('telefone', ''))
            if 'email' in cnpj_data:
                lead.email_empresa = str(cnpj_data.get('email', ''))
            
            # Simples Nacional
            simples = cnpj_data.get('simples_nacional', {})
            if simples:
                lead.simples_nacional = simples.get('optante', False)
                if 'data_opcao' in simples:
                    try:
                        data_str = simples.get('data_opcao')
                        if data_str:
                            lead.data_opcao_simples = datetime.strptime(data_str, '%Y-%m-%d')
                    except Exception:
                        pass
                if 'data_exclusao' in simples:
                    try:
                        data_str = simples.get('data_exclusao')
                        if data_str:
                            lead.data_exclusao_simples = datetime.strptime(data_str, '%Y-%m-%d')
                    except Exception:
                        pass
            
            # Sócios
            socios = cnpj_data.get('socios', [])
            if socios:
                socios_data = []
                for socio in socios:
                    socios_data.append({
                        'nome': socio.get('nome', ''),
                        'qualificacao': socio.get('qualificacao', ''),
                        'cpf_cnpj': socio.get('cpf_cnpj', '')
                    })
                lead.socios_json = json.dumps(socios_data, ensure_ascii=False)
            
            logger.info(f"✅ [FETCHER] Campos preenchidos com sucesso")
            
    except httpx.HTTPStatusError as e:
        error_msg = f"Erro HTTP {e.response.status_code} ao consultar Casa dos Dados"
        logger.error(f"❌ [FETCHER] {error_msg}")
        state['errors'].append(error_msg)
    except Exception as e:
        error_msg = f"Erro ao consultar Casa dos Dados: {str(e)}"
        logger.error(f"❌ [FETCHER] {error_msg}")
        state['errors'].append(error_msg)
    
    return state


async def hunter_node(state: EnrichmentState) -> EnrichmentState:
    """
    Nó 2: Hunter - Busca site oficial e redes sociais via Serper.dev
    Usa razao_social + municipio para buscar no Google
    """
    logger.info(f"🔍 [HUNTER] Buscando site e redes sociais")
    
    lead = state['lead']
    razao_social = lead.razao_social or lead.company or ''
    municipio = lead.municipio or lead.city or ''
    
    if not razao_social:
        logger.warning("⚠️ [HUNTER] razao_social não disponível, pulando busca")
        return state
    
    if not settings.serper_api_key:
        logger.warning("⚠️ [HUNTER] Serper.dev API key não configurada")
        return state
    
    search_query = f"{razao_social} {municipio} site oficial"
    
    try:
        search_url = "https://google.serper.dev/search"
        headers = {
            'X-API-KEY': settings.serper_api_key,
            'Content-Type': 'application/json'
        }
        payload = {
            "q": search_query,
            "gl": "br",
            "hl": "pt",
            "num": 5
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(search_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"✅ [HUNTER] Resultados da busca recebidos")
            
            # Extrair site oficial (geralmente o primeiro resultado)
            organic_results = data.get('organic', [])
            if organic_results:
                first_result = organic_results[0]
                website_url = first_result.get('link', '')
                
                if website_url and not lead.website:
                    lead.website = website_url
                    state['website'] = website_url
                    logger.info(f"✅ [HUNTER] Site encontrado: {website_url}")
                
                # Buscar redes sociais nos resultados
                social_media = {}
                for result in organic_results[:5]:
                    link = result.get('link', '').lower()
                    title = result.get('title', '').lower()
                    
                    if 'linkedin.com' in link and 'linkedin_url' not in social_media:
                        social_media['linkedin_url'] = result.get('link')
                    elif 'facebook.com' in link and 'facebook' not in social_media:
                        social_media['facebook'] = result.get('link')
                    elif 'instagram.com' in link and 'instagram' not in social_media:
                        social_media['instagram'] = result.get('link')
                
                if social_media:
                    state['social_media'] = social_media
                    if 'linkedin_url' in social_media and not lead.linkedin_url:
                        lead.linkedin_url = social_media['linkedin_url']
                    
                    # Adicionar redes sociais às notas
                    social_notes = "Redes sociais encontradas:\n"
                    for platform, url in social_media.items():
                        social_notes += f"- {platform}: {url}\n"
                    
                    if lead.notes:
                        lead.notes = f"{lead.notes}\n\n{social_notes}"
                    else:
                        lead.notes = social_notes
                    
                    logger.info(f"✅ [HUNTER] Redes sociais encontradas: {list(social_media.keys())}")
            
    except Exception as e:
        error_msg = f"Erro ao buscar site via Serper.dev: {str(e)}"
        logger.error(f"❌ [HUNTER] {error_msg}")
        state['errors'].append(error_msg)
    
    return state


async def ai_brain_node(state: EnrichmentState) -> EnrichmentState:
    """
    Nó 3: AI Brain - Análise com DeepSeek e geração de estratégia de abordagem
    Analisa: data_abertura, capital_social, cnae_principal_descricao
    Gera AgentSuggestion personalizada para os sócios
    """
    logger.info(f"🧠 [AI BRAIN] Gerando estratégia de abordagem")
    
    lead = state['lead']
    llm = get_deepseek_llm()
    
    if not llm:
        logger.warning("⚠️ [AI BRAIN] DeepSeek não disponível, pulando análise")
        return state
    
    try:
        # Preparar dados do CNPJ
        cnpj_data_str = json.dumps(state.get('cnpj_data', {}), ensure_ascii=False, indent=2)
        
        # Extrair informações dos sócios
        socios_data = []
        if lead.socios_json:
            try:
                socios_data = json.loads(lead.socios_json)
            except:
                pass
        
        # Análise da empresa
        empresa_info = []
        if lead.data_abertura:
            idade_anos = (datetime.utcnow() - lead.data_abertura).days / 365
            if idade_anos < 2:
                empresa_info.append(f"Empresa recente (aberta há {idade_anos:.1f} anos)")
            else:
                empresa_info.append(f"Empresa estabelecida (aberta há {idade_anos:.1f} anos)")
        
        if lead.capital_social:
            if lead.capital_social < 10000:
                empresa_info.append("Porte: Micro empresa")
            elif lead.capital_social < 100000:
                empresa_info.append("Porte: Pequena empresa")
            elif lead.capital_social < 1000000:
                empresa_info.append("Porte: Média empresa")
            else:
                empresa_info.append("Porte: Grande empresa")
        
        if lead.cnae_principal_descricao:
            empresa_info.append(f"Setor: {lead.cnae_principal_descricao}")
        
        # Construir prompt
        capital_str = f"R$ {lead.capital_social:,.2f}" if lead.capital_social else 'N/A'
        data_abertura_str = lead.data_abertura.strftime('%d/%m/%Y') if lead.data_abertura else 'N/A'
        analise_str = ', '.join(empresa_info) if empresa_info else 'N/A'
        
        dados_cnpj = f"""Dados Fiscais da Empresa:
- Razão Social: {lead.razao_social or 'N/A'}
- Nome Fantasia: {lead.nome_fantasia or 'N/A'}
- CNPJ: {lead.cnpj or 'N/A'}
- Data de Abertura: {data_abertura_str}
- Capital Social: {capital_str}
- Situação Cadastral: {lead.situacao_cadastral or 'N/A'}
- CNAE Principal: {lead.cnae_principal_descricao or 'N/A'}
- Município: {lead.municipio or 'N/A'} - {lead.uf or 'N/A'}
- Análise: {analise_str}

Dados Completos da API:
{cnpj_data_str}
"""
        
        website_url = state.get('website') or lead.website or 'N/A'
        
        # Gerar sugestão para cada sócio
        suggestions = []
        for socio in socios_data:
            nome_socio = socio.get('nome', 'Sócio')
            qualificacao = socio.get('qualificacao', '')
            
            prompt = f"""Você é um consultor de vendas. Com base nos dados fiscais abaixo e no site da empresa, identifique 3 dores de negócio e crie um quebra-gelo personalizado para o sócio {nome_socio} ({qualificacao}).

{dados_cnpj}

Site da empresa: {website_url}

Formato da resposta:
1. Dores de Negócio Identificadas:
   - Dor 1: [descrição]
   - Dor 2: [descrição]
   - Dor 3: [descrição]

2. Quebra-gelo Personalizado:
   [mensagem personalizada para {nome_socio}]

3. Estratégia de Abordagem:
   [como abordar este sócio especificamente]
"""
            
            try:
                response = llm.invoke(prompt)
                suggestion_text = response.content.strip()
                suggestions.append(f"=== SUGESTÃO PARA {nome_socio.upper()} ===\n{suggestion_text}\n")
            except Exception as e:
                logger.error(f"❌ [AI BRAIN] Erro ao gerar sugestão para {nome_socio}: {e}")
        
        # Combinar todas as sugestões
        if suggestions:
            lead.agent_suggestion = "\n\n".join(suggestions)
            state['agent_suggestion'] = lead.agent_suggestion
            logger.info(f"✅ [AI BRAIN] Sugestões geradas para {len(suggestions)} sócio(s)")
        else:
            logger.warning("⚠️ [AI BRAIN] Nenhuma sugestão gerada")
            
    except Exception as e:
        error_msg = f"Erro ao gerar sugestão com DeepSeek: {str(e)}"
        logger.error(f"❌ [AI BRAIN] {error_msg}")
        state['errors'].append(error_msg)
    
    return state


def create_enrichment_graph() -> StateGraph:
    """Cria o grafo de enriquecimento com LangGraph"""
    workflow = StateGraph(EnrichmentState)
    
    # Adicionar nós
    workflow.add_node("fetcher", fetcher_node)
    workflow.add_node("hunter", hunter_node)
    workflow.add_node("ai_brain", ai_brain_node)
    
    # Definir fluxo
    workflow.set_entry_point("fetcher")
    workflow.add_edge("fetcher", "hunter")
    workflow.add_edge("hunter", "ai_brain")
    workflow.add_edge("ai_brain", END)
    
    return workflow.compile()


async def enrich_lead(lead: Lead, cnpj: str) -> Lead:
    """
    Executa o enriquecimento completo de um lead
    """
    logger.info(f"🚀 [ENRICHMENT] Iniciando enriquecimento para CNPJ: {cnpj}")
    
    # Criar estado inicial
    initial_state: EnrichmentState = {
        'lead': lead,
        'cnpj': cnpj,
        'cnpj_data': None,
        'website': None,
        'social_media': None,
        'agent_suggestion': None,
        'errors': []
    }
    
    # Executar grafo
    graph = create_enrichment_graph()
    final_state = await graph.ainvoke(initial_state)
    
    # Atualizar lead com dados do estado final
    enriched_lead = final_state['lead']
    enriched_lead.updated_at = datetime.utcnow()
    
    if final_state.get('errors'):
        logger.warning(f"⚠️ [ENRICHMENT] Erros encontrados: {final_state['errors']}")
    
    logger.info(f"✅ [ENRICHMENT] Enriquecimento concluído")
    
    return enriched_lead

