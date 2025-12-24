from typing import List, Optional, Dict, Union
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import JSONResponse
from sqlmodel import Session, select, and_, or_, func
from pydantic import BaseModel, Field
from app.database import get_session
from app.models import (
    Opportunity, OpportunityCreate, OpportunityResponse, OpportunityStatus,
    Account, Contact, SalesStage, SalesFunnel, User,
    OpportunityComment, OpportunityCommentCreate, OpportunityCommentResponse
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_status_change, log_stage_change, log_delete
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Modelos para filtros avançados
class OpportunityFilter(BaseModel):
    field: str
    operator: str
    value: Optional[Union[str, int, float, bool, List]] = None
    value2: Optional[Union[str, int, float]] = None

class OpportunityFiltersRequest(BaseModel):
    filters: List[OpportunityFilter] = Field(default_factory=list)
    logic: str = Field("AND", description="Lógica de combinação: 'AND' ou 'OR'")
    search: Optional[str] = None
    skip: int = 0
    limit: int = 100

# Mapeamento de campos e seus tipos
OPPORTUNITY_FIELD_TYPES: Dict[str, str] = {
    "id": "number",
    "account_id": "number",
    "contact_id": "number",
    "stage_id": "number",
    "owner_id": "number",
    "created_by_id": "number",
    "amount": "number",
    "probability": "number",
    "expected_close_date": "date",
    "actual_close_date": "date",
    "created_at": "date",
    "updated_at": "date",
    "status": "enum",
}

def get_opportunity_field_type(field_name: str) -> str:
    return OPPORTUNITY_FIELD_TYPES.get(field_name, "string")


@router.post("", response_model=OpportunityResponse)
async def create_opportunity(
    opportunity_data: OpportunityCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new opportunity"""
    # Verificar se a account existe e pertence ao tenant
    account = session.get(Account, opportunity_data.account_id)
    if not account or account.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    require_ownership(account, current_user)
    
    # Verificar se o contact existe (se fornecido)
    if opportunity_data.contact_id:
        contact = session.get(Contact, opportunity_data.contact_id)
        if not contact or contact.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        require_ownership(contact, current_user)
    
    # Verificar se o stage existe e pertence ao tenant
    stage = session.get(SalesStage, opportunity_data.stage_id)
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales stage not found"
        )
    
    funnel = session.get(SalesFunnel, stage.funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales stage not found"
        )
    
    # Preparar dados com ownership
    opp_dict = opportunity_data.dict()
    opp_dict = ensure_ownership(opp_dict, current_user)
    
    # Usar probabilidade do stage se não especificada
    if opp_dict.get("probability") is None:
        opp_dict["probability"] = stage.probability
    
    opportunity = Opportunity(
        **opp_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    
    # Registrar auditoria
    log_create(session, current_user, "Opportunity", opportunity.id)
    
    return opportunity


@router.post("/filter", response_model=List[OpportunityResponse])
async def filter_opportunities(
    filters_request: OpportunityFiltersRequest = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get opportunities with advanced filters"""
    count_query = select(func.count(Opportunity.id))
    count_query = apply_ownership_filter(count_query, Opportunity, current_user)
    
    query = select(Opportunity)
    query = apply_ownership_filter(query, Opportunity, current_user)
    
    filter_conditions = []
    
    if filters_request.filters:
        for filter_obj in filters_request.filters:
            try:
                if not hasattr(Opportunity, filter_obj.field):
                    logger.warning(f"Campo '{filter_obj.field}' não existe no modelo Opportunity")
                    continue
                
                field = getattr(Opportunity, filter_obj.field)
                field_type = get_opportunity_field_type(filter_obj.field)
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
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Erro ao aplicar filtro no campo '{filter_obj.field}': {str(e)}"
                )
    
    if filters_request.search:
        search_filter = or_(
            Opportunity.name.ilike(f"%{filters_request.search}%"),
            Opportunity.description.ilike(f"%{filters_request.search}%")
        )
        filter_conditions.append(search_filter)
    
    if filter_conditions:
        if filters_request.logic.upper() == "OR":
            combined_filter = or_(*filter_conditions)
        else:
            combined_filter = and_(*filter_conditions)
        query = query.where(combined_filter)
        count_query = count_query.where(combined_filter)
    
    query = query.order_by(Opportunity.created_at.desc())
    
    total_count = session.exec(count_query).one()
    query = query.offset(filters_request.skip).limit(filters_request.limit)
    
    opportunities = session.exec(query).all()
    
    opportunities_data = []
    for opp in opportunities:
        opp_dict = opp.dict()
        for key, value in opp_dict.items():
            if isinstance(value, datetime):
                opp_dict[key] = value.isoformat()
        opportunities_data.append(opp_dict)
    
    response = JSONResponse(content=opportunities_data)
    response.headers["X-Total-Count"] = str(total_count)
    return response


@router.get("", response_model=List[OpportunityResponse])
async def get_opportunities(
    account_id: Optional[int] = Query(None, description="Filter by account"),
    contact_id: Optional[int] = Query(None, description="Filter by contact"),
    stage_id: Optional[int] = Query(None, description="Filter by stage"),
    funnel_id: Optional[int] = Query(None, description="Filter by funnel"),
    status_filter: Optional[OpportunityStatus] = Query(None, description="Filter by status"),
    owner_id: Optional[int] = Query(None, description="Filter by owner"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all opportunities with filters"""
    # Base query - aplicar filtro de ownership
    query = select(Opportunity)
    query = apply_ownership_filter(query, Opportunity, current_user)
    
    # Aplicar filtros adicionais
    filters = []
    
    if account_id:
        filters.append(Opportunity.account_id == account_id)
    
    if contact_id:
        filters.append(Opportunity.contact_id == contact_id)
    
    if stage_id:
        filters.append(Opportunity.stage_id == stage_id)
    
    if funnel_id:
        # Filtrar por funil através do stage
        stages = session.exec(
            select(SalesStage.id).where(SalesStage.funnel_id == funnel_id)
        ).all()
        if stages:
            filters.append(Opportunity.stage_id.in_(stages))
        else:
            # Se não há estágios, retornar vazio
            return []
    
    if status_filter:
        filters.append(Opportunity.status == status_filter)
    
    if owner_id:
        # Admin pode filtrar por qualquer owner, usuário normal só por si mesmo
        if current_user.role.value == "admin" or owner_id == current_user.id:
            filters.append(Opportunity.owner_id == owner_id)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only filter by your own opportunities"
            )
    
    if filters:
        query = query.where(and_(*filters))
    
    # Ordenar por data de criação (mais recente primeiro)
    query = query.order_by(Opportunity.created_at.desc())
    
    # Aplicar paginação
    query = query.offset(skip).limit(limit)
    
    opportunities = session.exec(query).all()
    return opportunities


@router.get("/{opportunity_id}", response_model=OpportunityResponse)
async def get_opportunity(
    opportunity_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific opportunity"""
    opportunity = session.get(Opportunity, opportunity_id)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    return opportunity


@router.put("/{opportunity_id}", response_model=OpportunityResponse)
async def update_opportunity(
    opportunity_id: int,
    opportunity_data: OpportunityCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update an opportunity"""
    opportunity = session.get(Opportunity, opportunity_id)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    
    # Verificar account se mudou
    if opportunity_data.account_id != opportunity.account_id:
        account = session.get(Account, opportunity_data.account_id)
        if not account or account.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )
        require_ownership(account, current_user)
    
    # Verificar contact se mudou
    if opportunity_data.contact_id and opportunity_data.contact_id != opportunity.contact_id:
        contact = session.get(Contact, opportunity_data.contact_id)
        if not contact or contact.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        require_ownership(contact, current_user)
    
    # Verificar stage se mudou
    old_stage_id = opportunity.stage_id
    if opportunity_data.stage_id != opportunity.stage_id:
        stage = session.get(SalesStage, opportunity_data.stage_id)
        if not stage:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sales stage not found"
            )
        
        funnel = session.get(SalesFunnel, stage.funnel_id)
        if not funnel or funnel.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sales stage not found"
            )
        
        # Registrar mudança de estágio
        log_stage_change(session, current_user, "Opportunity", opportunity_id, old_stage_id, opportunity_data.stage_id)
    
    # Atualizar campos
    opp_dict = opportunity_data.dict()
    for key, value in opp_dict.items():
        if key not in ['owner_id', 'created_by_id', 'tenant_id']:
            old_value = getattr(opportunity, key, None)
            if old_value != value:
                # Registrar mudança de campo
                log_update(session, current_user, "Opportunity", opportunity_id, key, old_value, value)
            setattr(opportunity, key, value)
    
    # Atualizar owner_id se especificado (com validação)
    if opp_dict.get("owner_id") and opp_dict["owner_id"] != opportunity.owner_id:
        if current_user.role.value == "admin":
            old_owner = opportunity.owner_id
            opportunity.owner_id = opp_dict["owner_id"]
            log_update(session, current_user, "Opportunity", opportunity_id, "owner_id", old_owner, opp_dict["owner_id"])
        elif opp_dict["owner_id"] == current_user.id:
            old_owner = opportunity.owner_id
            opportunity.owner_id = opp_dict["owner_id"]
            log_update(session, current_user, "Opportunity", opportunity_id, "owner_id", old_owner, opp_dict["owner_id"])
    
    session.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    return opportunity


@router.delete("/{opportunity_id}")
async def delete_opportunity(
    opportunity_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an opportunity"""
    opportunity = session.get(Opportunity, opportunity_id)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    
    # Verificar se há propostas associadas
    from app.models import Proposal
    proposals = session.exec(
        select(Proposal).where(
            and_(
                Proposal.opportunity_id == opportunity_id,
                Proposal.tenant_id == current_user.tenant_id
            )
        )
    ).all()
    
    if proposals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete opportunity with associated proposals. Please delete proposals first."
        )
    
    # Registrar auditoria antes de deletar
    log_delete(session, current_user, "Opportunity", opportunity_id)
    
    session.delete(opportunity)
    session.commit()
    return {"message": "Opportunity deleted successfully"}


@router.patch("/{opportunity_id}/status", response_model=OpportunityResponse)
async def update_opportunity_status(
    opportunity_id: int,
    new_status: OpportunityStatus,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update opportunity status"""
    opportunity = session.get(Opportunity, opportunity_id)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    
    old_status = opportunity.status
    opportunity.status = new_status
    
    # Se mudou para WON ou LOST, atualizar data de fechamento
    if new_status in [OpportunityStatus.WON, OpportunityStatus.LOST]:
        opportunity.actual_close_date = datetime.utcnow()
    elif new_status == OpportunityStatus.OPEN:
        opportunity.actual_close_date = None
    
    session.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    
    # Registrar mudança de status
    log_status_change(session, current_user, "Opportunity", opportunity_id, old_status.value, new_status.value)
    
    return opportunity


@router.patch("/{opportunity_id}/stage", response_model=OpportunityResponse)
async def update_opportunity_stage(
    opportunity_id: int,
    new_stage_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update opportunity stage"""
    opportunity = session.get(Opportunity, opportunity_id)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    
    # Verificar se o stage existe e pertence ao tenant
    stage = session.get(SalesStage, new_stage_id)
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales stage not found"
        )
    
    funnel = session.get(SalesFunnel, stage.funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales stage not found"
        )
    
    old_stage_id = opportunity.stage_id
    opportunity.stage_id = new_stage_id
    
    # Atualizar probabilidade se não foi especificada manualmente
    if opportunity.probability is None or opportunity.probability == stage.probability:
        opportunity.probability = stage.probability
    
    session.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    
    # Registrar mudança de estágio
    log_stage_change(session, current_user, "Opportunity", opportunity_id, old_stage_id, new_stage_id)
    
    return opportunity


@router.get("/funnel/{funnel_id}", response_model=List[OpportunityResponse])
async def get_opportunities_by_funnel(
    funnel_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all opportunities for a specific funnel"""
    # Verificar se o funil existe e pertence ao tenant
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    # Buscar estágios do funil
    stages = session.exec(
        select(SalesStage.id).where(SalesStage.funnel_id == funnel_id)
    ).all()
    
    if not stages:
        return []
    
    # Buscar oportunidades nos estágios do funil
    query = select(Opportunity)
    query = apply_ownership_filter(query, Opportunity, current_user)
    query = query.where(Opportunity.stage_id.in_(stages))
    query = query.order_by(Opportunity.created_at.desc())
    query = query.offset(skip).limit(limit)
    
    opportunities = session.exec(query).all()
    return opportunities


@router.post("/{opportunity_id}/comments", response_model=OpportunityCommentResponse)
async def create_opportunity_comment(
    opportunity_id: int,
    comment_data: OpportunityCommentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a comment on an opportunity"""
    # Verify opportunity access
    opportunity = session.get(Opportunity, opportunity_id)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    
    # Create comment
    comment = OpportunityComment(
        tenant_id=current_user.tenant_id,
        opportunity_id=opportunity_id,
        user_id=current_user.id,
        comment=comment_data.comment
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    
    # Update opportunity's updated_at
    opportunity.updated_at = datetime.utcnow()
    session.add(opportunity)
    session.commit()
    
    # Get user info for response
    user = session.get(User, current_user.id)
    response = OpportunityCommentResponse(
        id=comment.id,
        tenant_id=comment.tenant_id,
        opportunity_id=comment.opportunity_id,
        user_id=comment.user_id,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user_name=user.full_name if user else None,
        user_email=user.email if user else None
    )
    
    return response


@router.get("/{opportunity_id}/comments", response_model=List[OpportunityCommentResponse])
async def get_opportunity_comments(
    opportunity_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all comments for an opportunity"""
    # Verify opportunity access
    opportunity = session.get(Opportunity, opportunity_id)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found"
        )
    require_ownership(opportunity, current_user)
    
    # Get comments
    comments = session.exec(
        select(OpportunityComment)
        .where(
            and_(
                OpportunityComment.opportunity_id == opportunity_id,
                OpportunityComment.tenant_id == current_user.tenant_id
            )
        )
        .order_by(OpportunityComment.created_at.desc())
    ).all()
    
    # Get user info for each comment
    result = []
    for comment in comments:
        user = session.get(User, comment.user_id)
        result.append(OpportunityCommentResponse(
            id=comment.id,
            tenant_id=comment.tenant_id,
            opportunity_id=comment.opportunity_id,
            user_id=comment.user_id,
            comment=comment.comment,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            user_name=user.full_name if user else None,
            user_email=user.email if user else None
        ))
    
    return result


@router.delete("/comments/{comment_id}")
async def delete_opportunity_comment(
    comment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a comment on an opportunity"""
    comment = session.get(OpportunityComment, comment_id)
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

