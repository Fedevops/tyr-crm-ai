from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func, and_, or_
from typing import List, Dict
from datetime import datetime
from app.database import get_session
from app.models import (
    Goal, GoalCreate, GoalUpdate, GoalResponse,
    ActivityLog, ActivityLogResponse,
    TrackActivityRequest,
    GoalMetricType, GoalPeriod, GoalStatus,
    User, Lead
)
from app.dependencies import get_current_active_user
from app.services.kpi_service import (
    calculate_period_dates,
    calculate_goal_status,
    reset_goal_period_if_needed,
    calculate_initial_goal_value,
    calculate_daily_target,
)

router = APIRouter()




@router.get("/goals", response_model=List[GoalResponse])
async def get_goals(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all goals for the current user"""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[KPI] Buscando goals para user_id={current_user.id}, tenant_id={current_user.tenant_id}, email={current_user.email}")
    
    # Debug: verificar todos os goals do tenant
    all_tenant_goals = session.exec(
        select(Goal).where(
            Goal.tenant_id == current_user.tenant_id
        )
    ).all()
    
    logger.info(f"[KPI] Total de goals no tenant {current_user.tenant_id}: {len(all_tenant_goals)}")
    logger.info(f"[KPI] User ID atual: {current_user.id}, Email: {current_user.email}")
    
    for g in all_tenant_goals:
        logger.info(f"[KPI] Goal ID {g.id}: user_id={g.user_id}, title={g.title}, metric_type={g.metric_type.value}")
    
    # Usar and_() para garantir que a query está correta
    goals = session.exec(
        select(Goal).where(
            and_(
                Goal.tenant_id == current_user.tenant_id,
                Goal.user_id == current_user.id
            )
        )
    ).all()
    
    logger.info(f"[KPI] Goals encontrados para user_id {current_user.id}: {len(goals)}")
    
    if len(goals) == 0 and len(all_tenant_goals) > 0:
        logger.warning(f"[KPI] ATENÇÃO: Existem {len(all_tenant_goals)} goals no tenant, mas nenhum para o user_id {current_user.id}")
        logger.warning(f"[KPI] Isso pode indicar que os goals foram criados com um user_id diferente")
        # Listar os user_ids dos goals existentes
        user_ids_in_goals = {g.user_id for g in all_tenant_goals}
        logger.warning(f"[KPI] User IDs encontrados nos goals: {user_ids_in_goals}")
    
    # Resetar períodos se necessário e recalcular status
    updated_goals = []
    for goal in goals:
        goal = reset_goal_period_if_needed(goal)
        goal.status = calculate_goal_status(goal)
        session.add(goal)
        updated_goals.append(goal)
    
    session.commit()
    
    # Criar lista de respostas com meta diária calculada
    response_list = []
    for goal in updated_goals:
        daily_target = calculate_daily_target(goal)
        response_list.append(
            GoalResponse(
                id=goal.id,
                tenant_id=goal.tenant_id,
                user_id=goal.user_id,
                title=goal.title,
                metric_type=goal.metric_type.value,
                target_value=goal.target_value,
                current_value=goal.current_value,
                period=goal.period.value,
                status=goal.status.value,
                is_visible_on_wallboard=goal.is_visible_on_wallboard,
                period_start=goal.period_start,
                period_end=goal.period_end,
                due_date=goal.due_date,
                daily_target=daily_target,
                created_at=goal.created_at,
                updated_at=goal.updated_at,
            )
        )
    
    logger.info(f"[KPI] Retornando {len(response_list)} goals para o frontend")
    
    return response_list


@router.post("/goals", response_model=GoalResponse)
async def create_goal(
    goal_data: GoalCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new goal"""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[KPI CREATE] Criando goal para user_id={current_user.id}, tenant_id={current_user.tenant_id}, email={current_user.email}")
    logger.info(f"[KPI CREATE] Dados do goal: title={goal_data.title}, metric_type={goal_data.metric_type.value}, target_value={goal_data.target_value}")
    
    period_start, period_end = calculate_period_dates(goal_data.period)
    
    # Calcular valor inicial baseado em atividades já existentes no período
    initial_value = calculate_initial_goal_value(
        session=session,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        metric_type=goal_data.metric_type,
        period_start=period_start,
        period_end=period_end
    )
    
    logger.info(f"[KPI CREATE] Valor inicial calculado: {initial_value}")
    
    goal = Goal(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        title=goal_data.title,
        metric_type=goal_data.metric_type,
        target_value=goal_data.target_value,
        current_value=initial_value,
        period=goal_data.period,
        status=GoalStatus.ON_TRACK,
        is_visible_on_wallboard=goal_data.is_visible_on_wallboard,
        period_start=period_start,
        period_end=period_end,
        due_date=goal_data.due_date,
    )
    
    # Recalcular status com o valor inicial
    goal.status = calculate_goal_status(goal)
    
    logger.info(f"[KPI CREATE] Goal criado: id={goal.id}, user_id={goal.user_id}, tenant_id={goal.tenant_id}, status={goal.status.value}")
    
    session.add(goal)
    session.commit()
    session.refresh(goal)
    
    logger.info(f"[KPI CREATE] Goal salvo no banco: id={goal.id}")
    
    daily_target = calculate_daily_target(goal)
    response = GoalResponse(
        id=goal.id,
        tenant_id=goal.tenant_id,
        user_id=goal.user_id,
        title=goal.title,
        metric_type=goal.metric_type.value,
        target_value=goal.target_value,
        current_value=goal.current_value,
        period=goal.period.value,
        status=goal.status.value,
        is_visible_on_wallboard=goal.is_visible_on_wallboard,
        period_start=goal.period_start,
        period_end=goal.period_end,
        due_date=goal.due_date,
        daily_target=daily_target,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )
    
    logger.info(f"[KPI CREATE] Retornando resposta para o frontend: id={response.id}, user_id={response.user_id}")
    
    return response


@router.put("/goals/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: int,
    goal_data: GoalUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a goal"""
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    if goal.tenant_id != current_user.tenant_id or goal.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this goal"
        )
    
    # Atualizar campos
    if goal_data.title is not None:
        goal.title = goal_data.title
    if goal_data.target_value is not None:
        goal.target_value = goal_data.target_value
    if goal_data.period is not None:
        goal.period = goal_data.period
        period_start, period_end = calculate_period_dates(goal_data.period)
        goal.period_start = period_start
        goal.period_end = period_end
        goal.current_value = 0.0  # Reset ao mudar período
    if goal_data.is_visible_on_wallboard is not None:
        goal.is_visible_on_wallboard = goal_data.is_visible_on_wallboard
    if goal_data.due_date is not None:
        goal.due_date = goal_data.due_date
    
    goal.status = calculate_goal_status(goal)
    goal.updated_at = datetime.utcnow()
    
    session.add(goal)
    session.commit()
    session.refresh(goal)
    
    daily_target = calculate_daily_target(goal)
    return GoalResponse(
        id=goal.id,
        tenant_id=goal.tenant_id,
        user_id=goal.user_id,
        title=goal.title,
        metric_type=goal.metric_type.value,
        target_value=goal.target_value,
        current_value=goal.current_value,
        period=goal.period.value,
        status=goal.status.value,
        is_visible_on_wallboard=goal.is_visible_on_wallboard,
        period_start=goal.period_start,
        period_end=goal.period_end,
        due_date=goal.due_date,
        daily_target=daily_target,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )


@router.delete("/goals/{goal_id}")
async def delete_goal(
    goal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a goal"""
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    if goal.tenant_id != current_user.tenant_id or goal.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this goal"
        )
    
    session.delete(goal)
    session.commit()
    
    return {"message": "Goal deleted successfully"}


@router.post("/track")
async def track_activity(
    activity_data: TrackActivityRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Track an activity and update relevant goals"""
    from app.services.kpi_service import track_kpi_activity
    
    # Buscar quantas metas serão atualizadas
    goals_count = session.exec(
        select(Goal).where(
            Goal.tenant_id == current_user.tenant_id,
            Goal.user_id == current_user.id,
            Goal.metric_type == activity_data.metric_type
        )
    ).all()
    goals_updated_count = len(goals_count)
    
    # Usar função do service
    completed_goals = track_kpi_activity(
        session=session,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        metric_type=activity_data.metric_type,
        value=activity_data.value,
        entity_type=activity_data.entity_type,
        entity_id=activity_data.entity_id,
    )
    
    session.commit()
    
    return {
        "message": "Activity tracked successfully",
        "goals_updated": goals_updated_count,
        "completed_goals": [
            {
                "id": goal.id,
                "title": goal.title,
            }
            for goal in completed_goals
        ]
    }


@router.get("/stats", response_model=Dict)
async def get_kpi_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get aggregated KPI statistics for dashboard"""
    goals = session.exec(
        select(Goal).where(
            Goal.tenant_id == current_user.tenant_id,
            Goal.user_id == current_user.id
        )
    ).all()
    
    # Resetar períodos e recalcular status
    for goal in goals:
        goal = reset_goal_period_if_needed(goal)
        goal.status = calculate_goal_status(goal)
        session.add(goal)
    session.commit()
    
    # Agregar estatísticas
    total_goals = len(goals)
    completed_goals = sum(1 for g in goals if g.status == GoalStatus.COMPLETED)
    on_track_goals = sum(1 for g in goals if g.status == GoalStatus.ON_TRACK)
    at_risk_goals = sum(1 for g in goals if g.status == GoalStatus.AT_RISK)
    
    # Top 3 metas por progresso
    top_goals = sorted(
        goals,
        key=lambda g: (g.current_value / g.target_value) if g.target_value > 0 else 0,
        reverse=True
    )[:3]
    
    return {
        "total_goals": total_goals,
        "completed_goals": completed_goals,
        "on_track_goals": on_track_goals,
        "at_risk_goals": at_risk_goals,
        "top_goals": [
            {
                "id": goal.id,
                "title": goal.title,
                "progress": (goal.current_value / goal.target_value * 100) if goal.target_value > 0 else 0,
                "status": goal.status.value,
            }
            for goal in top_goals
        ]
    }


@router.get("/debug/goals")
async def debug_goals(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Debug endpoint to check all goals in the database"""
    # Buscar todos os goals do tenant
    all_goals = session.exec(
        select(Goal).where(
            Goal.tenant_id == current_user.tenant_id
        )
    ).all()
    
    # Buscar goals do usuário atual
    user_goals = session.exec(
        select(Goal).where(
            Goal.tenant_id == current_user.tenant_id,
            Goal.user_id == current_user.id
        )
    ).all()
    
    return {
        "current_user_id": current_user.id,
        "current_user_email": current_user.email,
        "tenant_id": current_user.tenant_id,
        "total_goals_in_tenant": len(all_goals),
        "user_goals_count": len(user_goals),
        "all_goals": [
            {
                "id": g.id,
                "title": g.title,
                "user_id": g.user_id,
                "metric_type": g.metric_type.value,
                "created_at": g.created_at.isoformat(),
            }
            for g in all_goals
        ],
        "user_goals": [
            {
                "id": g.id,
                "title": g.title,
                "metric_type": g.metric_type.value,
                "created_at": g.created_at.isoformat(),
            }
            for g in user_goals
        ]
    }


@router.get("/debug/leads-count")
async def debug_leads_count(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Debug endpoint para verificar contagem de leads para KPI"""
    period_start, period_end = calculate_period_dates(GoalPeriod.MONTHLY)
    
    # Total de leads no tenant no período
    total_leads = session.exec(
        select(func.count(Lead.id)).where(
            and_(
                Lead.tenant_id == current_user.tenant_id,
                Lead.created_at >= period_start,
                Lead.created_at <= period_end
            )
        )
    ).one()
    
    # Leads com created_by_id == user_id
    leads_by_created = session.exec(
        select(func.count(Lead.id)).where(
            and_(
                Lead.tenant_id == current_user.tenant_id,
                Lead.created_by_id == current_user.id,
                Lead.created_at >= period_start,
                Lead.created_at <= period_end
            )
        )
    ).one()
    
    # Leads com owner_id == user_id
    leads_by_owner = session.exec(
        select(func.count(Lead.id)).where(
            and_(
                Lead.tenant_id == current_user.tenant_id,
                Lead.owner_id == current_user.id,
                Lead.created_at >= period_start,
                Lead.created_at <= period_end
            )
        )
    ).one()
    
    # Leads que serão contados pela query atual (created_by_id OU owner_id)
    leads_counted = session.exec(
        select(func.count(Lead.id)).where(
            and_(
                Lead.tenant_id == current_user.tenant_id,
                or_(
                    Lead.created_by_id == current_user.id,
                    Lead.owner_id == current_user.id
                ),
                Lead.created_at >= period_start,
                Lead.created_at <= period_end
            )
        )
    ).one()
    
    # Leads sem created_by_id nem owner_id
    leads_without_ownership = session.exec(
        select(func.count(Lead.id)).where(
            and_(
                Lead.tenant_id == current_user.tenant_id,
                Lead.created_by_id.is_(None),
                Lead.owner_id.is_(None),
                Lead.created_at >= period_start,
                Lead.created_at <= period_end
            )
        )
    ).one()
    
    # Valor calculado pela função
    calculated_value = calculate_initial_goal_value(
        session=session,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        metric_type=GoalMetricType.LEADS_CREATED,
        period_start=period_start,
        period_end=period_end
    )
    
    return {
        "user_id": current_user.id,
        "user_email": current_user.email,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_leads_in_period": total_leads,
        "leads_by_created_by_id": leads_by_created,
        "leads_by_owner_id": leads_by_owner,
        "leads_counted_by_query": leads_counted,
        "leads_without_ownership": leads_without_ownership,
        "calculated_initial_value": calculated_value
    }

