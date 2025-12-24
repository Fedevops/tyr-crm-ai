from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, and_, or_, func
from app.database import get_session
from app.models import Contact, ContactCreate, ContactResponse, Account, User
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_delete

router = APIRouter()


@router.post("", response_model=ContactResponse)
async def create_contact(
    contact_data: ContactCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new contact"""
    # Verificar se a account existe (se fornecido)
    if contact_data.account_id:
        account = session.get(Account, contact_data.account_id)
        if not account or account.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )
        require_ownership(account, current_user)
    
    # Preparar dados com ownership
    cont_dict = contact_data.dict()
    cont_dict = ensure_ownership(cont_dict, current_user)
    
    contact = Contact(
        **cont_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(contact)
    session.commit()
    session.refresh(contact)
    
    # Registrar auditoria
    log_create(session, current_user, "Contact", contact.id)
    
    return contact


@router.get("", response_model=List[ContactResponse])
async def get_contacts(
    account_id: Optional[int] = Query(None, description="Filter by account"),
    search: Optional[str] = Query(None, description="Search in name, email, phone"),
    owner_id: Optional[int] = Query(None, description="Filter by owner"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all contacts with filters"""
    # Base query - aplicar filtro de ownership
    query = select(Contact)
    query = apply_ownership_filter(query, Contact, current_user)
    
    # Aplicar filtros adicionais
    filters = []
    
    if account_id:
        filters.append(Contact.account_id == account_id)
    
    if search:
        search_filter = or_(
            Contact.first_name.ilike(f"%{search}%"),
            Contact.last_name.ilike(f"%{search}%"),
            Contact.email.ilike(f"%{search}%"),
            Contact.phone.ilike(f"%{search}%"),
            Contact.mobile.ilike(f"%{search}%")
        )
        filters.append(search_filter)
    
    if owner_id:
        # Admin pode filtrar por qualquer owner, usuário normal só por si mesmo
        if current_user.role.value == "admin" or owner_id == current_user.id:
            filters.append(Contact.owner_id == owner_id)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only filter by your own contacts"
            )
    
    if filters:
        query = query.where(and_(*filters))
    
    # Ordenar por nome
    query = query.order_by(Contact.last_name.asc(), Contact.first_name.asc())
    
    # Aplicar paginação
    query = query.offset(skip).limit(limit)
    
    contacts = session.exec(query).all()
    return contacts


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific contact"""
    contact = session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    require_ownership(contact, current_user)
    return contact


@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    contact_data: ContactCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a contact"""
    contact = session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    require_ownership(contact, current_user)
    
    # Verificar account se mudou
    if contact_data.account_id and contact_data.account_id != contact.account_id:
        account = session.get(Account, contact_data.account_id)
        if not account or account.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )
        require_ownership(account, current_user)
    
    # Atualizar campos
    cont_dict = contact_data.dict()
    for key, value in cont_dict.items():
        if key not in ['owner_id', 'created_by_id', 'tenant_id']:
            old_value = getattr(contact, key, None)
            if old_value != value:
                # Registrar mudança de campo
                log_update(session, current_user, "Contact", contact_id, key, old_value, value)
            setattr(contact, key, value)
    
    # Atualizar owner_id se especificado (com validação)
    if cont_dict.get("owner_id") and cont_dict["owner_id"] != contact.owner_id:
        if current_user.role.value == "admin":
            old_owner = contact.owner_id
            contact.owner_id = cont_dict["owner_id"]
            log_update(session, current_user, "Contact", contact_id, "owner_id", old_owner, cont_dict["owner_id"])
        elif cont_dict["owner_id"] == current_user.id:
            old_owner = contact.owner_id
            contact.owner_id = cont_dict["owner_id"]
            log_update(session, current_user, "Contact", contact_id, "owner_id", old_owner, cont_dict["owner_id"])
    
    session.add(contact)
    session.commit()
    session.refresh(contact)
    return contact


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a contact"""
    contact = session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    require_ownership(contact, current_user)
    
    # Verificar se há opportunities associadas
    from app.models import Opportunity
    opportunities = session.exec(
        select(Opportunity).where(
            and_(
                Opportunity.contact_id == contact_id,
                Opportunity.tenant_id == current_user.tenant_id
            )
        )
    ).all()
    
    if opportunities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete contact with associated opportunities. Please delete or reassign opportunities first."
        )
    
    # Registrar auditoria antes de deletar
    log_delete(session, current_user, "Contact", contact_id)
    
    session.delete(contact)
    session.commit()
    return {"message": "Contact deleted successfully"}

