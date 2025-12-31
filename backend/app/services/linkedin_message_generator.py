"""
Serviço para geração de mensagens do LinkedIn usando IA
"""
import logging
from typing import Dict, Any, Optional, List
from sqlmodel import Session, select
from app.models import Lead, Item, ItemType
from app.agents.llm_helper import get_llm, is_llm_available, extract_token_usage
from app.services.token_tracker import track_llm_tokens
from app.config import settings

logger = logging.getLogger(__name__)


def generate_linkedin_connection_note(lead: Lead, session: Session, language: str = "pt-BR", is_template: bool = False) -> str:
    """
    Gera uma nota de conexão personalizada para LinkedIn baseada no insight do lead e produtos/serviços do catálogo
    
    Args:
        lead: Lead para gerar a nota de conexão (ou lead template se is_template=True)
        session: Sessão do banco de dados para buscar produtos/serviços
        language: Idioma para gerar a mensagem (pt-BR ou en)
        is_template: Se True, gera um template com placeholders
        
    Returns:
        String com a nota de conexão gerada (ou template com placeholders se is_template=True)
    """
    if not is_llm_available():
        raise ValueError("LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env")
    
    llm = get_llm(temperature=0.7)  # Temperatura um pouco mais alta para mensagens mais naturais
    
    if not llm:
        raise ValueError("Não foi possível inicializar o LLM. Verifique as configurações.")
    
    # Coletar dados do lead
    lead_data = {
        "nome": lead.name if not is_template else "João Silva",
        "empresa": lead.company if not is_template else "Empresa Exemplo Ltda",
        "cargo": lead.position if not is_template else "Diretor de Tecnologia",
        "insight": lead.linkedin_summary if not is_template else None,  # Insight gerado anteriormente
        "headline": lead.linkedin_headline if not is_template else "Especialista em Tecnologia | 10+ anos de experiência",
        "sobre": lead.linkedin_about if not is_template else "Profissional com ampla experiência em gestão de equipes e projetos tecnológicos",
    }
    
    # Determinar idioma do prompt
    language_instruction = ""
    if language and language.startswith("pt"):
        language_instruction = "IMPORTANTE: Gere a nota de conexão COMPLETAMENTE EM PORTUGUÊS (BRASIL). Use português brasileiro em todo o texto."
    elif language and language.startswith("en"):
        language_instruction = "IMPORTANTE: Generate the connection note COMPLETELY IN ENGLISH. Use English throughout the entire text."
    else:
        language_instruction = "IMPORTANTE: Gere a nota de conexão COMPLETAMENTE EM PORTUGUÊS (BRASIL). Use português brasileiro em todo o texto."
    
    prompt = f"""Você é um especialista em networking profissional e vendas B2B. Gere uma nota de conexão personalizada e autêntica para LinkedIn.

{language_instruction}

DADOS DO LEAD:
Nome: {lead_data['nome']}
Empresa: {lead_data['empresa'] or 'Não informado'}
Cargo: {lead_data['cargo'] or 'Não informado'}
Headline: {lead_data['headline'] or 'Não informado'}
Sobre: {lead_data['sobre'] or 'Não informado'}

"""
    
    if lead_data['insight']:
        prompt += f"""
INSIGHT ESTRATÉGICO DO LEAD:
{lead_data['insight']}

"""
    
    # Buscar produtos e serviços do catálogo do tenant
    catalog_items = []
    if hasattr(lead, 'tenant_id') and lead.tenant_id:
        catalog_items = session.exec(
            select(Item).where(Item.tenant_id == lead.tenant_id)
        ).all()
    
    if catalog_items:
        prompt += f"""
PRODUTOS E SERVIÇOS DISPONÍVEIS NO CATÁLOGO (use estes dados reais para personalizar a mensagem):
"""
        for item in catalog_items:
            item_type_label = "Produto" if item.type == ItemType.PRODUCT else "Serviço"
            prompt += f"""
- {item_type_label}: {item.name}
  Descrição: {item.description or 'Sem descrição'}
  Preço: {item.unit_price} {item.currency}
"""
        prompt += "\n"
        if is_template:
            prompt += f"""
NOTA: Os produtos/serviços acima são REAIS do catálogo. Use-os no template, mas mantenha os placeholders ({{Nome do lead}}, {{Empresa}}, etc.) para que possam ser substituídos quando a sequência for ativada.

"""
    elif is_template:
        # Se for template mas não houver produtos, incluir exemplo genérico
        prompt += f"""
PRODUTOS E SERVIÇOS DISPONÍVEIS NO CATÁLOGO (exemplo para template):
- Serviço: Consultoria em Automação de Vendas
  Descrição: Soluções personalizadas para otimizar processos de vendas
- Produto: Plataforma CRM
  Descrição: Sistema completo de gestão de relacionamento com clientes

"""
    
    prompt += f"""
Gere uma nota de conexão personalizada que seja um PITCH COMERCIAL INTERESSANTE e MUITO CONCISA:

REGRAS CRÍTICAS:
1. **MÁXIMO ABSOLUTO DE 180 CARACTERES** - NUNCA ultrapasse este limite (deixe margem de segurança)
2. **Seja um pitch comercial direto** - apresente valor de forma impactante em poucas palavras
3. **Mencione algo específico** do lead (cargo, empresa) de forma muito breve
4. **Apresente valor rapidamente** - mostre o benefício principal em uma frase curta
5. **Use o insight** (se disponível) para personalizar de forma muito concisa
6. **Considere produtos/serviços do catálogo** (se disponíveis) - mencione de forma muito breve e atrativa

FORMATO:
- Frase de abertura personalizada (máx 40 caracteres)
- Pitch comercial com valor/benefício (máx 100 caracteres)
- Encerramento breve (máx 40 caracteres)
- TOTAL: máximo 180 caracteres

EXEMPLOS DE PITCHES CURTOS:
- "Olá {{Nome do lead}}! Vi que você é {{Cargo}} na {{Empresa}}. Oferecemos solução que aumenta eficiência. Vamos conversar?"
- "{{Nome do lead}}, como {{Cargo}} na {{Empresa}}, nossa solução pode ajudar. Gostaria de trocar uma ideia?"

PLACEHOLDERS DISPONÍVEIS (use no template):
- {{Nome do lead}} ou {{name}} - Nome do lead
- {{Empresa}} ou {{company}} - Nome da empresa
- {{Cargo}} ou {{position}} - Cargo/posição do lead
- {{Email}} ou {{email}} - E-mail do lead
- {{Telefone}} ou {{phone}} - Telefone do lead
- {{Website}} ou {{website}} - Website da empresa
- {{LinkedIn}} ou {{linkedin}} - URL do LinkedIn

IMPORTANTE:
- Seja EXTREMAMENTE conciso - cada palavra conta
- Foque no valor principal, não em detalhes
- Se for template, USE os placeholders acima ({{Nome do lead}}, {{Empresa}}, {{Cargo}}, etc.) - eles serão substituídos automaticamente
- SEMPRE mencione o cargo do lead usando {{Cargo}} para personalizar a mensagem
- NUNCA ultrapasse 180 caracteres - este é um limite rígido e crítico
- Se a mensagem gerada ultrapassar 180 caracteres, ela será truncada automaticamente

Retorne APENAS o texto da nota de conexão, sem títulos, sem formatação markdown, sem explicações adicionais. MÁXIMO 180 CARACTERES.
"""
    
    try:
        lead_identifier = f"lead {lead.id} ({lead.name})" if not is_template else "template"
        logger.info(f"🤖 [LINKEDIN] Gerando nota de conexão para {lead_identifier}")
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
                endpoint="/api/tasks/generate-linkedin-message",
                feature="linkedin_connection_note"
            )
        except Exception as e:
            logger.warning(f"⚠️ Erro ao rastrear tokens: {e}")
        
        # Extrair conteúdo da resposta
        message_text = response.content if hasattr(response, 'content') else str(response)
        
        # Limpar resposta (remover markdown se houver)
        message_text = message_text.strip()
        if message_text.startswith("```"):
            lines = message_text.split('\n')
            message_text = '\n'.join([line for line in lines if not line.strip().startswith('```')])
        message_text = message_text.strip()
        
        # Se for template, substituir valores de exemplo por placeholders ANTES de truncar
        if is_template:
            message_text = message_text.replace("João Silva", "{Nome do lead}")
            message_text = message_text.replace("Empresa Exemplo Ltda", "{Empresa}")
            message_text = message_text.replace("Diretor de Tecnologia", "{Cargo}")
            message_text = message_text.replace("joao@exemplo.com", "{Email}")
            message_text = message_text.replace("(11) 99999-9999", "{Telefone}")
            message_text = message_text.replace("https://exemplo.com", "{Website}")
            message_text = message_text.replace("https://linkedin.com/in/joaosilva", "{LinkedIn}")
        
        # Garantir que não ultrapasse 200 caracteres (limite rígido para notas de conexão)
        original_length = len(message_text)
        max_length = 200
        
        if original_length > max_length:
            # Truncar de forma inteligente (tentar cortar em um ponto lógico)
            # Deixar espaço para "..." (3 caracteres)
            truncated = message_text[:max_length - 3]
            
            # Tentar encontrar o último espaço, ponto, vírgula ou ponto de exclamação antes do limite
            last_space = truncated.rfind(' ')
            last_period = truncated.rfind('.')
            last_comma = truncated.rfind(',')
            last_exclamation = truncated.rfind('!')
            last_question = truncated.rfind('?')
            
            # Usar o maior índice encontrado (mais próximo do final)
            cut_point = max(last_space, last_period, last_comma, last_exclamation, last_question)
            
            if cut_point > max_length * 0.7:  # Só usar se não for muito no início (70% do tamanho)
                message_text = truncated[:cut_point].rstrip() + "..."
            else:
                # Se não encontrar ponto lógico, cortar no último espaço
                if last_space > max_length * 0.7:
                    message_text = truncated[:last_space].rstrip() + "..."
                else:
                    # Último recurso: cortar e adicionar "..."
                    message_text = truncated.rstrip() + "..."
            
            logger.warning(f"⚠️ [LINKEDIN] Nota de conexão truncada de {original_length} para {len(message_text)} caracteres")
        
        logger.info(f"✅ [LINKEDIN] Nota de conexão gerada com sucesso ({len(message_text)} caracteres)")
        
        return message_text
        
    except Exception as e:
        logger.error(f"❌ [LINKEDIN] Erro ao gerar nota de conexão: {e}")
        raise ValueError(f"Erro ao gerar nota de conexão: {str(e)}")


def generate_linkedin_followup_message(
    lead: Lead, 
    session: Session, 
    language: str = "pt-BR", 
    is_template: bool = False,
    followup_context: str = "generic"
) -> str:
    """
    Gera uma mensagem de follow-up personalizada para LinkedIn baseada no contexto e insight do lead
    
    Args:
        lead: Lead para gerar a mensagem de follow-up (ou lead template se is_template=True)
        session: Sessão do banco de dados para buscar produtos/serviços
        language: Idioma para gerar a mensagem (pt-BR ou en)
        is_template: Se True, gera um template com placeholders
        followup_context: Contexto do follow-up:
            - "after_connection": Após aceitar conexão
            - "after_meeting": Após uma reunião
            - "after_email": Após enviar e-mail
            - "after_call": Após uma ligação
            - "generic": Follow-up genérico
        
    Returns:
        String com a mensagem de follow-up gerada (ou template com placeholders se is_template=True)
    """
    if not is_llm_available():
        raise ValueError("LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env")
    
    llm = get_llm(temperature=0.7)
    
    if not llm:
        raise ValueError("Não foi possível inicializar o LLM. Verifique as configurações.")
    
    # Coletar dados do lead
    lead_data = {
        "nome": lead.name if not is_template else "João Silva",
        "empresa": lead.company if not is_template else "Empresa Exemplo Ltda",
        "cargo": lead.position if not is_template else "Diretor de Tecnologia",
        "insight": lead.linkedin_summary if not is_template else None,
        "headline": lead.linkedin_headline if not is_template else "Especialista em Tecnologia | 10+ anos de experiência",
        "sobre": lead.linkedin_about if not is_template else "Profissional com ampla experiência em gestão de equipes e projetos tecnológicos",
    }
    
    # Determinar idioma do prompt
    language_instruction = ""
    if language and language.startswith("pt"):
        language_instruction = "IMPORTANTE: Gere a mensagem de follow-up COMPLETAMENTE EM PORTUGUÊS (BRASIL). Use português brasileiro em todo o texto."
    elif language and language.startswith("en"):
        language_instruction = "IMPORTANTE: Generate the follow-up message COMPLETELY IN ENGLISH. Use English throughout the entire text."
    else:
        language_instruction = "IMPORTANTE: Gere a mensagem de follow-up COMPLETAMENTE EM PORTUGUÊS (BRASIL). Use português brasileiro em todo o texto."
    
    # Definir contexto específico
    context_instructions = {
        "after_connection": """
CONTEXTO: Esta é uma mensagem de follow-up logo após o lead aceitar sua solicitação de conexão no LinkedIn.

INSTRUÇÕES ESPECÍFICAS:
- Agradeça brevemente por aceitar a conexão
- Mencione algo específico do perfil dele que chamou atenção
- Seja leve e descontraído - ainda é o início do relacionamento
- NÃO peça nada em troca ainda
- Apenas crie uma conexão amigável
- Seja concisa - máximo de 300 caracteres
""",
        "after_meeting": """
CONTEXTO: Esta é uma mensagem de follow-up após uma reunião/agendamento que aconteceu.

INSTRUÇÕES ESPECÍFICAS:
- Agradeça pela reunião e pelo tempo dedicado
- Mencione algo específico que foi discutido na reunião (se houver contexto)
- Reforce pontos importantes que foram abordados
- Seja profissional mas caloroso
- Pode mencionar próximos passos de forma sutil, se fizer sentido
- Seja concisa - máximo de 500 caracteres
""",
        "after_email": """
CONTEXTO: Esta é uma mensagem de follow-up após enviar um e-mail ao lead.

INSTRUÇÕES ESPECÍFICAS:
- Mencione que enviou um e-mail recentemente
- Seja breve e não seja repetitivo (não repita o conteúdo do e-mail)
- Pode mencionar que gostaria de saber a opinião dele sobre o assunto
- Seja respeitoso com o tempo dele
- Seja concisa - máximo de 400 caracteres
""",
        "after_call": """
CONTEXTO: Esta é uma mensagem de follow-up após uma ligação telefônica.

INSTRUÇÕES ESPECÍFICAS:
- Agradeça pela conversa
- Mencione algo específico que foi discutido na ligação
- Reforce compromissos ou próximos passos acordados
- Seja profissional e objetivo
- Seja concisa - máximo de 500 caracteres
""",
        "generic": """
CONTEXTO: Esta é uma mensagem de follow-up genérica, sem contexto específico de interação anterior.

INSTRUÇÕES ESPECÍFICAS:
- Seja profissional e respeitosa
- Mencione algo relevante sobre o perfil do lead
- Ofereça valor sem ser comercial
- Seja concisa e objetiva - máximo de 500 caracteres
"""
    }
    
    context_instruction = context_instructions.get(followup_context, context_instructions["generic"])
    
    prompt = f"""Você é um especialista em vendas B2B e relacionamento com clientes. Gere uma mensagem de follow-up personalizada para LinkedIn.

{language_instruction}

{context_instruction}

DADOS DO LEAD:
Nome: {lead_data['nome']}
Empresa: {lead_data['empresa'] or 'Não informado'}
Cargo: {lead_data['cargo'] or 'Não informado'}
Headline: {lead_data['headline'] or 'Não informado'}
Sobre: {lead_data['sobre'] or 'Não informado'}

"""
    
    if lead_data['insight']:
        prompt += f"""
INSIGHT ESTRATÉGICO DO LEAD:
{lead_data['insight']}

"""
    
    # Buscar produtos e serviços do catálogo do tenant
    catalog_items = []
    if hasattr(lead, 'tenant_id') and lead.tenant_id:
        catalog_items = session.exec(
            select(Item).where(Item.tenant_id == lead.tenant_id)
        ).all()
    
    if catalog_items:
        prompt += f"""
PRODUTOS E SERVIÇOS DISPONÍVEIS NO CATÁLOGO:
"""
        for item in catalog_items:
            item_type_label = "Produto" if item.type == ItemType.PRODUCT else "Serviço"
            prompt += f"""
- {item_type_label}: {item.name}
  Descrição: {item.description or 'Sem descrição'}
  Preço: {item.unit_price} {item.currency}
"""
        prompt += "\n"
    
    prompt += f"""
Gere uma mensagem de follow-up personalizada que:

1. **Siga o contexto específico** fornecido acima
2. **Seja profissional e respeitosa** - reconheça que a pessoa pode estar ocupada
3. **Mencione o contexto anterior** de forma natural (conexão, reunião, e-mail, ligação)
4. **Ofereça valor** - não seja apenas uma mensagem comercial
5. **Tenha um tom consultivo** - mostre interesse genuíno em ajudar
6. **Use o insight** (se disponível) para personalizar e mostrar que você entendeu o perfil do lead
7. **Seja leve e não cobre atenção** - especialmente para "after_connection"
8. **Considere os produtos/serviços do catálogo** (se disponíveis) apenas se fizer sentido contextualmente:
   - Mencione de forma muito sutil e natural
   - NUNCA seja comercial ou vendedor
   - Apenas se o produto/serviço estiver relacionado ao perfil do lead de forma genuína
   - SEM mencionar preços, valores ou qualquer aspecto comercial

IMPORTANTE:
- A mensagem deve ser natural e não parecer um template
- Evite ser muito insistente ou "vendedor"
- Foque em criar valor e construir relacionamento
- Se houver insight, use-o para demonstrar conhecimento sobre o lead
- Se houver produtos/serviços no catálogo, mencione-os apenas se for natural e não parecer comercial
- NUNCA mencione preços, valores ou aspectos comerciais
- Se for template, mantenha os placeholders exatamente como fornecidos (ex: {{Nome do lead}}, {{Empresa}}) para que possam ser substituídos posteriormente
- O tom deve ser leve e descontraído, especialmente para "after_connection"

Retorne APENAS o texto da mensagem de follow-up, sem títulos, sem formatação markdown, sem explicações adicionais.
"""
    
    try:
        lead_identifier = f"lead {lead.id} ({lead.name})" if not is_template else "template"
        logger.info(f"🤖 [LINKEDIN] Gerando mensagem de follow-up para {lead_identifier}")
        response = llm.invoke(prompt)
        
        # Extrair conteúdo da resposta
        message_text = response.content if hasattr(response, 'content') else str(response)
        
        # Limpar resposta (remover markdown se houver)
        message_text = message_text.strip()
        if message_text.startswith("```"):
            lines = message_text.split('\n')
            message_text = '\n'.join([line for line in lines if not line.strip().startswith('```')])
        message_text = message_text.strip()
        
        logger.info(f"✅ [LINKEDIN] Mensagem de follow-up gerada com sucesso ({len(message_text)} caracteres)")
        
        # Se for template, substituir valores de exemplo por placeholders
        if is_template:
            message_text = message_text.replace("João Silva", "{Nome do lead}")
            message_text = message_text.replace("Empresa Exemplo Ltda", "{Empresa}")
            message_text = message_text.replace("Diretor de Tecnologia", "{Cargo}")
            message_text = message_text.replace("joao@exemplo.com", "{Email}")
            message_text = message_text.replace("(11) 99999-9999", "{Telefone}")
            message_text = message_text.replace("https://exemplo.com", "{Website}")
            message_text = message_text.replace("https://linkedin.com/in/joaosilva", "{LinkedIn}")
        
        return message_text
        
    except Exception as e:
        logger.error(f"❌ [LINKEDIN] Erro ao gerar mensagem de follow-up: {e}")
        raise ValueError(f"Erro ao gerar mensagem de follow-up: {str(e)}")

