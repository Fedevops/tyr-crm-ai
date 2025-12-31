"""
Rotas para gerenciamento de notificações
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, func, and_, or_
from typing import List, Optional
from datetime import datetime, timedelta
from app.database import get_session
from app.models import Notification, NotificationResponse, NotificationType, User, Task, Appointment, TenantLimit
from app.dependencies import get_current_active_user
from app.services.token_tracker import get_tokens_usage

router = APIRouter()


def notification_to_response(notification: Notification) -> NotificationResponse:
    """Converte Notification para NotificationResponse"""
    return NotificationResponse(
        id=notification.id,
        tenant_id=notification.tenant_id,
        user_id=notification.user_id,
        type=notification.type.value,
        title=notification.title,
        message=notification.message,
        is_read=notification.is_read,
        action_url=notification.action_url,
        metadata_json=notification.metadata_json,
        created_at=notification.created_at,
        read_at=notification.read_at
    )


@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False, description="Retornar apenas não lidas"),
    limit: int = Query(50, description="Limite de notificações"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Buscar notificações do usuário"""
    query = select(Notification).where(
        and_(
            Notification.tenant_id == current_user.tenant_id,
            Notification.user_id == current_user.id
        )
    )
    
    if unread_only:
        query = query.where(Notification.is_read == False)
    
    query = query.order_by(Notification.created_at.desc()).limit(limit)
    
    notifications = session.exec(query).all()
    return [notification_to_response(n) for n in notifications]


@router.get("/unread-count", response_model=dict)
async def get_unread_count(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Retorna o número de notificações não lidas"""
    count = session.exec(
        select(func.count(Notification.id)).where(
            and_(
                Notification.tenant_id == current_user.tenant_id,
                Notification.user_id == current_user.id,
                Notification.is_read == False
            )
        )
    ).one() or 0
    
    return {"count": count}


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Marcar notificação como lida"""
    notification = session.get(Notification, notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificação não encontrada"
        )
    
    if notification.user_id != current_user.id or notification.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para acessar esta notificação"
        )
    
    notification.is_read = True
    notification.read_at = datetime.utcnow()
    session.add(notification)
    session.commit()
    session.refresh(notification)
    
    return notification_to_response(notification)


@router.patch("/read-all", response_model=dict)
async def mark_all_as_read(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Marcar todas as notificações como lidas"""
    notifications = session.exec(
        select(Notification).where(
            and_(
                Notification.tenant_id == current_user.tenant_id,
                Notification.user_id == current_user.id,
                Notification.is_read == False
            )
        )
    ).all()
    
    updated_count = 0
    for notification in notifications:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        session.add(notification)
        updated_count += 1
    
    session.commit()
    
    return {"message": f"{updated_count} notificação(ões) marcada(s) como lida(s)", "count": updated_count}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Deletar notificação"""
    notification = session.get(Notification, notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificação não encontrada"
        )
    
    if notification.user_id != current_user.id or notification.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para deletar esta notificação"
        )
    
    session.delete(notification)
    session.commit()
    
    return {"message": "Notificação deletada com sucesso"}


@router.post("/generate")
async def generate_notifications(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Gera notificações automaticamente para o usuário atual"""
    from app.services.notification_service import generate_notifications_for_user
    
    count = generate_notifications_for_user(session, current_user)
    
    return {
        "message": f"{count} notificação(ões) gerada(s)",
        "count": count
    }

