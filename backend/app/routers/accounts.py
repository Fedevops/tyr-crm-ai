from typing import List, Optional, Dict, Union
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import JSONResponse
from sqlmodel import Session, select, and_, or_, func
from pydantic import BaseModel, Field
from app.database import get_session
from app.models import Account, AccountCreate, AccountResponse, User, Order
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_delete
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Modelos para filtros avançados
class AccountFilter(BaseModel):
    field: str
    operator: str
    value: Optional[Union[str, int, float, bool, List]] = None
    value2: Optional[Union[str, int, float]] = None

class AccountFiltersRequest(BaseModel):
    filters: List[AccountFilter] = Field(default_factory=list)

# Mapeamento de tipos de campos
ACCOUNT_FIELD_TYPES = {
    "name": "string",
    "website": "string",
    "phone": "string",
    "email": "string",
    "industry": "string",
    "company_size": "string",
    "address": "string",
    "city": "string",
    "state": "string",
    "zip_code": "string",
    "country": "string",
    "description": "string",
    "cnpj": "string",
    "razao_social": "string",
    "nome_fantasia": "string",
    "owner_id": "integer",
    "created_by_id": "integer",
    "created_at": "datetime",
    "updated_at": "datetime",
}

def get_account_field_type(field_name: str) -> str:
    return ACCOUNT_FIELD_TYPES.get(field_name, "string")


@router.post("", response_model=AccountResponse)
async def create_account(
    account_data: AccountCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new account"""
    # Verificar se CNPJ já existe (se fornecido)
    if account_data.cnpj:
        existing = session.exec(
            select(Account).where(
                and_(
                    Account.tenant_id == current_user.tenant_id,
                    Account.cnpj == account_data.cnpj
                )
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account with this CNPJ already exists"
            )
    
    # Preparar dados com ownership
    acc_dict = account_data.dict()
    acc_dict = ensure_ownership(acc_dict, current_user)
    
    account = Account(
        **acc_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    
    # Registrar auditoria
    log_create(session, current_user, "Account", account.id)
    
    # Retornar com estatísticas (zero para nova conta)
    account_dict = account.dict()
    account_dict['orders_count'] = 0
    account_dict['total_orders_value'] = 0.0
    return AccountResponse(**account_dict)


@router.post("/filter", response_model=List[AccountResponse])
async def filter_accounts(
    filters_request: AccountFiltersRequest = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    
    # Base query - aplicar filtro de ownership
    query = select(Account)
    query = apply_ownership_filter(query, Account, current_user)
    
    # Aplicar filtros
    filters = []
    for filter_item in filters_request.filters:
        field_type = get_account_field_type(filter_item.field)
        field = getattr(Account, filter_item.field, None)
        
        if not field:
            continue
        
        if filter_item.operator == "equals":
            filters.append(field == filter_item.value)
        elif filter_item.operator == "not_equals":
            filters.append(field != filter_item.value)
        elif filter_item.operator == "contains":
            if field_type == "string":
                filters.append(field.ilike(f"%{filter_item.value}%"))
        elif filter_item.operator == "not_contains":
            if field_type == "string":
                filters.append(~field.ilike(f"%{filter_item.value}%"))
        elif filter_item.operator == "starts_with":
            if field_type == "string":
                filters.append(field.ilike(f"{filter_item.value}%"))
        elif filter_item.operator == "ends_with":
            if field_type == "string":
                filters.append(field.ilike(f"%{filter_item.value}"))
        elif filter_item.operator == "greater_than":
            filters.append(field > filter_item.value)
        elif filter_item.operator == "less_than":
            filters.append(field < filter_item.value)
        elif filter_item.operator == "greater_than_or_equal":
            filters.append(field >= filter_item.value)
        elif filter_item.operator == "less_than_or_equal":
            filters.append(field <= filter_item.value)
        elif filter_item.operator == "between":
            if filter_item.value is not None and filter_item.value2 is not None:
                filters.append(and_(field >= filter_item.value, field <= filter_item.value2))
        elif filter_item.operator == "in":
            if isinstance(filter_item.value, list):
                filters.append(field.in_(filter_item.value))
        elif filter_item.operator == "not_in":
            if isinstance(filter_item.value, list):
                filters.append(~field.in_(filter_item.value))
        elif filter_item.operator == "is_null":
            filters.append(field.is_(None))
        elif filter_item.operator == "is_not_null":
            filters.append(field.isnot(None))
    
    if filters:
        query = query.where(and_(*filters))
    
    # Ordenar por nome
    query = query.order_by(Account.name.asc())
    
    accounts = session.exec(query).all()
    
    # Adicionar estatísticas de pedidos para cada conta
    accounts_with_stats = []
    for account in accounts:
        orders_count = session.exec(
            select(func.count(Order.id)).where(
                and_(
                    Order.tenant_id == current_user.tenant_id,
                    Order.account_id == account.id
                )
            )
        ).one() or 0
        
        total_orders_value = session.exec(
            select(func.sum(Order.total_amount)).where(
                and_(
                    Order.tenant_id == current_user.tenant_id,
                    Order.account_id == account.id
                )
            )
        ).one() or 0.0
        
        account_dict = account.dict()
        account_dict['orders_count'] = orders_count
        account_dict['total_orders_value'] = float(total_orders_value) if total_orders_value else 0.0
        accounts_with_stats.append(AccountResponse(**account_dict))
    
    # Contar total (para paginação futura)
    total_count = len(accounts_with_stats)
    
    response = JSONResponse(content=[acc.dict() for acc in accounts_with_stats])
    response.headers["X-Total-Count"] = str(total_count)
    return response


@router.get("", response_model=List[AccountResponse])
async def get_accounts(
    search: Optional[str] = Query(None, description="Search in name, cnpj, email"),
    industry: Optional[str] = Query(None, description="Filter by industry"),
    owner_id: Optional[int] = Query(None, description="Filter by owner"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all accounts with filters"""
    # Base query - aplicar filtro de ownership
    query = select(Account)
    query = apply_ownership_filter(query, Account, current_user)
    
    # Aplicar filtros adicionais
    filters = []
    
    if search:
        search_filter = or_(
            Account.name.ilike(f"%{search}%"),
            Account.cnpj.ilike(f"%{search}%"),
            Account.email.ilike(f"%{search}%")
        )
        filters.append(search_filter)
    
    if industry:
        filters.append(Account.industry == industry)
    
    if owner_id:
        # Admin pode filtrar por qualquer owner, usuário normal só por si mesmo
        if current_user.role.value == "admin" or owner_id == current_user.id:
            filters.append(Account.owner_id == owner_id)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only filter by your own accounts"
            )
    
    if filters:
        query = query.where(and_(*filters))
    
    # Ordenar por nome
    query = query.order_by(Account.name.asc())
    
    # Aplicar paginação
    query = query.offset(skip).limit(limit)
    
    accounts = session.exec(query).all()
    
    # Adicionar estatísticas de pedidos para cada conta
    accounts_with_stats = []
    for account in accounts:
        orders_count = session.exec(
            select(func.count(Order.id)).where(
                and_(
                    Order.tenant_id == current_user.tenant_id,
                    Order.account_id == account.id
                )
            )
        ).one() or 0
        
        total_orders_value = session.exec(
            select(func.sum(Order.total_amount)).where(
                and_(
                    Order.tenant_id == current_user.tenant_id,
                    Order.account_id == account.id
                )
            )
        ).one() or 0.0
        
        account_dict = account.dict()
        account_dict['orders_count'] = orders_count
        account_dict['total_orders_value'] = float(total_orders_value) if total_orders_value else 0.0
        accounts_with_stats.append(AccountResponse(**account_dict))
    
    return accounts_with_stats


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific account"""
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    require_ownership(account, current_user)
    
    # Contar pedidos e calcular valor total
    orders_count = session.exec(
        select(func.count(Order.id)).where(
            and_(
                Order.tenant_id == current_user.tenant_id,
                Order.account_id == account_id
            )
        )
    ).one() or 0
    
    total_orders_value = session.exec(
        select(func.sum(Order.total_amount)).where(
            and_(
                Order.tenant_id == current_user.tenant_id,
                Order.account_id == account_id
            )
        )
    ).one() or 0.0
    
    # Criar resposta com estatísticas
    account_dict = account.dict()
    account_dict['orders_count'] = orders_count
    account_dict['total_orders_value'] = float(total_orders_value) if total_orders_value else 0.0
    
    return AccountResponse(**account_dict)


@router.get("/{account_id}/orders")
async def get_account_orders(
    account_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all orders for a specific account"""
    from app.routers.orders import order_to_response
    
    # Verificar se a conta existe e pertence ao tenant
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    require_ownership(account, current_user)
    
    # Buscar pedidos da conta
    orders = session.exec(
        select(Order).where(
            and_(
                Order.tenant_id == current_user.tenant_id,
                Order.account_id == account_id
            )
        ).order_by(Order.created_at.desc())
    ).all()
    
    # Converter para response
    orders_response = [order_to_response(order, session) for order in orders]
    
    return orders_response


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    account_data: AccountCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update an account"""
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    require_ownership(account, current_user)
    
    # Verificar se CNPJ mudou e se já existe outro account com esse CNPJ
    if account_data.cnpj and account_data.cnpj != account.cnpj:
        existing = session.exec(
            select(Account).where(
                and_(
                    Account.tenant_id == current_user.tenant_id,
                    Account.cnpj == account_data.cnpj,
                    Account.id != account_id
                )
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account with this CNPJ already exists"
            )
    
    # Atualizar campos
    update_data = account_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(account, key, value)
    
    account.updated_at = datetime.utcnow()
    session.add(account)
    session.commit()
    session.refresh(account)
    
    # Registrar auditoria
    log_update(session, current_user, "Account", account_id)
    
    # Retornar com estatísticas atualizadas
    orders_count = session.exec(
        select(func.count(Order.id)).where(
            and_(
                Order.tenant_id == current_user.tenant_id,
                Order.account_id == account_id
            )
        )
    ).one() or 0
    
    total_orders_value = session.exec(
        select(func.sum(Order.total_amount)).where(
            and_(
                Order.tenant_id == current_user.tenant_id,
                Order.account_id == account_id
            )
        )
    ).one() or 0.0
    
    account_dict = account.dict()
    account_dict['orders_count'] = orders_count
    account_dict['total_orders_value'] = float(total_orders_value) if total_orders_value else 0.0
    
    return AccountResponse(**account_dict)


@router.delete("/{account_id}")
async def delete_account(
    account_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an account"""
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    require_ownership(account, current_user)
    
    session.delete(account)
    session.commit()
    
    # Registrar auditoria
    log_delete(session, current_user, "Account", account_id)
    
    return {"message": "Account deleted successfully"}
