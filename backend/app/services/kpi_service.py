"""Service for KPI tracking - can be called from any router"""
from sqlmodel import Session, select, func, and_, or_
from datetime import datetime
from app.models import (
    Goal, ActivityLog, GoalMetricType, GoalStatus, GoalPeriod,
    Lead, Task, TaskType, TaskStatus, Opportunity, OpportunityStatus,
    Appointment, AppointmentStatus
)


def calculate_period_dates(period: GoalPeriod):
    """Calcula início e fim do período baseado no tipo"""
    from datetime import timedelta
    now = datetime.utcnow()
    
    if period == GoalPeriod.MONTHLY:
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1) - timedelta(days=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1) - timedelta(days=1)
        period_end = period_end.replace(hour=23, minute=59, second=59, microsecond=999999)
    else:  # WEEKLY
        days_since_monday = now.weekday()
        period_start = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=999999)
    
    return period_start, period_end


def calculate_goal_status(goal: Goal) -> GoalStatus:
    """Calcula o status da meta baseado no progresso"""
    if goal.current_value >= goal.target_value:
        return GoalStatus.COMPLETED
    
    from datetime import timedelta
    now = datetime.utcnow()
    total_days = (goal.period_end - goal.period_start).days + 1
    days_elapsed = (now - goal.period_start).days + 1
    
    if days_elapsed <= 0:
        days_elapsed = 1
    if days_elapsed > total_days:
        days_elapsed = total_days
    
    expected_progress = (days_elapsed / total_days) if total_days > 0 else 0
    actual_progress = (goal.current_value / goal.target_value) if goal.target_value > 0 else 0
    
    if actual_progress >= expected_progress * 0.8:
        return GoalStatus.ON_TRACK
    elif actual_progress >= expected_progress * 0.5:
        return GoalStatus.AT_RISK
    else:
        return GoalStatus.AT_RISK if expected_progress > 0.3 else GoalStatus.ON_TRACK


def reset_goal_period_if_needed(goal: Goal) -> Goal:
    """Reseta o período da meta se necessário"""
    now = datetime.utcnow()
    if now > goal.period_end:
        period_start, period_end = calculate_period_dates(goal.period)
        goal.period_start = period_start
        goal.period_end = period_end
        goal.current_value = 0.0
        goal.status = GoalStatus.ON_TRACK
    return goal


def calculate_initial_goal_value(
    session: Session,
    user_id: int,
    tenant_id: int,
    metric_type: GoalMetricType,
    period_start: datetime,
    period_end: datetime
) -> float:
    """
    Calcula o valor inicial de uma meta baseado em atividades já existentes no período.
    Isso garante que KPIs criados no meio do período incluam atividades anteriores.
    """
    if metric_type == GoalMetricType.LEADS_CREATED:
        # Contar leads criados pelo usuário no período
        # Conta leads onde o usuário é o criador (created_by_id) OU o dono (owner_id)
        count = session.exec(
            select(func.count(Lead.id)).where(
                and_(
                    Lead.tenant_id == tenant_id,
                    or_(
                        Lead.created_by_id == user_id,
                        Lead.owner_id == user_id
                    ),
                    Lead.created_at >= period_start,
                    Lead.created_at <= period_end
                )
            )
        ).one()
        return float(count or 0)
    
    elif metric_type == GoalMetricType.TASKS_COMPLETED:
        # Contar tarefas completadas pelo usuário no período
        count = session.exec(
            select(func.count(Task.id)).where(
                and_(
                    Task.tenant_id == tenant_id,
                    Task.owner_id == user_id,
                    Task.status == TaskStatus.COMPLETED,
                    Task.completed_at.isnot(None),
                    Task.completed_at >= period_start,
                    Task.completed_at <= period_end
                )
            )
        ).one()
        return float(count or 0)
    
    elif metric_type == GoalMetricType.REVENUE_GENERATED:
        # Somar receita de oportunidades ganhas pelo usuário no período
        result = session.exec(
            select(func.coalesce(func.sum(Opportunity.amount), 0)).where(
                and_(
                    Opportunity.tenant_id == tenant_id,
                    Opportunity.owner_id == user_id,
                    Opportunity.status == OpportunityStatus.WON,
                    Opportunity.actual_close_date.isnot(None),
                    Opportunity.actual_close_date >= period_start,
                    Opportunity.actual_close_date <= period_end
                )
            )
        ).one()
        return float(result or 0)
    
    elif metric_type == GoalMetricType.CALLS_MADE:
        # Contar chamadas (tarefas do tipo CALL) completadas no período
        count = session.exec(
            select(func.count(Task.id)).where(
                and_(
                    Task.tenant_id == tenant_id,
                    Task.owner_id == user_id,
                    Task.type == TaskType.CALL,
                    Task.status == TaskStatus.COMPLETED,
                    Task.completed_at.isnot(None),
                    Task.completed_at >= period_start,
                    Task.completed_at <= period_end
                )
            )
        ).one()
        return float(count or 0)
    
    elif metric_type == GoalMetricType.MEETINGS_SCHEDULED:
        # Contar reuniões agendadas pelo usuário no período
        count = session.exec(
            select(func.count(Appointment.id)).where(
                and_(
                    Appointment.tenant_id == tenant_id,
                    Appointment.owner_id == user_id,
                    Appointment.status == AppointmentStatus.SCHEDULED,
                    Appointment.scheduled_at >= period_start,
                    Appointment.scheduled_at <= period_end
                )
            )
        ).one()
        return float(count or 0)
    
    elif metric_type == GoalMetricType.MEETINGS_COMPLETED:
        # Contar reuniões completadas pelo usuário no período
        count = session.exec(
            select(func.count(Appointment.id)).where(
                and_(
                    Appointment.tenant_id == tenant_id,
                    Appointment.owner_id == user_id,
                    Appointment.status == AppointmentStatus.COMPLETED,
                    Appointment.completed_at.isnot(None),
                    Appointment.completed_at >= period_start,
                    Appointment.completed_at <= period_end
                )
            )
        ).one()
        return float(count or 0)
    
    return 0.0


def track_kpi_activity(
    session: Session,
    user_id: int,
    tenant_id: int,
    metric_type: GoalMetricType,
    value: float,
    entity_type: str = None,
    entity_id: int = None
) -> list[Goal]:
    """
    Track an activity and update relevant goals.
    Returns list of goals that were just completed.
    """
    # Criar log da atividade
    activity_log = ActivityLog(
        tenant_id=tenant_id,
        user_id=user_id,
        metric_type=metric_type,
        value=value,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    session.add(activity_log)
    
    # Buscar metas ativas do tipo correspondente
    goals = session.exec(
        select(Goal).where(
            Goal.tenant_id == tenant_id,
            Goal.user_id == user_id,
            Goal.metric_type == metric_type
        )
    ).all()
    
    completed_goals = []
    
    for goal in goals:
        # Resetar período se necessário
        goal = reset_goal_period_if_needed(goal)
        
        # Incrementar valor atual
        goal.current_value += value
        goal.updated_at = datetime.utcnow()
        
        # Recalcular status
        old_status = goal.status
        goal.status = calculate_goal_status(goal)
        
        # Se completou a meta, adicionar à lista
        if goal.status == GoalStatus.COMPLETED and old_status != GoalStatus.COMPLETED:
            completed_goals.append(goal)
        
        session.add(goal)
    
    return completed_goals

