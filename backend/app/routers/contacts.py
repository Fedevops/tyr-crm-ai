from typing import List, Optional, Dict, Union
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import JSONResponse
from sqlmodel import Session, select, and_, or_, func
from pydantic import BaseModel, Field
from app.database import get_session
from app.models import Contact, ContactCreate, ContactResponse, Account, User
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_delete
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Modelos para filtros avançados
class ContactFilter(BaseModel):
    field: str
    operator: str
    value: Optional[Union[str, int, float, bool, List]] = None
    value2: Optional[Union[str, int, float]] = None

class ContactFiltersRequest(BaseModel):
    filters: List[ContactFilter] = Field(default_factory=list)
    logic: str = Field("AND", description="Lógica de combinação: 'AND' ou 'OR'")
    search: Optional[str] = None
    skip: int = 0
    limit: int = 100

# Mapeamento de campos e seus tipos
CONTACT_FIELD_TYPES: Dict[str, str] = {
    "id": "number",
    "account_id": "number",
    "owner_id": "number",
    "created_by_id": "number",
    "created_at": "date",
    "updated_at": "date",
}

def get_contact_field_type(field_name: str) -> str:
    return CONTACT_FIELD_TYPES.get(field_name, "string")


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


@router.post("/filter", response_model=List[ContactResponse])
async def filter_contacts(
    filters_request: ContactFiltersRequest = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get contacts with advanced filters"""
    count_query = select(func.count(Contact.id))
    count_query = apply_ownership_filter(count_query, Contact, current_user)
    
    query = select(Contact)
    query = apply_ownership_filter(query, Contact, current_user)
    
    filter_conditions = []
    
    if filters_request.filters:
        for filter_obj in filters_request.filters:
            try:
                if not hasattr(Contact, filter_obj.field):
                    logger.warning(f"Campo '{filter_obj.field}' não existe no modelo Contact")
                    continue
                
                field = getattr(Contact, filter_obj.field)
                field_type = get_contact_field_type(filter_obj.field)
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
            Contact.first_name.ilike(f"%{filters_request.search}%"),
            Contact.last_name.ilike(f"%{filters_request.search}%"),
            Contact.email.ilike(f"%{filters_request.search}%"),
            Contact.phone.ilike(f"%{filters_request.search}%"),
            Contact.mobile.ilike(f"%{filters_request.search}%")
        )
        filter_conditions.append(search_filter)
    
    if filter_conditions:
        if filters_request.logic.upper() == "OR":
            combined_filter = or_(*filter_conditions)
        else:
            combined_filter = and_(*filter_conditions)
        query = query.where(combined_filter)
        count_query = count_query.where(combined_filter)
    
    query = query.order_by(Contact.last_name.asc(), Contact.first_name.asc())
    
    total_count = session.exec(count_query).one()
    query = query.offset(filters_request.skip).limit(filters_request.limit)
    
    contacts = session.exec(query).all()
    
    contacts_data = []
    for contact in contacts:
        cont_dict = contact.dict()
        for key, value in cont_dict.items():
            if isinstance(value, datetime):
                cont_dict[key] = value.isoformat()
        contacts_data.append(cont_dict)
    
    response = JSONResponse(content=contacts_data)
    response.headers["X-Total-Count"] = str(total_count)
    return response


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

