from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models import (
    ProposalTemplate, ProposalTemplateCreate, ProposalTemplateUpdate, ProposalTemplateResponse,
    User
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_delete
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=ProposalTemplateResponse)
async def create_template(
    template_data: ProposalTemplateCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new proposal template"""
    # Preparar dados com ownership
    template_dict = template_data.dict()
    template_dict = ensure_ownership(template_dict, current_user)
    
    template = ProposalTemplate(
        **template_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    
    # Registrar auditoria
    log_create(session, current_user, "ProposalTemplate", template.id)
    
    return template


@router.get("", response_model=List[ProposalTemplateResponse])
async def get_templates(
    is_active: Optional[bool] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all proposal templates"""
    query = select(ProposalTemplate).where(
        ProposalTemplate.tenant_id == current_user.tenant_id
    )
    
    if is_active is not None:
        query = query.where(ProposalTemplate.is_active == is_active)
    
    query = query.order_by(ProposalTemplate.created_at.desc())
    
    templates = session.exec(query).all()
    return templates


@router.get("/{template_id}", response_model=ProposalTemplateResponse)
async def get_template(
    template_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific proposal template"""
    template = session.get(ProposalTemplate, template_id)
    if not template or template.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    return template


@router.put("/{template_id}", response_model=ProposalTemplateResponse)
async def update_template(
    template_id: int,
    template_data: ProposalTemplateUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a proposal template"""
    template = session.get(ProposalTemplate, template_id)
    if not template or template.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Verificar ownership (apenas owner ou admin pode editar)
    if template.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own templates"
        )
    
    # Atualizar campos
    update_data = template_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key not in ['owner_id', 'created_by_id', 'tenant_id']:
            old_value = getattr(template, key, None)
            if old_value != value:
                log_update(session, current_user, "ProposalTemplate", template_id, key, old_value, value)
            setattr(template, key, value)
    
    template.updated_at = datetime.utcnow()
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a proposal template"""
    template = session.get(ProposalTemplate, template_id)
    if not template or template.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Verificar ownership
    if template.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own templates"
        )
    
    # Registrar auditoria antes de deletar
    log_delete(session, current_user, "ProposalTemplate", template_id)
    
    session.delete(template)
    session.commit()
    return {"message": "Template deleted successfully"}


@router.get("/{template_id}/fields")
async def get_template_fields(
    template_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get available fields for a template"""
    template = session.get(ProposalTemplate, template_id)
    if not template or template.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Parse available_fields JSON se existir
    fields = []
    if template.available_fields:
        try:
            fields = json.loads(template.available_fields)
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in available_fields for template {template_id}")
    
    # Extrair campos do HTML também (placeholders como {{field_name}})
    import re
    placeholders = re.findall(r'\{\{(\w+)\}\}', template.html_content)
    unique_placeholders = list(set(placeholders))
    
    # Combinar campos do JSON e placeholders do HTML
    all_fields = list(set(fields + unique_placeholders))
    
    return {
        "template_id": template_id,
        "fields": all_fields,
        "placeholders_found": unique_placeholders
    }


