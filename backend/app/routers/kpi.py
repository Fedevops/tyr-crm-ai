from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List, Dict
from datetime import datetime
from app.database import get_session
from app.models import (
    Goal, GoalCreate, GoalUpdate, GoalResponse,
    ActivityLog, ActivityLogResponse,
    TrackActivityRequest,
    GoalMetricType, GoalPeriod, GoalStatus,
    User
)
from app.dependencies import get_current_active_user
from app.services.kpi_service import (
    calculate_period_dates,
    calculate_goal_status,
    reset_goal_period_if_needed,
)

router = APIRouter()




@router.get("/goals", response_model=List[GoalResponse])
async def get_goals(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all goals for the current user"""
    goals = session.exec(
        select(Goal).where(
            Goal.tenant_id == current_user.tenant_id,
            Goal.user_id == current_user.id
        )
    ).all()
    
    # Resetar períodos se necessário e recalcular status
    updated_goals = []
    for goal in goals:
        goal = reset_goal_period_if_needed(goal)
        goal.status = calculate_goal_status(goal)
        session.add(goal)
        updated_goals.append(goal)
    
    session.commit()
    
    return [
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
            created_at=goal.created_at,
            updated_at=goal.updated_at,
        )
        for goal in updated_goals
    ]


@router.post("/goals", response_model=GoalResponse)
async def create_goal(
    goal_data: GoalCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new goal"""
    period_start, period_end = calculate_period_dates(goal_data.period)
    
    goal = Goal(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        title=goal_data.title,
        metric_type=goal_data.metric_type,
        target_value=goal_data.target_value,
        current_value=0.0,
        period=goal_data.period,
        status=GoalStatus.ON_TRACK,
        is_visible_on_wallboard=goal_data.is_visible_on_wallboard,
        period_start=period_start,
        period_end=period_end,
    )
    
    session.add(goal)
    session.commit()
    session.refresh(goal)
    
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
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )


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
    
    goal.status = calculate_goal_status(goal)
    goal.updated_at = datetime.utcnow()
    
    session.add(goal)
    session.commit()
    session.refresh(goal)
    
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

