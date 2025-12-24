from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, and_, or_, func
from app.database import get_session
from app.models import Account, AccountCreate, AccountResponse, User
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_delete

router = APIRouter()


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
    
    return account


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
    return accounts


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
    return account


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
    acc_dict = account_data.dict()
    for key, value in acc_dict.items():
        if key not in ['owner_id', 'created_by_id', 'tenant_id']:
            old_value = getattr(account, key, None)
            if old_value != value:
                # Registrar mudança de campo
                log_update(session, current_user, "Account", account_id, key, old_value, value)
            setattr(account, key, value)
    
    # Atualizar owner_id se especificado (com validação)
    if acc_dict.get("owner_id") and acc_dict["owner_id"] != account.owner_id:
        if current_user.role.value == "admin":
            old_owner = account.owner_id
            account.owner_id = acc_dict["owner_id"]
            log_update(session, current_user, "Account", account_id, "owner_id", old_owner, acc_dict["owner_id"])
        elif acc_dict["owner_id"] == current_user.id:
            old_owner = account.owner_id
            account.owner_id = acc_dict["owner_id"]
            log_update(session, current_user, "Account", account_id, "owner_id", old_owner, acc_dict["owner_id"])
    
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


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
    
    # Verificar se há contacts associados
    from app.models import Contact
    contacts = session.exec(
        select(Contact).where(
            and_(
                Contact.account_id == account_id,
                Contact.tenant_id == current_user.tenant_id
            )
        )
    ).all()
    
    if contacts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete account with associated contacts. Please delete or reassign contacts first."
        )
    
    # Verificar se há opportunities associadas
    from app.models import Opportunity
    opportunities = session.exec(
        select(Opportunity).where(
            and_(
                Opportunity.account_id == account_id,
                Opportunity.tenant_id == current_user.tenant_id
            )
        )
    ).all()
    
    if opportunities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete account with associated opportunities. Please delete or reassign opportunities first."
        )
    
    # Registrar auditoria antes de deletar
    log_delete(session, current_user, "Account", account_id)
    
    session.delete(account)
    session.commit()
    return {"message": "Account deleted successfully"}

