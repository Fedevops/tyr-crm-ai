from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, and_
from app.database import get_session
from app.models import (
    Proposal, ProposalCreate, ProposalResponse, ProposalStatus,
    Opportunity, User
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_status_change, log_delete

router = APIRouter()


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
    
    # Preparar dados com ownership
    prop_dict = proposal_data.dict()
    prop_dict = ensure_ownership(prop_dict, current_user)
    
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
    proposal_data: ProposalCreate,
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
    
    # Verificar opportunity se mudou
    if proposal_data.opportunity_id != proposal.opportunity_id:
        opportunity = session.get(Opportunity, proposal_data.opportunity_id)
        if not opportunity or opportunity.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        require_ownership(opportunity, current_user)
    
    # Atualizar campos
    prop_dict = proposal_data.dict()
    for key, value in prop_dict.items():
        if key not in ['owner_id', 'created_by_id', 'tenant_id', 'status']:
            old_value = getattr(proposal, key, None)
            if old_value != value:
                # Registrar mudança de campo
                log_update(session, current_user, "Proposal", proposal_id, key, old_value, value)
            setattr(proposal, key, value)
    
    # Atualizar owner_id se especificado (com validação)
    if prop_dict.get("owner_id") and prop_dict["owner_id"] != proposal.owner_id:
        if current_user.role.value == "admin":
            old_owner = proposal.owner_id
            proposal.owner_id = prop_dict["owner_id"]
            log_update(session, current_user, "Proposal", proposal_id, "owner_id", old_owner, prop_dict["owner_id"])
        elif prop_dict["owner_id"] == current_user.id:
            old_owner = proposal.owner_id
            proposal.owner_id = prop_dict["owner_id"]
            log_update(session, current_user, "Proposal", proposal_id, "owner_id", old_owner, prop_dict["owner_id"])
    
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

