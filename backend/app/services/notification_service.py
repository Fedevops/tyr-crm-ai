"""
Serviço para gerar notificações automaticamente
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlmodel import Session, select, func, and_, or_
from sqlalchemy import cast, String
from app.models import (
    Notification, NotificationType, User, Task, TaskStatus,
    Appointment, AppointmentStatus, TenantLimit
)
from app.services.token_tracker import get_tokens_usage

logger = logging.getLogger(__name__)


def create_notification(
    session: Session,
    user_id: int,
    tenant_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    action_url: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None
) -> Notification:
    """Cria uma notificação"""
    notification = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        action_url=action_url,
        metadata_json=metadata_json
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification


def check_and_create_task_notifications(session: Session, user: User) -> int:
    """Verifica tarefas a vencer hoje e cria notificações"""
    today = datetime.utcnow().date()
    tomorrow = today + timedelta(days=1)
    
    # Tarefas a vencer hoje
    tasks_due_today = session.exec(
        select(Task).where(
            and_(
                Task.tenant_id == user.tenant_id,
                Task.owner_id == user.id,
                Task.status != TaskStatus.COMPLETED,
                func.date(Task.due_date) == today
            )
        )
    ).all()
    
    # Tarefas vencidas
    tasks_overdue = session.exec(
        select(Task).where(
            and_(
                Task.tenant_id == user.tenant_id,
                Task.owner_id == user.id,
                Task.status != TaskStatus.COMPLETED,
                func.date(Task.due_date) < today
            )
        )
    ).all()
    
    created_count = 0
    
    # Verificar se já existe notificação para cada tarefa
    for task in tasks_due_today:
        # Verificar se já existe notificação não lida para esta tarefa hoje
        existing = session.exec(
            select(Notification).where(
                and_(
                    Notification.user_id == user.id,
                    Notification.type == NotificationType.TASK_DUE_TODAY,
                    Notification.is_read == False,
                    cast(Notification.metadata_json['task_id'], String) == str(task.id),
                    func.date(Notification.created_at) == today
                )
            )
        ).first()
        
        if not existing:
            create_notification(
                session=session,
                user_id=user.id,
                tenant_id=user.tenant_id,
                notification_type=NotificationType.TASK_DUE_TODAY,
                title=f"Tarefa vence hoje: {task.title}",
                message=f"A tarefa '{task.title}' vence hoje.",
                action_url=f"/tasks/{task.id}",
                metadata_json={"task_id": task.id, "due_date": task.due_date.isoformat() if task.due_date else None}
            )
            created_count += 1
    
    for task in tasks_overdue:
        # Verificar se já existe notificação não lida para esta tarefa
        existing = session.exec(
            select(Notification).where(
                and_(
                    Notification.user_id == user.id,
                    Notification.type == NotificationType.TASK_OVERDUE,
                    Notification.is_read == False,
                    cast(Notification.metadata['task_id'], String) == str(task.id)
                )
            )
        ).first()
        
        if not existing:
            days_overdue = (today - task.due_date.date()).days if task.due_date else 0
            create_notification(
                session=session,
                user_id=user.id,
                tenant_id=user.tenant_id,
                notification_type=NotificationType.TASK_OVERDUE,
                title=f"Tarefa vencida: {task.title}",
                message=f"A tarefa '{task.title}' está {days_overdue} dia(s) vencida.",
                action_url=f"/tasks/{task.id}",
                metadata_json={"task_id": task.id, "days_overdue": days_overdue}
            )
            created_count += 1
    
    return created_count


def check_and_create_appointment_notifications(session: Session, user: User) -> int:
    """Verifica agendamentos e cria notificações"""
    today = datetime.utcnow().date()
    now = datetime.utcnow()
    
    # Agendamentos hoje - buscar por owner_id ou created_by_id do Appointment
    appointments_today = session.exec(
        select(Appointment).where(
            and_(
                Appointment.tenant_id == user.tenant_id,
                Appointment.status == AppointmentStatus.SCHEDULED,
                func.date(Appointment.scheduled_at) == today,
                or_(
                    Appointment.owner_id == user.id,
                    Appointment.created_by_id == user.id
                )
            )
        )
    ).all()
    
    # Agendamentos próximos (próximas 2 horas)
    two_hours_from_now = now + timedelta(hours=2)
    appointments_upcoming = session.exec(
        select(Appointment).where(
            and_(
                Appointment.tenant_id == user.tenant_id,
                Appointment.status == AppointmentStatus.SCHEDULED,
                Appointment.scheduled_at > now,
                Appointment.scheduled_at <= two_hours_from_now,
                or_(
                    Appointment.owner_id == user.id,
                    Appointment.created_by_id == user.id
                )
            )
        )
    ).all()
    
    created_count = 0
    
    for appointment in appointments_today:
        existing = session.exec(
            select(Notification).where(
                and_(
                    Notification.user_id == user.id,
                    Notification.type == NotificationType.APPOINTMENT_TODAY,
                    Notification.is_read == False,
                    cast(Notification.metadata_json['appointment_id'], String) == str(appointment.id),
                    func.date(Notification.created_at) == today
                )
            )
        ).first()
        
        if not existing:
            # Buscar lead associado
            lead = session.get(Lead, appointment.lead_id)
            lead_name = lead.name if lead else "Lead"
            create_notification(
                session=session,
                user_id=user.id,
                tenant_id=user.tenant_id,
                notification_type=NotificationType.APPOINTMENT_TODAY,
                title=f"Agendamento hoje: {lead_name}",
                message=f"Você tem um agendamento com {lead_name} hoje às {appointment.scheduled_at.strftime('%H:%M')}.",
                action_url=f"/appointments/{appointment.id}",
                metadata_json={"appointment_id": appointment.id, "start_time": appointment.scheduled_at.isoformat()}
            )
            created_count += 1
    
    for appointment in appointments_upcoming:
        existing = session.exec(
            select(Notification).where(
                and_(
                    Notification.user_id == user.id,
                    Notification.type == NotificationType.APPOINTMENT_UPCOMING,
                    Notification.is_read == False,
                    cast(Notification.metadata['appointment_id'], String) == str(appointment.id)
                )
            )
        ).first()
        
        if not existing:
            # Buscar lead associado
            lead = session.get(Lead, appointment.lead_id)
            lead_name = lead.name if lead else "Lead"
            minutes_until = int((appointment.scheduled_at - now).total_seconds() / 60)
            create_notification(
                session=session,
                user_id=user.id,
                tenant_id=user.tenant_id,
                notification_type=NotificationType.APPOINTMENT_UPCOMING,
                title=f"Agendamento em breve: {lead_name}",
                message=f"Você tem um agendamento com {lead_name} em {minutes_until} minutos.",
                action_url=f"/appointments/{appointment.id}",
                metadata_json={"appointment_id": appointment.id, "minutes_until": minutes_until}
            )
            created_count += 1
    
    return created_count


def check_and_create_limit_notifications(session: Session, user: User) -> int:
    """Verifica limites de uso e cria notificações"""
    tenant_limit = session.exec(
        select(TenantLimit).where(TenantLimit.tenant_id == user.tenant_id)
    ).first()
    
    if not tenant_limit:
        return 0
    
    created_count = 0
    today = datetime.utcnow().date()
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Verificar tokens
    if hasattr(tenant_limit, 'max_tokens') and tenant_limit.max_tokens > 0:
        tokens_used = get_tokens_usage(session, user.tenant_id, month_start)
        tokens_percentage = (tokens_used / tenant_limit.max_tokens * 100) if tenant_limit.max_tokens > 0 else 0
        
        # Verificar se já existe notificação hoje
        existing = session.exec(
            select(Notification).where(
                and_(
                    Notification.user_id == user.id,
                    Notification.type.in_([NotificationType.LIMIT_WARNING, NotificationType.LIMIT_EXCEEDED]),
                    cast(Notification.metadata_json['metric'], String) == "tokens",
                    func.date(Notification.created_at) == today
                )
            )
        ).first()
        
        if not existing:
            if tokens_percentage >= 100:
                create_notification(
                    session=session,
                    user_id=user.id,
                    tenant_id=user.tenant_id,
                    notification_type=NotificationType.LIMIT_EXCEEDED,
                    title="Limite de tokens excedido",
                    message=f"Você excedeu o limite de tokens LLM ({tokens_used:,} de {tenant_limit.max_tokens:,}).",
                    action_url="/settings/usage",
                    metadata_json={"metric": "tokens", "current": tokens_used, "max": tenant_limit.max_tokens, "percentage": tokens_percentage}
                )
                created_count += 1
            elif tokens_percentage >= 80:
                create_notification(
                    session=session,
                    user_id=user.id,
                    tenant_id=user.tenant_id,
                    notification_type=NotificationType.LIMIT_WARNING,
                    title="Atenção: Limite de tokens próximo",
                    message=f"Você está usando {tokens_percentage:.1f}% do seu limite de tokens ({tokens_used:,} de {tenant_limit.max_tokens:,}).",
                    action_url="/settings/usage",
                    metadata_json={"metric": "tokens", "current": tokens_used, "max": tenant_limit.max_tokens, "percentage": tokens_percentage}
                )
                created_count += 1
    
    # Verificar outros limites (leads, users, items, api_calls)
    limits_to_check = [
        ("leads", tenant_limit.max_leads, "Leads"),
        ("users", tenant_limit.max_users, "Usuários"),
        ("items", tenant_limit.max_items, "Itens"),
        ("api_calls", tenant_limit.max_api_calls, "Chamadas de API")
    ]
    
    for metric_key, max_limit, metric_label in limits_to_check:
        if max_limit <= 0:  # Ilimitado
            continue
        
        # Calcular uso atual
        from app.models import Lead, Item, ApiCallLog
        from sqlmodel import select, func, and_
        
        if metric_key == "leads":
            current = session.exec(
                select(func.count(Lead.id)).where(Lead.tenant_id == user.tenant_id)
            ).one() or 0
        elif metric_key == "items":
            current = session.exec(
                select(func.count(Item.id)).where(Item.tenant_id == user.tenant_id)
            ).one() or 0
        elif metric_key == "api_calls":
            current = session.exec(
                select(func.count(ApiCallLog.id)).where(
                    and_(
                        ApiCallLog.tenant_id == user.tenant_id,
                        ApiCallLog.created_at >= month_start
                    )
                )
            ).one() or 0
        elif metric_key == "users":
            from app.models import User as UserModel
            current = session.exec(
                select(func.count(UserModel.id)).where(
                    and_(
                        UserModel.tenant_id == user.tenant_id,
                        UserModel.is_active == True
                    )
                )
            ).one() or 0
        else:
            continue
        
        percentage = (current / max_limit * 100) if max_limit > 0 else 0
        
        # Verificar se já existe notificação hoje
        existing = session.exec(
            select(Notification).where(
                and_(
                    Notification.user_id == user.id,
                    Notification.type.in_([NotificationType.LIMIT_WARNING, NotificationType.LIMIT_EXCEEDED]),
                    cast(Notification.metadata_json['metric'], String) == metric_key,
                    func.date(Notification.created_at) == today
                )
            )
        ).first()
        
        if not existing:
            if percentage >= 100:
                create_notification(
                    session=session,
                    user_id=user.id,
                    tenant_id=user.tenant_id,
                    notification_type=NotificationType.LIMIT_EXCEEDED,
                    title=f"Limite de {metric_label} excedido",
                    message=f"Você excedeu o limite de {metric_label.lower()} ({current:,} de {max_limit:,}).",
                    action_url="/settings/usage",
                    metadata_json={"metric": metric_key, "current": current, "max": max_limit, "percentage": percentage}
                )
                created_count += 1
            elif percentage >= 80:
                create_notification(
                    session=session,
                    user_id=user.id,
                    tenant_id=user.tenant_id,
                    notification_type=NotificationType.LIMIT_WARNING,
                    title=f"Atenção: Limite de {metric_label} próximo",
                    message=f"Você está usando {percentage:.1f}% do seu limite de {metric_label.lower()} ({current:,} de {max_limit:,}).",
                    action_url="/settings/usage",
                    metadata_json={"metric": metric_key, "current": current, "max": max_limit, "percentage": percentage}
                )
                created_count += 1
    
    return created_count


def generate_notifications_for_user(session: Session, user: User) -> int:
    """Gera todas as notificações para um usuário"""
    total_created = 0
    
    try:
        total_created += check_and_create_task_notifications(session, user)
        total_created += check_and_create_appointment_notifications(session, user)
        total_created += check_and_create_limit_notifications(session, user)
        
        if total_created > 0:
            logger.info(f"✅ Criadas {total_created} notificações para usuário {user.id}")
    except Exception as e:
        logger.error(f"❌ Erro ao gerar notificações para usuário {user.id}: {e}")
    
    return total_created

