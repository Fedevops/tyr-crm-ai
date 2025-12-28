from fastapi import Depends, HTTPException, status, Request
from typing import Optional, TypeVar, Type
from sqlmodel import Session, select, SQLModel, func, and_
from app.database import get_session
from app.models import User, UserRole, TenantLimit, Lead, Item, PlanLimitDefaults, PlanType
from app.auth import decode_access_token

T = TypeVar('T', bound=SQLModel)


def get_current_user(
    request: Request,
    session: Session = Depends(get_session)
) -> User:
    """Get current authenticated user from JWT token"""
    import logging
    logger = logging.getLogger(__name__)
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Ler o header Authorization diretamente do request
    authorization = request.headers.get("Authorization") or request.headers.get("authorization")
    
    # Debug: listar todos os headers
    logger.info(f"Request headers: {dict(request.headers)}")
    logger.info(f"Authorization header: {authorization}")
    
    if not authorization:
        logger.error("No Authorization header provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extrair o token do header "Bearer <token>"
    try:
        scheme, token = authorization.split(maxsplit=1)
        if scheme.lower() != "bearer":
            logger.error(f"Invalid authorization scheme: {scheme}")
            raise credentials_exception
    except ValueError:
        logger.error("Invalid Authorization header format")
        raise credentials_exception
    
    if not token:
        logger.error("No token provided in Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"Validating token: {token[:20] if len(token) > 20 else token}...")
    
    payload = decode_access_token(token)
    if payload is None:
        logger.error("Token decode failed - invalid token or signature")
        raise credentials_exception
    
    user_id_str = payload.get("sub")
    if user_id_str is None:
        logger.error("No user_id in token payload")
        raise credentials_exception
    
    # Converter user_id de string para int (já que JWT requer string)
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        logger.error(f"Invalid user_id format in token: {user_id_str}")
        raise credentials_exception
    
    logger.info(f"Token valid, user_id: {user_id}")
    
    user = session.get(User, user_id)
    if user is None:
        logger.error(f"User {user_id} not found in database")
        raise credentials_exception
    
    if not user.is_active:
        logger.warning(f"User {user_id} is inactive")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    logger.info(f"User authenticated: {user.email}")
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    return current_user


def apply_ownership_filter(
    query,
    model_class: Type[T],
    current_user: User,
    tenant_field: str = "tenant_id",
    owner_field: str = "owner_id"
):
    """
    Aplica filtro de ownership baseado no role do usuário.
    
    - Usuários ADMIN: veem todos os registros do tenant (incluindo os sem owner_id)
    - Usuários normais (SDR, MANAGER): só veem registros onde owner_id == current_user.id
    
    Args:
        query: Query SQLModel/SQLAlchemy
        model_class: Classe do modelo (Lead, Task, Account, etc.)
        current_user: Usuário atual
        tenant_field: Nome do campo tenant_id no modelo
        owner_field: Nome do campo owner_id no modelo
    
    Returns:
        Query filtrada
    """
    from sqlmodel import and_, or_
    
    # Sempre filtrar por tenant
    tenant_filter = getattr(model_class, tenant_field) == current_user.tenant_id
    
    # Se for admin, só filtrar por tenant (vê TUDO do tenant, incluindo sem owner)
    if current_user.role == UserRole.ADMIN:
        return query.where(tenant_filter)
    
    # Se não for admin, filtrar por tenant E (owner_id == current_user.id OU owner_id IS NULL)
    # Isso permite que usuários normais vejam leads sem dono atribuído
    owner_field_attr = getattr(model_class, owner_field)
    owner_filter = or_(
        owner_field_attr == current_user.id,
        owner_field_attr.is_(None)  # Leads sem dono também aparecem para usuários normais
    )
    return query.where(and_(tenant_filter, owner_filter))


def check_ownership(
    entity: T,
    current_user: User,
    owner_field: str = "owner_id",
    tenant_field: str = "tenant_id"
) -> bool:
    """
    Verifica se o usuário tem acesso ao registro.
    
    - Usuários ADMIN: têm acesso se o registro pertence ao mesmo tenant
    - Usuários normais: têm acesso se são owners do registro
    
    Args:
        entity: Entidade a verificar
        current_user: Usuário atual
        owner_field: Nome do campo owner_id no modelo
        tenant_field: Nome do campo tenant_id no modelo
    
    Returns:
        True se o usuário tem acesso, False caso contrário
    """
    # Verificar tenant primeiro
    entity_tenant_id = getattr(entity, tenant_field, None)
    if entity_tenant_id != current_user.tenant_id:
        return False
    
    # Admin tem acesso a todos os registros do tenant (incluindo os sem owner_id)
    if current_user.role == UserRole.ADMIN:
        return True
    
    # Usuário normal tem acesso se for owner OU se o registro não tiver owner (sem dono)
    entity_owner_id = getattr(entity, owner_field, None)
    return entity_owner_id == current_user.id or entity_owner_id is None


def ensure_ownership(
    entity_data: dict,
    current_user: User,
    owner_field: str = "owner_id",
    created_by_field: str = "created_by_id"
) -> dict:
    """
    Garante que owner_id e created_by_id sejam preenchidos.
    
    - Se owner_id não for especificado, usa current_user.id
    - created_by_id sempre é preenchido com current_user.id
    
    Args:
        entity_data: Dicionário com dados da entidade
        current_user: Usuário atual
        owner_field: Nome do campo owner_id
        created_by_field: Nome do campo created_by_id
    
    Returns:
        Dicionário com owner_id e created_by_id preenchidos
    """
    # Se owner_id não foi especificado, usar current_user.id
    if entity_data.get(owner_field) is None:
        entity_data[owner_field] = current_user.id
    
    # created_by_id sempre é o usuário atual
    entity_data[created_by_field] = current_user.id
    
    return entity_data


def require_ownership(
    entity: T,
    current_user: User,
    owner_field: str = "owner_id",
    tenant_field: str = "tenant_id"
):
    """
    Valida se o usuário tem acesso ao registro. Lança exceção se não tiver.
    
    Args:
        entity: Entidade a verificar
        current_user: Usuário atual
        owner_field: Nome do campo owner_id no modelo
        tenant_field: Nome do campo tenant_id no modelo
    
    Raises:
        HTTPException 404 se o registro não existir ou o usuário não tiver acesso
    """
    if not check_ownership(entity, current_user, owner_field, tenant_field):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found or access denied"
        )


async def check_limit(
    metric: str,  # "leads", "users", "items"
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
) -> None:
    """Check if tenant has reached the limit for a specific metric"""
    tenant_id = current_user.tenant_id
    
    # Buscar limites do tenant
    tenant_limit = session.exec(
        select(TenantLimit).where(TenantLimit.tenant_id == tenant_id)
    ).first()
    
    # Se não existir, criar com valores padrão do plan_type
    if not tenant_limit:
        from app.models import PlanType, PlanLimitDefaults
        
        plan_type = PlanType.STARTER
        # Buscar limites padrão do plan_type
        plan_limits = session.exec(
            select(PlanLimitDefaults).where(PlanLimitDefaults.plan_type == plan_type)
        ).first()
        
        if not plan_limits:
            # Criar limites padrão se não existirem
            defaults = {
                PlanType.STARTER: {
                    "max_leads": 100,
                    "max_users": 3,
                    "max_items": 50,
                    "max_api_calls": 1000
                },
                PlanType.PROFESSIONAL: {
                    "max_leads": 1000,
                    "max_users": 10,
                    "max_items": 500,
                    "max_api_calls": 10000
                },
                PlanType.ENTERPRISE: {
                    "max_leads": -1,
                    "max_users": -1,
                    "max_items": -1,
                    "max_api_calls": -1
                }
            }
            plan_limits = PlanLimitDefaults(
                plan_type=plan_type,
                **defaults.get(plan_type, defaults[PlanType.STARTER])
            )
            session.add(plan_limits)
            session.commit()
            session.refresh(plan_limits)
        
        tenant_limit = TenantLimit(
            tenant_id=tenant_id,
            plan_type=plan_type,
            max_leads=plan_limits.max_leads,
            max_users=plan_limits.max_users,
            max_items=plan_limits.max_items,
            max_api_calls=plan_limits.max_api_calls
        )
        session.add(tenant_limit)
        session.commit()
        session.refresh(tenant_limit)
    
    # Determinar limite e contagem atual baseado na métrica
    max_limit = None
    current_count = 0
    
    if metric == "leads":
        max_limit = tenant_limit.max_leads
        current_count = session.exec(
            select(func.count(Lead.id)).where(Lead.tenant_id == tenant_id)
        ).one() or 0
    elif metric == "users":
        max_limit = tenant_limit.max_users
        current_count = session.exec(
            select(func.count(User.id)).where(
                and_(
                    User.tenant_id == tenant_id,
                    User.is_active == True
                )
            )
        ).one() or 0
    elif metric == "items":
        max_limit = tenant_limit.max_items
        current_count = session.exec(
            select(func.count(Item.id)).where(Item.tenant_id == tenant_id)
        ).one() or 0
    else:
        raise ValueError(f"Unknown metric: {metric}")
    
    # Verificar se limite foi atingido (-1 significa ilimitado)
    if max_limit != -1 and current_count >= max_limit:
        metric_names = {
            "leads": "leads",
            "users": "usuários",
            "items": "itens"
        }
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Limite de {metric_names.get(metric, metric)} atingido ({current_count}/{max_limit}). Faça upgrade ou compre um add-on."
        )

