from typing import List, Optional, Dict, Union
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import Response, StreamingResponse
from sqlmodel import Session, select, and_, or_, func
from pydantic import BaseModel, Field
from app.database import get_session
from app.models import (
    Proposal, ProposalCreate, ProposalUpdate, ProposalResponse, ProposalStatus,
    Opportunity, User, ProposalTemplate,
    ProposalComment, ProposalCommentCreate, ProposalCommentResponse,
    Item
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_status_change, log_delete
import logging
import json
import re
from io import BytesIO

logger = logging.getLogger(__name__)

try:
    from jinja2 import Template
    JINJA2_AVAILABLE = True
except ImportError:
    JINJA2_AVAILABLE = False
    logger.warning("jinja2 not available. Template rendering will be disabled.")

router = APIRouter()

# Modelos para filtros avançados
class ProposalFilter(BaseModel):
    field: str
    operator: str
    value: Optional[Union[str, int, float, bool, List]] = None
    value2: Optional[Union[str, int, float]] = None

class ProposalFiltersRequest(BaseModel):
    filters: List[ProposalFilter] = Field(default_factory=list)
    logic: str = Field("AND", description="Lógica de combinação: 'AND' ou 'OR'")
    search: Optional[str] = None
    skip: int = 0
    limit: int = 100

# Mapeamento de campos e seus tipos
PROPOSAL_FIELD_TYPES: Dict[str, str] = {
    "id": "number",
    "opportunity_id": "number",
    "owner_id": "number",
    "created_by_id": "number",
    "amount": "number",
    "created_at": "date",
    "updated_at": "date",
    "sent_at": "date",
    "accepted_at": "date",
    "rejected_at": "date",
    "valid_until": "date",
    "status": "dropdown",
    "currency": "dropdown",
}

def get_proposal_field_type(field_name: str) -> str:
    return PROPOSAL_FIELD_TYPES.get(field_name, "string")


def validate_proposal_items(session: Session, items_json: Optional[str], tenant_id: int) -> Optional[str]:
    """
    Valida e processa os itens de uma proposta.
    
    Args:
        session: Sessão do banco de dados
        items_json: JSON string com array de itens [{item_id, quantity, unit_price}]
        tenant_id: ID do tenant para validação de segurança
    
    Returns:
        JSON string validado e processado com subtotais calculados
    
    Raises:
        HTTPException 400 se algum item for inválido ou de outro tenant
    """
    if not items_json:
        return None
    
    try:
        items = json.loads(items_json)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format in items field"
        )
    
    if not isinstance(items, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Items must be an array"
        )
    
    if len(items) == 0:
        return None
    
    validated_items = []
    total = 0.0
    
    for item_data in items:
        if not isinstance(item_data, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each item must be an object"
            )
        
        item_id = item_data.get('item_id')
        quantity = item_data.get('quantity', 1)
        unit_price = item_data.get('unit_price')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="item_id is required for each item"
            )
        
        if not isinstance(quantity, (int, float)) or quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid quantity for item {item_id}: must be a positive number"
            )
        
        # Buscar item no banco
        item = session.get(Item, item_id)
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item {item_id} not found"
            )
        
        # VALIDAÇÃO DE SEGURANÇA: Verificar se item pertence ao tenant
        if item.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Item {item_id} does not belong to your tenant"
            )
        
        # Usar preço do item se não fornecido, ou validar se fornecido
        if unit_price is None:
            unit_price = item.unit_price
        elif unit_price != item.unit_price:
            # Permitir preço customizado, mas registrar o preço original também
            pass
        
        subtotal = float(quantity) * float(unit_price)
        total += subtotal
        
        validated_item = {
            'item_id': item_id,
            'name': item.name,
            'sku': item.sku,
            'type': item.type.value,
            'quantity': quantity,
            'unit_price': float(unit_price),
            'subtotal': round(subtotal, 2)
        }
        validated_items.append(validated_item)
    
    result = {
        'items': validated_items,
        'subtotal': round(total, 2),
        'total': round(total, 2)
    }
    
    return json.dumps(result)


@router.post("", response_model=ProposalResponse)
async def create_proposal(
    proposal_data: ProposalCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new proposal"""
    # Verificar se a opportunity existe e pertence ao tenant
    opportunity = session.get(Opportunity, proposal_data.opportunity_id)
    if not opportunity or opportunity.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    
    # Validar e processar itens se fornecidos
    items_json = None
    if proposal_data.items:
        items_json = validate_proposal_items(session, proposal_data.items, current_user.tenant_id)
        # Se itens foram fornecidos, recalcular amount baseado no total dos itens
        if items_json:
            items_data = json.loads(items_json)
            proposal_data.amount = items_data.get('total', proposal_data.amount)
    
    # Preparar dados com ownership
    prop_dict = proposal_data.dict(exclude={'template_id', 'template_data', 'items'})
    prop_dict = ensure_ownership(prop_dict, current_user)
    
    # Adicionar items validado
    if items_json:
        prop_dict['items'] = items_json
    
    # Se template_id foi fornecido, gerar conteúdo do template
    # Se content foi fornecido manualmente, usar ele; caso contrário, gerar do template
    content = proposal_data.content or ""
    template_data_dict = {}
    
    if proposal_data.template_id and not proposal_data.content:
        template = session.get(ProposalTemplate, proposal_data.template_id)
        if not template or template.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Parse template_data JSON se fornecido
        if proposal_data.template_data:
            try:
                template_data_dict = json.loads(proposal_data.template_data)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid JSON in template_data"
                )
        
        # Adicionar dados padrão da opportunity, account, contact
        if opportunity:
            template_data_dict['opportunity_name'] = opportunity.name
            template_data_dict['opportunity_amount'] = opportunity.amount or 0
            template_data_dict['opportunity_currency'] = opportunity.currency or 'BRL'
            
            # Carregar account se existir
            if opportunity.account_id:
                from app.models import Account
                account = session.get(Account, opportunity.account_id)
                if account:
                    template_data_dict['company_name'] = account.name
                    template_data_dict['company_website'] = account.website or ''
                    template_data_dict['company_phone'] = account.phone or ''
                    template_data_dict['company_email'] = account.email or ''
            
            # Carregar contact se existir
            if opportunity.contact_id:
                from app.models import Contact
                contact = session.get(Contact, opportunity.contact_id)
                if contact:
                    template_data_dict['contact_name'] = f"{contact.first_name} {contact.last_name}"
                    template_data_dict['contact_email'] = contact.email or ''
                    template_data_dict['contact_phone'] = contact.phone or ''
                    template_data_dict['contact_position'] = contact.position or ''
        
        # Adicionar dados da proposta
        template_data_dict['proposal_title'] = proposal_data.title
        template_data_dict['proposal_amount'] = proposal_data.amount
        template_data_dict['proposal_currency'] = proposal_data.currency or 'BRL'
        template_data_dict['valid_until'] = proposal_data.valid_until.strftime('%d/%m/%Y') if proposal_data.valid_until else ''
        
        # Renderizar template
        try:
            content = render_template(template.html_content, template_data_dict)
            prop_dict['template_data'] = json.dumps(template_data_dict)
            prop_dict['template_id'] = proposal_data.template_id
        except Exception as e:
            logger.error(f"Error rendering template {proposal_data.template_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erro ao renderizar template: {str(e)}"
            )
    
    prop_dict['content'] = content
    
    # Garantir que template_id e template_data sejam None se não foram fornecidos
    if 'template_id' not in prop_dict:
        prop_dict['template_id'] = None
    if 'template_data' not in prop_dict:
        prop_dict['template_data'] = None
    
    proposal = Proposal(
        **prop_dict,
        tenant_id=current_user.tenant_id,
        status=ProposalStatus.DRAFT
    )
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    
    # Registrar auditoria
    log_create(session, current_user, "Proposal", proposal.id)
    
    return proposal


@router.get("", response_model=List[ProposalResponse])
async def get_proposals(
    opportunity_id: Optional[int] = Query(None, description="Filter by opportunity"),
    status_filter: Optional[ProposalStatus] = Query(None, description="Filter by status"),
    owner_id: Optional[int] = Query(None, description="Filter by owner"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all proposals with filters"""
    # Base query - aplicar filtro de ownership
    query = select(Proposal)
    query = apply_ownership_filter(query, Proposal, current_user)
    
    # Aplicar filtros adicionais
    filters = []
    
    if opportunity_id:
        filters.append(Proposal.opportunity_id == opportunity_id)
    
    if status_filter:
        filters.append(Proposal.status == status_filter)
    
    if owner_id:
        # Admin pode filtrar por qualquer owner, usuário normal só por si mesmo
        if current_user.role.value == "admin" or owner_id == current_user.id:
            filters.append(Proposal.owner_id == owner_id)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only filter by your own proposals"
            )
    
    if filters:
        query = query.where(and_(*filters))
    
    # Ordenar por data de criação (mais recente primeiro)
    query = query.order_by(Proposal.created_at.desc())
    
    # Aplicar paginação
    query = query.offset(skip).limit(limit)
    
    proposals = session.exec(query).all()
    return proposals


@router.post("/filter", response_model=List[ProposalResponse])
async def filter_proposals(
    filters_request: ProposalFiltersRequest = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get proposals with advanced filters"""
    # Base query for counting
    count_query = select(func.count(Proposal.id))
    count_query = apply_ownership_filter(count_query, Proposal, current_user)
    
    # Query for data
    query = select(Proposal)
    query = apply_ownership_filter(query, Proposal, current_user)
    
    # Aplicar filtros avançados
    filter_conditions = []
    
    if filters_request.filters:
        for filter_obj in filters_request.filters:
            try:
                if not hasattr(Proposal, filter_obj.field):
                    logger.warning(f"Campo '{filter_obj.field}' não existe no modelo Proposal")
                    continue
                
                field = getattr(Proposal, filter_obj.field)
                field_type = get_proposal_field_type(filter_obj.field)
                operator = filter_obj.operator
                value = filter_obj.value
                value2 = filter_obj.value2
                
                if value is None and operator not in ["is_null", "is_not_null"]:
                    continue
                
                if operator == "equals":
                    if field_type == "string":
                        if value:
                            filter_conditions.append(field.ilike(f"{value}"))
                    else:
                        filter_conditions.append(field == value)
                elif operator == "not_equals":
                    if field_type == "string":
                        if value:
                            filter_conditions.append(~field.ilike(f"{value}"))
                    else:
                        filter_conditions.append(field != value)
                elif operator == "greater_than":
                    if value is not None:
                        filter_conditions.append(field > value)
                elif operator == "less_than":
                    if value is not None:
                        filter_conditions.append(field < value)
                elif operator == "greater_than_or_equal":
                    if value is not None:
                        filter_conditions.append(field >= value)
                elif operator == "less_than_or_equal":
                    if value is not None:
                        filter_conditions.append(field <= value)
                elif operator == "between":
                    if value is not None and value2 is not None:
                        filter_conditions.append(and_(field >= value, field <= value2))
                elif operator == "contains":
                    if value:
                        filter_conditions.append(field.ilike(f"%{value}%"))
                elif operator == "not_contains":
                    if value:
                        filter_conditions.append(~field.ilike(f"%{value}%"))
                elif operator == "starts_with":
                    if value:
                        filter_conditions.append(field.ilike(f"{value}%"))
                elif operator == "ends_with":
                    if value:
                        filter_conditions.append(field.ilike(f"%{value}"))
                elif operator == "is_null":
                    filter_conditions.append(field.is_(None))
                elif operator == "is_not_null":
                    filter_conditions.append(field.isnot(None))
                elif operator == "in":
                    if value:
                        if not isinstance(value, list):
                            value = [value]
                        filter_conditions.append(field.in_(value))
                elif operator == "not_in":
                    if value:
                        if not isinstance(value, list):
                            value = [value]
                        filter_conditions.append(~field.in_(value))
            except Exception as e:
                logger.error(f"Erro ao aplicar filtro {filter_obj.field}: {e}", exc_info=True)
                continue
    
    if filters_request.search:
        search_filter = or_(
            Proposal.title.ilike(f"%{filters_request.search}%"),
            Proposal.content.ilike(f"%{filters_request.search}%"),
            Proposal.notes.ilike(f"%{filters_request.search}%")
        )
        filter_conditions.append(search_filter)
    
    if filter_conditions:
        if filters_request.logic.upper() == "OR":
            combined_filter = or_(*filter_conditions)
        else:
            combined_filter = and_(*filter_conditions)
        
        query = query.where(combined_filter)
        count_query = count_query.where(combined_filter)
    
    # Ordenar por data de criação (mais recente primeiro)
    query = query.order_by(Proposal.created_at.desc())
    
    # Aplicar paginação
    query = query.offset(filters_request.skip).limit(filters_request.limit)
    
    proposals = session.exec(query).all()
    return proposals


@router.get("/filter-fields")
async def get_proposal_filter_fields(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get available filter fields for proposals"""
    fields_info = []
    
    # Campos disponíveis para filtro
    filterable_fields = {
        "id": "ID",
        "title": "Título",
        "status": "Status",
        "amount": "Valor",
        "currency": "Moeda",
        "opportunity_id": "ID da Oportunidade",
        "owner_id": "Responsável",
        "valid_until": "Válida até",
        "created_at": "Data de Criação",
        "updated_at": "Data de Atualização",
        "sent_at": "Data de Envio",
        "accepted_at": "Data de Aceitação",
        "rejected_at": "Data de Rejeição",
    }
    
    for field_name, label in filterable_fields.items():
        field_type = get_proposal_field_type(field_name)
        
        if field_type == "number":
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "greater_than", "label": "Maior que"},
                {"value": "less_than", "label": "Menor que"},
                {"value": "greater_than_or_equal", "label": "Maior ou igual a"},
                {"value": "less_than_or_equal", "label": "Menor ou igual a"},
                {"value": "between", "label": "Entre"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        elif field_type == "date":
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "greater_than", "label": "Depois de"},
                {"value": "less_than", "label": "Antes de"},
                {"value": "greater_than_or_equal", "label": "Depois ou igual a"},
                {"value": "less_than_or_equal", "label": "Antes ou igual a"},
                {"value": "between", "label": "Entre"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        elif field_type == "dropdown":
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "in", "label": "Está em"},
                {"value": "not_in", "label": "Não está em"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        else:  # string
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "contains", "label": "Contém"},
                {"value": "not_contains", "label": "Não contém"},
                {"value": "starts_with", "label": "Começa com"},
                {"value": "ends_with", "label": "Termina com"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        
        fields_info.append({
            "field": field_name,
            "type": field_type,
            "label": label,
            "operators": operators
        })
    
    return {"fields": fields_info}


@router.get("/{proposal_id}", response_model=ProposalResponse)
async def get_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific proposal"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    return proposal


@router.put("/{proposal_id}", response_model=ProposalResponse)
async def update_proposal(
    proposal_id: int,
    proposal_data: ProposalUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a proposal"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    # Não permitir editar proposta que já foi enviada, aceita ou rejeitada
    if proposal.status in [ProposalStatus.SENT, ProposalStatus.ACCEPTED, ProposalStatus.REJECTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit proposal with status {proposal.status.value}"
        )
    
    # Atualizar campos (apenas os que foram fornecidos)
    update_data = proposal_data.dict(exclude_unset=True)
    
    # Validar e processar itens se fornecidos
    if 'items' in update_data and update_data['items']:
        items_json = validate_proposal_items(session, update_data['items'], current_user.tenant_id)
        if items_json:
            items_data = json.loads(items_json)
            # Recalcular amount baseado no total dos itens
            if 'amount' not in update_data:
                update_data['amount'] = items_data.get('total', proposal.amount)
            else:
                update_data['amount'] = items_data.get('total', update_data['amount'])
        update_data['items'] = items_json
    elif 'items' in update_data and update_data['items'] is None:
        # Permitir remover itens
        update_data['items'] = None
    
    # Se template_id foi fornecido, gerar conteúdo do template
    if 'template_id' in update_data and update_data['template_id']:
        template = session.get(ProposalTemplate, update_data['template_id'])
        if not template or template.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Parse template_data JSON se fornecido
        template_data_dict = {}
        if 'template_data' in update_data and update_data['template_data']:
            try:
                template_data_dict = json.loads(update_data['template_data'])
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid JSON in template_data"
                )
        
        # Carregar opportunity com relacionamentos
        opportunity = session.get(Opportunity, proposal.opportunity_id)
        if opportunity:
            from app.models import Account, Contact
            if opportunity.account_id:
                account_stmt = select(Account).where(Account.id == opportunity.account_id)
                opportunity.account = session.exec(account_stmt).first()
            if opportunity.contact_id:
                contact_stmt = select(Contact).where(Contact.id == opportunity.contact_id)
                opportunity.contact = session.exec(contact_stmt).first()
            
            # Adicionar dados padrão
            template_data_dict['opportunity_name'] = opportunity.name
            template_data_dict['opportunity_amount'] = opportunity.amount or 0
            template_data_dict['opportunity_currency'] = opportunity.currency or 'BRL'
            
            if opportunity.account:
                template_data_dict['company_name'] = opportunity.account.name
                template_data_dict['company_website'] = opportunity.account.website or ''
                template_data_dict['company_phone'] = opportunity.account.phone or ''
                template_data_dict['company_email'] = opportunity.account.email or ''
            
            if opportunity.contact:
                template_data_dict['contact_name'] = f"{opportunity.contact.first_name} {opportunity.contact.last_name}"
                template_data_dict['contact_email'] = opportunity.contact.email or ''
                template_data_dict['contact_phone'] = opportunity.contact.phone or ''
                template_data_dict['contact_position'] = opportunity.contact.position or ''
        
        # Adicionar dados da proposta
        template_data_dict['proposal_title'] = update_data.get('title', proposal.title)
        template_data_dict['proposal_amount'] = update_data.get('amount', proposal.amount)
        template_data_dict['proposal_currency'] = update_data.get('currency', proposal.currency) or 'BRL'
        if 'valid_until' in update_data and update_data['valid_until']:
            template_data_dict['valid_until'] = update_data['valid_until'].strftime('%d/%m/%Y')
        elif proposal.valid_until:
            template_data_dict['valid_until'] = proposal.valid_until.strftime('%d/%m/%Y')
        else:
            template_data_dict['valid_until'] = ''
        
        # Renderizar template
        content = render_template(template.html_content, template_data_dict)
        update_data['content'] = content
        update_data['template_data'] = json.dumps(template_data_dict)
    
    # Atualizar campos
    for key, value in update_data.items():
        if key not in ['owner_id', 'created_by_id', 'tenant_id', 'status']:
            old_value = getattr(proposal, key, None)
            if old_value != value:
                # Registrar mudança de campo
                log_update(session, current_user, "Proposal", proposal_id, key, old_value, value)
            setattr(proposal, key, value)
    
    proposal.updated_at = datetime.utcnow()
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    return proposal


@router.delete("/{proposal_id}")
async def delete_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a proposal"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    # Não permitir deletar proposta que já foi aceita
    if proposal.status == ProposalStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete accepted proposal"
        )
    
    # Registrar auditoria antes de deletar
    log_delete(session, current_user, "Proposal", proposal_id)
    
    session.delete(proposal)
    session.commit()
    return {"message": "Proposal deleted successfully"}


@router.post("/{proposal_id}/send", response_model=ProposalResponse)
async def send_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Mark proposal as sent"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    if proposal.status != ProposalStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Proposal must be in DRAFT status to send. Current status: {proposal.status.value}"
        )
    
    old_status = proposal.status
    proposal.status = ProposalStatus.SENT
    proposal.sent_at = datetime.utcnow()
    proposal.updated_at = datetime.utcnow()
    
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    
    # Registrar mudança de status
    log_status_change(session, current_user, "Proposal", proposal_id, old_status.value, ProposalStatus.SENT.value)
    
    return proposal


@router.post("/{proposal_id}/accept", response_model=ProposalResponse)
async def accept_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Mark proposal as accepted"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    if proposal.status != ProposalStatus.SENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Proposal must be in SENT status to accept. Current status: {proposal.status.value}"
        )
    
    old_status = proposal.status
    proposal.status = ProposalStatus.ACCEPTED
    proposal.accepted_at = datetime.utcnow()
    proposal.updated_at = datetime.utcnow()
    
    # Atualizar status da opportunity para WON
    opportunity = session.get(Opportunity, proposal.opportunity_id)
    if opportunity:
        opportunity.status = "won"
        opportunity.actual_close_date = datetime.utcnow()
        session.add(opportunity)
    
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    
    # Registrar mudança de status
    log_status_change(session, current_user, "Proposal", proposal_id, old_status.value, ProposalStatus.ACCEPTED.value)
    
    return proposal


@router.post("/{proposal_id}/reject", response_model=ProposalResponse)
async def reject_proposal(
    proposal_id: int,
    rejection_reason: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Mark proposal as rejected"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    if proposal.status != ProposalStatus.SENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Proposal must be in SENT status to reject. Current status: {proposal.status.value}"
        )
    
    old_status = proposal.status
    proposal.status = ProposalStatus.REJECTED
    proposal.rejected_at = datetime.utcnow()
    proposal.rejection_reason = rejection_reason
    proposal.updated_at = datetime.utcnow()
    
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    
    # Registrar mudança de status
    log_status_change(session, current_user, "Proposal", proposal_id, old_status.value, ProposalStatus.REJECTED.value)
    
    return proposal


@router.post("/{proposal_id}/comments", response_model=ProposalCommentResponse)
async def create_proposal_comment(
    proposal_id: int,
    comment_data: ProposalCommentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a comment on a proposal"""
    # Verify proposal access
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    # Create comment
    comment = ProposalComment(
        tenant_id=current_user.tenant_id,
        proposal_id=proposal_id,
        user_id=current_user.id,
        comment=comment_data.comment
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    
    # Update proposal's updated_at
    proposal.updated_at = datetime.utcnow()
    session.add(proposal)
    session.commit()
    
    # Get user info for response
    user = session.get(User, current_user.id)
    response = ProposalCommentResponse(
        id=comment.id,
        tenant_id=comment.tenant_id,
        proposal_id=comment.proposal_id,
        user_id=comment.user_id,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user_name=user.full_name if user else None,
        user_email=user.email if user else None
    )
    
    return response


@router.get("/{proposal_id}/comments", response_model=List[ProposalCommentResponse])
async def get_proposal_comments(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all comments for a proposal"""
    # Verify proposal access
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    # Get comments
    comments = session.exec(
        select(ProposalComment)
        .where(
            and_(
                ProposalComment.proposal_id == proposal_id,
                ProposalComment.tenant_id == current_user.tenant_id
            )
        )
        .order_by(ProposalComment.created_at.desc())
    ).all()
    
    # Get user info for each comment
    result = []
    for comment in comments:
        user = session.get(User, comment.user_id)
        result.append(ProposalCommentResponse(
            id=comment.id,
            tenant_id=comment.tenant_id,
            proposal_id=comment.proposal_id,
            user_id=comment.user_id,
            comment=comment.comment,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            user_name=user.full_name if user else None,
            user_email=user.email if user else None
        ))
    
    return result


@router.delete("/comments/{comment_id}")
async def delete_proposal_comment(
    comment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a comment on a proposal"""
    comment = session.get(ProposalComment, comment_id)
    if not comment or comment.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Only allow deletion by comment owner or admin
    if comment.user_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments"
        )
    
    session.delete(comment)
    session.commit()
    return {"message": "Comment deleted successfully"}


def render_template(html_content: str, data: Dict[str, any]) -> str:
    """Render template HTML with data using Jinja2"""
    if not JINJA2_AVAILABLE:
        # Fallback: simple string replacement for {{field}} placeholders
        result = html_content
        for key, value in data.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result
    
    try:
        template = Template(html_content)
        return template.render(**data)
    except Exception as e:
        logger.error(f"Error rendering template: {e}")
        # Fallback to simple replacement
        result = html_content
        for key, value in data.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result


@router.get("/{proposal_id}/html")
async def get_proposal_html(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get proposal HTML for PDF generation (client-side)"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    # Retornar HTML formatado para geração de PDF no frontend
    styled_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {{
                size: A4;
                margin: 2cm;
            }}
            body {{
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                line-height: 1.6;
                color: #333;
            }}
            h1, h2, h3 {{
                color: #2c3e50;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
            }}
            table th, table td {{
                border: 1px solid #ddd;
                padding: 12px;
                text-align: left;
            }}
            table th {{
                background-color: #f2f2f2;
            }}
        </style>
    </head>
    <body>
        {proposal.content}
    </body>
    </html>
    """
    
    return Response(
        content=styled_html,
        media_type="text/html",
        headers={
            "Content-Disposition": f'inline; filename="proposal_{proposal_id}.html"'
        }
    )


@router.post("/{proposal_id}/send-email")
async def send_proposal_email(
    proposal_id: int,
    recipient_email: str = Body(..., embed=True),
    subject: Optional[str] = Body(None, embed=True),
    message: Optional[str] = Body(None, embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Send proposal by email"""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )
    require_ownership(proposal, current_user)
    
    # TODO: Implementar envio de e-mail
    # Por enquanto, apenas retornar sucesso
    # Você precisará configurar SMTP ou usar um serviço como SendGrid, AWS SES, etc.
    
    logger.info(f"Sending proposal {proposal_id} to {recipient_email}")
    
    # Marcar como enviado se ainda estiver em DRAFT
    if proposal.status == ProposalStatus.DRAFT:
        proposal.status = ProposalStatus.SENT
        proposal.sent_at = datetime.utcnow()
        session.add(proposal)
        session.commit()
    
    return {
        "message": "Email sent successfully",
        "proposal_id": proposal_id,
        "recipient": recipient_email,
        "note": "Email functionality needs to be configured with SMTP or email service"
    }

