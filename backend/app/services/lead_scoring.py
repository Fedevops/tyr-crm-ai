"""
Serviço de cálculo automático de score para leads
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlmodel import Session, select, func
from app.models import Lead, Task, TaskType, TaskStatus, LeadComment

logger = logging.getLogger(__name__)


def _calculate_enrichment_score(lead: Lead) -> int:
    """
    Calcula score baseado em enriquecimento de dados (máx 40 pontos)
    """
    score = 0
    
    # Informações de Contato (10 pts)
    if lead.email:
        score += 5
        # Validar formato básico de email
        if '@' in lead.email and '.' in lead.email.split('@')[1]:
            score += 5
    
    if lead.phone:
        score += 5
        # Validar telefone (remover caracteres e verificar tamanho)
        phone_clean = lead.phone.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if len(phone_clean) >= 10:
            score += 5
    
    # Dados Profissionais (15 pts)
    if lead.linkedin_url:
        score += 5
        if lead.linkedin_headline:
            score += 3
        if lead.linkedin_about:
            score += 3
        if lead.linkedin_experience_json:
            score += 2
        if lead.linkedin_education_json:
            score += 2
    
    # Dados da Empresa (15 pts)
    if lead.cnpj:
        score += 8
        if lead.situacao_cadastral and lead.situacao_cadastral.upper() == 'ATIVA':
            score += 3
        if lead.capital_social and lead.capital_social > 100000:
            score += 2
        if lead.porte or lead.industry:
            score += 2
    
    return min(40, score)


def _calculate_interaction_score(lead: Lead, session: Session) -> int:
    """
    Calcula score baseado em interações (máx 35 pontos)
    """
    score = 0
    
    # Buscar tasks completadas do lead
    tasks_query = select(Task).where(
        Task.lead_id == lead.id,
        Task.tenant_id == lead.tenant_id,
        Task.status == TaskStatus.COMPLETED,
        Task.completed_at.isnot(None)
    )
    completed_tasks = session.exec(tasks_query).all()
    
    # Tasks Completadas (20 pts)
    email_count = 0
    call_count = 0
    meeting_count = 0
    linkedin_count = 0
    
    for task in completed_tasks:
        if task.type == TaskType.EMAIL:
            email_count += 1
        elif task.type == TaskType.CALL:
            call_count += 1
        elif task.type == TaskType.MEETING:
            meeting_count += 1
        elif task.type == TaskType.LINKEDIN:
            linkedin_count += 1
    
    # Aplicar limites máximos
    score += min(email_count * 3, 9)  # Email: 3 pts cada, máx 9
    score += min(call_count * 5, 10)  # Call: 5 pts cada, máx 10
    score += min(meeting_count * 8, 8)  # Meeting: 8 pts cada, máx 8
    score += min(linkedin_count * 2, 4)  # LinkedIn: 2 pts cada, máx 4
    
    # Comentários (5 pts)
    comments_query = select(func.count(LeadComment.id)).where(
        LeadComment.lead_id == lead.id,
        LeadComment.tenant_id == lead.tenant_id
    )
    comments_count = session.exec(comments_query).first() or 0
    score += min(comments_count, 5)  # 1 pt por comentário, máx 5
    
    # Contatos Recentes (10 pts)
    if lead.last_contact:
        try:
            # Lidar com timezone-aware e naive datetimes
            last_contact = lead.last_contact
            if hasattr(last_contact, 'replace'):
                # Se tiver timezone, remover para comparação
                if last_contact.tzinfo is not None:
                    last_contact = last_contact.replace(tzinfo=None)
            now = datetime.utcnow()
            days_since_contact = (now - last_contact).days
            if days_since_contact <= 7:
                score += 10
            elif days_since_contact <= 30:
                score += 5
            else:
                score += 2
        except Exception as e:
            logger.warning(f"⚠️ [SCORING] Erro ao calcular dias desde último contato: {e}")
            score += 0
    else:
        score += 0  # Sem contato
    
    return min(35, score)


def _calculate_status_score(lead: Lead) -> int:
    """
    Calcula score baseado em status e engajamento (máx 25 pontos)
    """
    score = 0
    
    # Status do Lead (15 pts)
    status_scores = {
        'won': 15,
        'negotiation': 12,
        'proposal_sent': 10,
        'meeting_scheduled': 8,
        'qualified': 6,
        'contacted': 4,
        'new': 2,
        'nurturing': 3,
        'lost': 0
    }
    
    status_value = lead.status.value if hasattr(lead.status, 'value') else str(lead.status)
    score += status_scores.get(status_value, 2)
    
    # Follow-up Agendado (5 pts)
    if lead.next_followup:
        score += 5
    
    # Responsável Atribuído (5 pts)
    if lead.owner_id:
        score += 5
    
    return min(25, score)


def calculate_lead_score(lead: Lead, session: Session) -> int:
    """
    Calcula o score total do lead baseado em enriquecimento, interações e status
    
    Args:
        lead: Lead para calcular score
        session: Sessão do banco de dados para buscar tasks e comentários
        
    Returns:
        Score entre 0-100
    """
    try:
        enrichment_score = _calculate_enrichment_score(lead)
        interaction_score = _calculate_interaction_score(lead, session)
        status_score = _calculate_status_score(lead)
        
        total_score = enrichment_score + interaction_score + status_score
        
        # Garantir que está entre 0-100
        final_score = max(0, min(100, total_score))
        
        logger.debug(
            f"📊 [SCORING] Lead {lead.id} ({lead.name}): "
            f"Enriquecimento={enrichment_score}, Interações={interaction_score}, "
            f"Status={status_score}, Total={final_score}"
        )
        
        return final_score
        
    except Exception as e:
        logger.error(f"❌ [SCORING] Erro ao calcular score do lead {lead.id}: {e}")
        # Em caso de erro, retornar score mínimo
        return 0


def should_recalculate_score(old_lead: Optional[Lead], new_lead: Lead) -> bool:
    """
    Verifica se o score deve ser recalculado baseado em mudanças relevantes
    
    Args:
        old_lead: Lead antes da atualização (None se for criação)
        new_lead: Lead após atualização
        
    Returns:
        True se deve recalcular, False caso contrário
    """
    # Se for criação, sempre recalcular
    if old_lead is None:
        return True
    
    # Campos de contato
    if old_lead.email != new_lead.email or old_lead.phone != new_lead.phone:
        return True
    
    # Campos de enriquecimento LinkedIn
    if (old_lead.linkedin_url != new_lead.linkedin_url or
        old_lead.linkedin_headline != new_lead.linkedin_headline or
        old_lead.linkedin_about != new_lead.linkedin_about or
        old_lead.linkedin_experience_json != new_lead.linkedin_experience_json or
        old_lead.linkedin_education_json != new_lead.linkedin_education_json):
        return True
    
    # Campos Casa dos Dados
    if (old_lead.cnpj != new_lead.cnpj or
        old_lead.situacao_cadastral != new_lead.situacao_cadastral or
        old_lead.capital_social != new_lead.capital_social or
        old_lead.porte != new_lead.porte or
        old_lead.industry != new_lead.industry):
        return True
    
    # Status e engajamento
    old_status = old_lead.status.value if hasattr(old_lead.status, 'value') else str(old_lead.status)
    new_status = new_lead.status.value if hasattr(new_lead.status, 'value') else str(new_lead.status)
    if (old_status != new_status or
        old_lead.last_contact != new_lead.last_contact or
        old_lead.next_followup != new_lead.next_followup or
        old_lead.owner_id != new_lead.owner_id):
        return True
    
    return False


def calculate_icp_score(lead: Lead) -> int:
    """
    Calcula o score de qualificação ICP (Ideal Customer Profile) do lead
    baseado nos campos de qualificação preenchidos.
    
    Args:
        lead: Lead para calcular ICP score
        
    Returns:
        Score entre 0-5
    """
    try:
        score = 0
        
        # Industry preenchido (1 ponto)
        if lead.industry and lead.industry.strip():
            score += 1
        
        # Company size preenchido (1 ponto)
        if lead.company_size and lead.company_size.strip():
            score += 1
        
        # Tech stack preenchido (1 ponto)
        if lead.tech_stack and lead.tech_stack.strip():
            score += 1
        
        # Está contratando (1 ponto)
        if lead.is_hiring:
            score += 1
        
        # Está fazendo publicidade (1 ponto)
        if lead.is_advertising:
            score += 1
        
        # Garantir que está entre 0-5
        final_score = max(0, min(5, score))
        
        logger.debug(
            f"🎯 [ICP SCORING] Lead {lead.id} ({lead.name}): "
            f"Industry={bool(lead.industry)}, CompanySize={bool(lead.company_size)}, "
            f"TechStack={bool(lead.tech_stack)}, IsHiring={lead.is_hiring}, "
            f"IsAdvertising={lead.is_advertising}, ICP Score={final_score}"
        )
        
        return final_score
        
    except Exception as e:
        logger.error(f"❌ [ICP SCORING] Erro ao calcular ICP score do lead {lead.id}: {e}")
        # Em caso de erro, retornar score mínimo
        return 0


def should_recalculate_icp_score(old_lead: Optional[Lead], new_lead: Lead) -> bool:
    """
    Verifica se o ICP score deve ser recalculado baseado em mudanças nos campos ICP
    
    Args:
        old_lead: Lead antes da atualização (None se for criação)
        new_lead: Lead após atualização
        
    Returns:
        True se deve recalcular, False caso contrário
    """
    # Se for criação, sempre recalcular
    if old_lead is None:
        return True
    
    # Verificar mudanças nos campos ICP
    if (old_lead.industry != new_lead.industry or
        old_lead.company_size != new_lead.company_size or
        old_lead.tech_stack != new_lead.tech_stack or
        old_lead.is_hiring != new_lead.is_hiring or
        old_lead.is_advertising != new_lead.is_advertising):
        return True
    
    return False

