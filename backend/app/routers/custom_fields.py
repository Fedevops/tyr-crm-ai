"""
Router para gerenciar campos customizados
"""
import logging
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, and_
from app.database import get_session
from app.models import (
    User, CustomField, CustomFieldType,
    CustomFieldCreate, CustomFieldUpdate, CustomFieldResponse
)
from app.dependencies import get_current_active_user, ensure_ownership
from app.services.audit_service import log_create, log_update, log_delete

logger = logging.getLogger(__name__)

router = APIRouter()


def validate_field_name(field_name: str) -> str:
    """Valida e normaliza o nome do campo (slug)"""
    # Converter para lowercase e substituir espaços por underscores
    slug = re.sub(r'[^a-z0-9_]', '_', field_name.lower())
    # Remover underscores múltiplos
    slug = re.sub(r'_+', '_', slug)
    # Remover underscores no início e fim
    slug = slug.strip('_')
    if not slug:
        raise ValueError("Nome do campo inválido")
    return slug


@router.get("", response_model=List[CustomFieldResponse])
async def get_custom_fields(
    module_target: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar campos customizados do tenant"""
    query = select(CustomField).where(
        CustomField.tenant_id == current_user.tenant_id
    )
    
    if module_target:
        query = query.where(CustomField.module_target == module_target)
    
    fields = session.exec(query.order_by(CustomField.order, CustomField.created_at)).all()
    
    return [
        CustomFieldResponse(
            id=field.id,
            tenant_id=field.tenant_id,
            module_target=field.module_target,
            field_label=field.field_label,
            field_name=field.field_name,
            field_type=field.field_type.value,
            options=field.options,
            required=field.required,
            default_value=field.default_value,
            order=field.order,
            relationship_target=field.relationship_target,
            created_at=field.created_at,
            updated_at=field.updated_at
        )
        for field in fields
    ]


@router.get("/{field_id}", response_model=CustomFieldResponse)
async def get_custom_field(
    field_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Obter campo customizado específico"""
    try:
        import uuid
        field_uuid = uuid.UUID(field_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid field ID format"
        )
    
    field = session.get(CustomField, field_uuid)
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found"
        )
    
    if field.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom field does not belong to your tenant"
        )
    
    return CustomFieldResponse(
        id=field.id,
        tenant_id=field.tenant_id,
        module_target=field.module_target,
        field_label=field.field_label,
        field_name=field.field_name,
        field_type=field.field_type.value,
        options=field.options,
        required=field.required,
        default_value=field.default_value,
        order=field.order,
        relationship_target=field.relationship_target,
        created_at=field.created_at,
        updated_at=field.updated_at
    )


@router.post("", response_model=CustomFieldResponse)
async def create_custom_field(
    field_data: CustomFieldCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Criar novo campo customizado"""
    # Validar e normalizar field_name
    try:
        field_name = validate_field_name(field_data.field_name)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Verificar se já existe campo com mesmo nome no mesmo módulo
    existing = session.exec(
        select(CustomField).where(
            and_(
                CustomField.tenant_id == current_user.tenant_id,
                CustomField.module_target == field_data.module_target,
                CustomField.field_name == field_name
            )
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Field '{field_name}' already exists for module '{field_data.module_target}'"
        )
    
    # Validar relationship_target se field_type for RELATIONSHIP
    if field_data.field_type == CustomFieldType.RELATIONSHIP:
        if not field_data.relationship_target:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="relationship_target is required for RELATIONSHIP field type"
            )
    
    # Validar options se field_type for SELECT
    if field_data.field_type == CustomFieldType.SELECT:
        if not field_data.options or len(field_data.options) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="options is required for SELECT field type"
            )
    
    field = CustomField(
        tenant_id=current_user.tenant_id,
        module_target=field_data.module_target,
        field_label=field_data.field_label,
        field_name=field_name,
        field_type=field_data.field_type,
        options=field_data.options,
        required=field_data.required,
        default_value=field_data.default_value,
        order=field_data.order,
        relationship_target=field_data.relationship_target
    )
    
    session.add(field)
    session.commit()
    session.refresh(field)
    
    log_create(session, current_user, "CustomField", str(field.id))
    
    return CustomFieldResponse(
        id=field.id,
        tenant_id=field.tenant_id,
        module_target=field.module_target,
        field_label=field.field_label,
        field_name=field.field_name,
        field_type=field.field_type.value,
        options=field.options,
        required=field.required,
        default_value=field.default_value,
        order=field.order,
        relationship_target=field.relationship_target,
        created_at=field.created_at,
        updated_at=field.updated_at
    )


@router.put("/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: str,
    field_data: CustomFieldUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar campo customizado"""
    try:
        import uuid
        field_uuid = uuid.UUID(field_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid field ID format"
        )
    
    field = session.get(CustomField, field_uuid)
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found"
        )
    
    if field.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom field does not belong to your tenant"
        )
    
    # Atualizar campos
    update_data = field_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(field, key, value)
    
    # Validar relationship_target se field_type mudou para RELATIONSHIP
    if field.field_type == CustomFieldType.RELATIONSHIP:
        if not field.relationship_target:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="relationship_target is required for RELATIONSHIP field type"
            )
    
    # Validar options se field_type mudou para SELECT
    if field.field_type == CustomFieldType.SELECT:
        if not field.options or len(field.options) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="options is required for SELECT field type"
            )
    
    field.updated_at = datetime.utcnow()
    session.add(field)
    session.commit()
    session.refresh(field)
    
    log_update(session, current_user, "CustomField", str(field.id))
    
    return CustomFieldResponse(
        id=field.id,
        tenant_id=field.tenant_id,
        module_target=field.module_target,
        field_label=field.field_label,
        field_name=field.field_name,
        field_type=field.field_type.value,
        options=field.options,
        required=field.required,
        default_value=field.default_value,
        order=field.order,
        relationship_target=field.relationship_target,
        created_at=field.created_at,
        updated_at=field.updated_at
    )


@router.delete("/{field_id}")
async def delete_custom_field(
    field_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Deletar campo customizado"""
    try:
        import uuid
        field_uuid = uuid.UUID(field_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid field ID format"
        )
    
    field = session.get(CustomField, field_uuid)
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found"
        )
    
    if field.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom field does not belong to your tenant"
        )
    
    field_id_str = str(field.id)
    session.delete(field)
    session.commit()
    
    log_delete(session, current_user, "CustomField", field_id_str)
    
    return {"message": "Custom field deleted successfully"}


