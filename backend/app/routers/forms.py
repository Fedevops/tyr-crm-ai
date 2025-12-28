"""
Router para gerenciar formulários de captura
"""
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, and_
from app.database import get_session
from app.models import (
    User, Form, FormField, FormFieldType,
    FormCreate, FormUpdate, FormResponse, FormFieldCreate, FormFieldResponse,
    FormSubmitRequest, Lead, LeadStatus
)
from app.dependencies import get_current_active_user, ensure_ownership
from app.services.audit_service import log_create, log_update, log_delete

logger = logging.getLogger(__name__)

router = APIRouter()


def form_to_response(form: Form, session: Session) -> FormResponse:
    """Converte Form para FormResponse com fields"""
    fields = session.exec(
        select(FormField).where(FormField.form_id == form.id)
        .order_by(FormField.order)
    ).all()
    
    return FormResponse(
        id=form.id,
        tenant_id=form.tenant_id,
        name=form.name,
        description=form.description,
        button_text=form.button_text,
        button_color=form.button_color,
        success_message=form.success_message,
        is_active=form.is_active,
        created_at=form.created_at,
        updated_at=form.updated_at,
        fields=[
            FormFieldResponse(
                id=field.id,
                form_id=field.form_id,
                field_type=field.field_type.value,
                label=field.label,
                name=field.name,
                placeholder=field.placeholder,
                required=field.required,
                order=field.order,
                options=field.options
            )
            for field in fields
        ]
    )


@router.get("", response_model=List[FormResponse])
async def get_forms(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar formulários do tenant"""
    forms = session.exec(
        select(Form).where(Form.tenant_id == current_user.tenant_id)
        .order_by(Form.created_at.desc())
    ).all()
    
    return [form_to_response(form, session) for form in forms]


@router.get("/{form_id}", response_model=FormResponse)
async def get_form(
    form_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Obter formulário específico"""
    form = session.get(Form, form_id)
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if form.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Form does not belong to your tenant"
        )
    
    return form_to_response(form, session)


@router.post("", response_model=FormResponse)
async def create_form(
    form_data: FormCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Criar novo formulário"""
    form_dict = form_data.dict(exclude={'fields'})
    form_dict = ensure_ownership(form_dict, current_user)
    
    form = Form(
        **form_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(form)
    session.commit()
    session.refresh(form)
    
    # Criar campos
    for idx, field_data in enumerate(form_data.fields):
        field = FormField(
            form_id=form.id,
            field_type=field_data.field_type,
            label=field_data.label,
            name=field_data.name,
            placeholder=field_data.placeholder,
            required=field_data.required,
            order=field_data.order if field_data.order > 0 else idx,
            options=field_data.options
        )
        session.add(field)
    
    session.commit()
    session.refresh(form)
    
    log_create(session, current_user, "Form", form.id)
    return form_to_response(form, session)


@router.put("/{form_id}", response_model=FormResponse)
async def update_form(
    form_id: int,
    form_data: FormUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar formulário"""
    form = session.get(Form, form_id)
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if form.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Form does not belong to your tenant"
        )
    
    # Atualizar campos do formulário
    update_data = form_data.dict(exclude_unset=True, exclude={'fields'})
    for key, value in update_data.items():
        if value is not None:
            setattr(form, key, value)
    
    # Atualizar campos se fornecidos
    if form_data.fields is not None:
        # Deletar campos existentes
        existing_fields = session.exec(
            select(FormField).where(FormField.form_id == form_id)
        ).all()
        for field in existing_fields:
            session.delete(field)
        
        # Criar novos campos
        for idx, field_data in enumerate(form_data.fields):
            field = FormField(
                form_id=form.id,
                field_type=field_data.field_type,
                label=field_data.label,
                name=field_data.name,
                placeholder=field_data.placeholder,
                required=field_data.required,
                order=field_data.order if field_data.order > 0 else idx,
                options=field_data.options
            )
            session.add(field)
    
    form.updated_at = datetime.utcnow()
    session.add(form)
    session.commit()
    session.refresh(form)
    
    log_update(session, current_user, "Form", form_id)
    return form_to_response(form, session)


@router.delete("/{form_id}")
async def delete_form(
    form_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Deletar formulário"""
    form = session.get(Form, form_id)
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if form.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Form does not belong to your tenant"
        )
    
    session.delete(form)
    session.commit()
    
    log_delete(session, current_user, "Form", form_id)
    return {"message": "Form deleted successfully"}


@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_form(
    submit_data: FormSubmitRequest,
    session: Session = Depends(get_session)
):
    """
    Endpoint público para submissão de formulário
    Cria automaticamente um Lead no tenant correspondente
    """
    # Buscar formulário
    form = session.get(Form, submit_data.form_id)
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if not form.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Form is not active"
        )
    
    # Buscar campos do formulário
    fields = session.exec(
        select(FormField).where(FormField.form_id == form.id)
        .order_by(FormField.order)
    ).all()
    
    # Validar campos obrigatórios
    field_names = {field.name: field for field in fields}
    for field in fields:
        if field.required and field.name not in submit_data.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Campo obrigatório '{field.label}' não fornecido"
            )
    
    # Mapear dados do formulário para Lead
    # Campos padrão
    name = submit_data.data.get("name") or submit_data.data.get("nome") or None
    email = submit_data.data.get("email") or submit_data.data.get("e_mail") or None
    phone = submit_data.data.get("phone") or submit_data.data.get("telefone") or submit_data.data.get("phone_number") or None
    company = submit_data.data.get("company") or submit_data.data.get("empresa") or submit_data.data.get("organization") or None
    
    # Garantir que temos pelo menos nome ou email
    if not name:
        if email:
            name = email.split("@")[0]
        elif company:
            name = company
        else:
            name = "Lead do Formulário"
    
    # Mensagem/observações
    notes_parts = []
    for field in fields:
        if field.name in submit_data.data:
            if field.field_type == FormFieldType.TEXTAREA:
                notes_parts.append(f"{field.label}: {submit_data.data[field.name]}")
            elif field.name not in ["name", "nome", "email", "e_mail", "phone", "telefone", "phone_number", "company", "empresa", "organization", "position", "cargo", "website", "site"]:
                notes_parts.append(f"{field.label}: {submit_data.data[field.name]}")
    
    notes = "\n".join(notes_parts) if notes_parts else None
    
    # Criar lead
    lead = Lead(
        name=name,
        email=email,
        phone=phone,
        company=company,
        position=submit_data.data.get("position") or submit_data.data.get("cargo") or None,
        website=submit_data.data.get("website") or submit_data.data.get("site") or None,
        status=LeadStatus.NEW,
        source=f"Formulário: {form.name}",
        notes=notes,
        tenant_id=form.tenant_id,
        owner_id=None,  # Será atribuído automaticamente
        created_by_id=None
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)
    
    logger.info(f"Lead criado a partir do formulário {form.id}: Lead ID {lead.id}")
    
    return {
        "success": True,
        "message": form.success_message,
        "lead_id": lead.id
    }

