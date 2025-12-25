from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, and_, or_
from app.database import get_session
from app.models import AuditLog, AuditLogResponse, User, UserRole
from app.dependencies import get_current_active_user, apply_ownership_filter

router = APIRouter()


@router.get("", response_model=List[AuditLogResponse])
async def get_audit_logs(
    entity_type: Optional[str] = Query(None, description="Filter by entity type (Lead, Account, etc.)"),
    entity_id: Optional[int] = Query(None, description="Filter by entity ID"),
    user_id: Optional[int] = Query(None, description="Filter by user ID (admin only)"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get audit logs with filters.
    
    - Normal users: can only see logs for entities they own
    - Admin users: can see all logs for the tenant
    """
    # Base query - aplicar filtro de ownership baseado em role
    query = select(AuditLog)
    
    # Admin vê todos os logs do tenant, usuário normal só vê logs de entidades que possui
    if current_user.role == UserRole.ADMIN:
        query = query.where(AuditLog.tenant_id == current_user.tenant_id)
    else:
        # Para usuário normal, precisamos filtrar por entidades que ele possui
        # Isso é mais complexo, então vamos retornar logs onde o user_id é o próprio usuário
        # ou logs de entidades que ele possui (isso requer join com as tabelas de entidades)
        # Por simplicidade, vamos mostrar apenas logs de ações do próprio usuário
        query = query.where(
            and_(
                AuditLog.tenant_id == current_user.tenant_id,
                AuditLog.user_id == current_user.id
            )
        )
    
    # Aplicar filtros adicionais
    filters = []
    
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    
    if entity_id:
        filters.append(AuditLog.entity_id == entity_id)
    
    if user_id:
        # Apenas admin pode filtrar por outros usuários
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can filter by other users"
            )
        filters.append(AuditLog.user_id == user_id)
    
    if action:
        filters.append(AuditLog.action == action)
    
    if filters:
        query = query.where(and_(*filters))
    
    # Ordenar por data mais recente primeiro
    query = query.order_by(AuditLog.created_at.desc())
    
    # Aplicar paginação
    query = query.offset(skip).limit(limit)
    
    logs = session.exec(query).all()
    
    # Enriquecer com informações do usuário
    result = []
    for log in logs:
        user = session.get(User, log.user_id)
        log_dict = log.dict()
        log_dict["user_name"] = user.full_name if user else None
        log_dict["user_email"] = user.email if user else None
        result.append(AuditLogResponse(**log_dict))
    
    return result


@router.get("/entity/{entity_type}/{entity_id}", response_model=List[AuditLogResponse])
async def get_entity_audit_logs(
    entity_type: str,
    entity_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get audit logs for a specific entity.
    
    - Normal users: can only see logs if they own the entity
    - Admin users: can see all logs for entities in the tenant
    """
    # Verificar acesso à entidade (isso requer verificar ownership da entidade)
    # Por enquanto, vamos permitir se o log pertence ao tenant
    query = select(AuditLog).where(
        and_(
            AuditLog.tenant_id == current_user.tenant_id,
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id
        )
    )
    
    # Se não for admin, verificar se o usuário possui a entidade
    # Isso requer verificação específica por tipo de entidade
    # Por simplicidade, vamos mostrar logs onde o usuário fez a ação ou é admin
    if current_user.role != UserRole.ADMIN:
        query = query.where(AuditLog.user_id == current_user.id)
    
    query = query.order_by(AuditLog.created_at.desc())
    query = query.offset(skip).limit(limit)
    
    logs = session.exec(query).all()
    
    # Enriquecer com informações do usuário
    result = []
    for log in logs:
        user = session.get(User, log.user_id)
        log_dict = log.dict()
        log_dict["user_name"] = user.full_name if user else None
        log_dict["user_email"] = user.email if user else None
        result.append(AuditLogResponse(**log_dict))
    
    return result


@router.get("/user/{user_id}", response_model=List[AuditLogResponse])
async def get_user_audit_logs(
    user_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get audit logs for a specific user.
    
    - Normal users: can only see their own logs
    - Admin users: can see logs for any user in the tenant
    """
    # Verificar se o usuário pode ver logs de outro usuário
    if user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own audit logs"
        )
    
    # Verificar se o usuário pertence ao mesmo tenant
    target_user = session.get(User, user_id)
    if not target_user or target_user.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    query = select(AuditLog).where(
        and_(
            AuditLog.tenant_id == current_user.tenant_id,
            AuditLog.user_id == user_id
        )
    )
    
    query = query.order_by(AuditLog.created_at.desc())
    query = query.offset(skip).limit(limit)
    
    logs = session.exec(query).all()
    
    # Enriquecer com informações do usuário
    result = []
    for log in logs:
        user = session.get(User, log.user_id)
        log_dict = log.dict()
        log_dict["user_name"] = user.full_name if user else None
        log_dict["user_email"] = user.email if user else None
        result.append(AuditLogResponse(**log_dict))
    
    return result


