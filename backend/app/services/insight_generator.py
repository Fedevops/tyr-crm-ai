"""
Serviço para geração de insights sobre leads usando IA
"""
import logging
import json
from typing import Dict, Any, Optional
from sqlmodel import Session
from app.models import Lead
from app.agents.llm_helper import get_llm, is_llm_available, extract_token_usage
from app.services.token_tracker import track_llm_tokens
from app.config import settings

logger = logging.getLogger(__name__)


def generate_lead_insight(lead: Lead, session: Session, language: str = "pt-BR") -> str:
    """
    Gera um insight sobre o lead baseado em todos os dados disponíveis
    
    Args:
        lead: Lead para gerar insight
        language: Idioma para gerar o insight (pt-BR ou en)
        
    Returns:
        String com o insight gerado
    """
    if not is_llm_available():
        raise ValueError("LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env")
    
    llm = get_llm(temperature=0.7)  # Temperatura um pouco mais alta para insights criativos
    
    if not llm:
        raise ValueError("Não foi possível inicializar o LLM. Verifique as configurações.")
    
    # Coletar todos os dados do lead para análise
    lead_data = {
        "nome": lead.name,
        "email": lead.email,
        "telefone": lead.phone,
        "empresa": lead.company,
        "cargo": lead.position,
        "website": lead.website,
        "status": lead.status.value if hasattr(lead.status, 'value') else str(lead.status),
        "score": lead.score,
        "fonte": lead.source,
        "notas": lead.notes,
        "tags": lead.tags,
        "ultimo_contato": str(lead.last_contact) if lead.last_contact else None,
        "proximo_followup": str(lead.next_followup) if lead.next_followup else None,
        "setor": lead.industry,
        "tamanho_empresa": lead.company_size,
        "contexto": lead.context,
    }
    
    # Dados do LinkedIn
    linkedin_data = {}
    if lead.linkedin_url:
        linkedin_data["url"] = lead.linkedin_url
    if lead.linkedin_headline:
        linkedin_data["headline"] = lead.linkedin_headline
    if lead.linkedin_about:
        linkedin_data["sobre"] = lead.linkedin_about
    if lead.linkedin_skills:
        linkedin_data["habilidades"] = lead.linkedin_skills
    if lead.linkedin_experience_json:
        try:
            linkedin_data["experiencia"] = json.loads(lead.linkedin_experience_json)
        except:
            linkedin_data["experiencia"] = lead.linkedin_experience_json
    if lead.linkedin_education_json:
        try:
            linkedin_data["educacao"] = json.loads(lead.linkedin_education_json)
        except:
            linkedin_data["educacao"] = lead.linkedin_education_json
    if lead.linkedin_connections_count:
        linkedin_data["conexoes"] = lead.linkedin_connections_count
    if lead.linkedin_followers_count:
        linkedin_data["seguidores"] = lead.linkedin_followers_count
    
    # Dados da empresa (Casa dos Dados)
    empresa_data = {}
    if lead.cnpj:
        empresa_data["cnpj"] = lead.cnpj
    if lead.razao_social:
        empresa_data["razao_social"] = lead.razao_social
    if lead.nome_fantasia:
        empresa_data["nome_fantasia"] = lead.nome_fantasia
    if lead.situacao_cadastral:
        empresa_data["situacao"] = lead.situacao_cadastral
    if lead.capital_social:
        empresa_data["capital_social"] = lead.capital_social
    if lead.porte:
        empresa_data["porte"] = lead.porte
    if lead.cnae_principal_descricao:
        empresa_data["atividade_principal"] = lead.cnae_principal_descricao
    if lead.socios_json:
        try:
            empresa_data["socios"] = json.loads(lead.socios_json)
        except:
            empresa_data["socios"] = lead.socios_json
    
    # Construir prompt para o LLM
    prompt = f"""Você é um especialista em vendas B2B e análise de leads. Analise os seguintes dados de um lead e gere um insight estratégico e acionável.

DADOS DO LEAD:
{json.dumps(lead_data, indent=2, ensure_ascii=False)}

"""
    
    if linkedin_data:
        prompt += f"""
DADOS DO LINKEDIN:
{json.dumps(linkedin_data, indent=2, ensure_ascii=False)}

"""
    
    if empresa_data:
        prompt += f"""
DADOS DA EMPRESA:
{json.dumps(empresa_data, indent=2, ensure_ascii=False)}

"""
    
    # Determinar idioma do prompt
    language_instruction = ""
    if language and language.startswith("pt"):
        language_instruction = "IMPORTANTE: Gere o insight COMPLETAMENTE EM PORTUGUÊS (BRASIL). Use português brasileiro em todo o texto."
    elif language and language.startswith("en"):
        language_instruction = "IMPORTANTE: Generate the insight COMPLETELY IN ENGLISH. Use English throughout the entire text."
    else:
        # Default para português
        language_instruction = "IMPORTANTE: Gere o insight COMPLETAMENTE EM PORTUGUÊS (BRASIL). Use português brasileiro em todo o texto."
    
    prompt += f"""
{language_instruction}

Gere um insight estratégico e acionável sobre este lead. O insight deve:

1. **Identificar oportunidades de negócio** baseadas nos dados disponíveis
2. **Destacar pontos fortes e diferenciais** do lead/empresa
3. **Sugerir abordagens personalizadas** para contato
4. **Identificar possíveis dores ou necessidades** baseadas no perfil
5. **Fornecer contexto sobre o perfil profissional** e como isso pode influenciar a abordagem

Formato do insight:
- Seja conciso mas completo (2-4 parágrafos)
- Use linguagem profissional mas acessível
- Foque em informações acionáveis
- Destaque conexões e padrões interessantes nos dados
- Se houver dados limitados, seja honesto sobre isso mas extraia o máximo possível

Retorne APENAS o texto do insight, sem títulos, sem formatação markdown, sem explicações adicionais.
"""
    
    try:
        logger.info(f"🤖 [INSIGHT] Gerando insight para lead {lead.id} ({lead.name})")
        response = llm.invoke(prompt)
        
        # Rastrear uso de tokens
        try:
            provider = settings.llm_provider.lower()
            model = settings.openai_model if provider == "openai" else settings.ollama_model
            token_info = extract_token_usage(response, provider)
            # Estimar prompt_tokens se não disponível (para Ollama)
            if token_info['prompt_tokens'] == 0 and token_info['total_tokens'] > 0:
                # Estimativa: prompt geralmente é maior que completion
                estimated_prompt = int(token_info['total_tokens'] * 0.7)
                token_info['prompt_tokens'] = estimated_prompt
                token_info['completion_tokens'] = token_info['total_tokens'] - estimated_prompt
            track_llm_tokens(
                session=session,
                tenant_id=lead.tenant_id,
                user_id=None,
                provider=provider,
                model=model,
                prompt_tokens=token_info['prompt_tokens'],
                completion_tokens=token_info['completion_tokens'],
                total_tokens=token_info['total_tokens'],
                endpoint="/api/leads/generate-insight",
                feature="insight_generation"
            )
        except Exception as e:
            logger.warning(f"⚠️ Erro ao rastrear tokens: {e}")
        
        # Extrair conteúdo da resposta
        insight_text = response.content if hasattr(response, 'content') else str(response)
        
        # Limpar resposta (remover markdown se houver)
        insight_text = insight_text.strip()
        if insight_text.startswith("```"):
            # Remover code blocks
            lines = insight_text.split('\n')
            insight_text = '\n'.join([line for line in lines if not line.strip().startswith('```')])
        insight_text = insight_text.strip()
        
        logger.info(f"✅ [INSIGHT] Insight gerado com sucesso ({len(insight_text)} caracteres)")
        return insight_text
        
    except Exception as e:
        logger.error(f"❌ [INSIGHT] Erro ao gerar insight: {e}")
        raise ValueError(f"Erro ao gerar insight: {str(e)}")

