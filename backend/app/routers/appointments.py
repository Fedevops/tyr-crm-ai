from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, and_, or_, func
from app.database import get_session
from app.models import (
    Appointment, AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    AppointmentStatus, Lead, User, UserRole
)
from app.dependencies import get_current_active_user, apply_ownership_filter, require_ownership
from app.services.kpi_service import track_kpi_activity
from app.models import GoalMetricType
from app.services.audit_service import log_create, log_update, log_delete
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def appointment_to_response(appointment: Appointment, include_lead_info: bool = False) -> AppointmentResponse:
    """Helper function to convert Appointment to AppointmentResponse"""
    response = AppointmentResponse(
        id=appointment.id,
        tenant_id=appointment.tenant_id,
        lead_id=appointment.lead_id,
        title=appointment.title,
        description=appointment.description,
        scheduled_at=appointment.scheduled_at,
        duration_minutes=appointment.duration_minutes,
        location=appointment.location,
        meeting_url=appointment.meeting_url,
        status=appointment.status,
        notes=appointment.notes,
        outcome=appointment.outcome,
        completed_at=appointment.completed_at,
        cancelled_at=appointment.cancelled_at,
        owner_id=appointment.owner_id,
        created_by_id=appointment.created_by_id,
        created_at=appointment.created_at,
        updated_at=appointment.updated_at,
    )
    
    if include_lead_info and appointment.lead:
        response.lead_name = appointment.lead.name
        response.lead_company = appointment.lead.company
    
    return response


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    appointment_data: AppointmentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Criar um novo agendamento"""
    # Verificar se o lead existe e pertence ao tenant
    lead = session.get(Lead, appointment_data.lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    # Criar agendamento
    appointment = Appointment(
        tenant_id=current_user.tenant_id,
        lead_id=appointment_data.lead_id,
        title=appointment_data.title,
        description=appointment_data.description,
        scheduled_at=appointment_data.scheduled_at,
        duration_minutes=appointment_data.duration_minutes,
        location=appointment_data.location,
        meeting_url=appointment_data.meeting_url,
        status=AppointmentStatus.SCHEDULED,
        notes=appointment_data.notes,
        owner_id=appointment_data.owner_id or current_user.id,
        created_by_id=current_user.id,
    )
    
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    
    # Log de auditoria
    log_create(
        session=session,
        user=current_user,
        entity_type="Appointment",
        entity_id=appointment.id,
        metadata={"title": appointment.title, "lead_id": appointment.lead_id}
    )
    
    # Track KPI - reunião agendada
    try:
        completed_goals = track_kpi_activity(
            session=session,
            user_id=appointment.owner_id or current_user.id,
            tenant_id=current_user.tenant_id,
            metric_type=GoalMetricType.MEETINGS_SCHEDULED,
            value=1.0,
            entity_type='Appointment',
            entity_id=appointment.id
        )
        session.commit()
        
        if completed_goals:
            logger.info(f"✅ [KPI] {len(completed_goals)} meta(s) completada(s) ao agendar reunião")
    except Exception as e:
        logger.error(f"❌ [KPI] Erro ao trackear reunião agendada: {e}")
        # Não falhar a criação do agendamento se o KPI falhar
    
    return appointment_to_response(appointment, include_lead_info=True)


@router.get("", response_model=List[AppointmentResponse])
async def get_appointments(
    lead_id: Optional[int] = Query(None, description="Filtrar por lead"),
    status_filter: Optional[AppointmentStatus] = Query(None, description="Filtrar por status"),
    start_date: Optional[datetime] = Query(None, description="Data inicial (YYYY-MM-DD)"),
    end_date: Optional[datetime] = Query(None, description="Data final (YYYY-MM-DD)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar agendamentos"""
    query = select(Appointment).where(
        Appointment.tenant_id == current_user.tenant_id
    )
    
    # Aplicar filtro de ownership (não-admin só vê seus próprios)
    if current_user.role != UserRole.ADMIN:
        query = query.where(
            or_(
                Appointment.owner_id == current_user.id,
                Appointment.owner_id.is_(None)
            )
        )
    
    # Filtros opcionais
    if lead_id:
        query = query.where(Appointment.lead_id == lead_id)
    
    if status_filter:
        query = query.where(Appointment.status == status_filter)
    
    if start_date:
        query = query.where(Appointment.scheduled_at >= start_date)
    
    if end_date:
        query = query.where(Appointment.scheduled_at <= end_date)
    
    # Ordenar por data agendada
    query = query.order_by(Appointment.scheduled_at.desc())
    
    # Paginação
    query = query.offset(skip).limit(limit)
    
    appointments = session.exec(query).all()
    
    # Buscar informações do lead para cada agendamento
    result = []
    for appointment in appointments:
        session.refresh(appointment, ["lead"])
        result.append(appointment_to_response(appointment, include_lead_info=True))
    
    return result


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(
    appointment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Obter um agendamento específico"""
    appointment = session.get(Appointment, appointment_id)
    
    if not appointment or appointment.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )
    
    require_ownership(appointment, current_user)
    
    session.refresh(appointment, ["lead"])
    return appointment_to_response(appointment, include_lead_info=True)


@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(
    appointment_id: int,
    appointment_data: AppointmentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar um agendamento"""
    appointment = session.get(Appointment, appointment_id)
    
    if not appointment or appointment.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )
    
    require_ownership(appointment, current_user)
    
    # Armazenar status anterior para tracking de KPI
    old_status = appointment.status
    
    # Atualizar campos
    update_data = appointment_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(appointment, field, value)
    
    # Se mudou para COMPLETED, atualizar completed_at
    if appointment.status == AppointmentStatus.COMPLETED and not appointment.completed_at:
        appointment.completed_at = datetime.utcnow()
        # Track KPI - reunião completada
        try:
            completed_goals = track_kpi_activity(
                session=session,
                user_id=appointment.owner_id or current_user.id,
                tenant_id=current_user.tenant_id,
                metric_type=GoalMetricType.MEETINGS_COMPLETED,
                value=1.0,
                entity_type='Appointment',
                entity_id=appointment.id
            )
            session.commit()
            
            if completed_goals:
                logger.info(f"✅ [KPI] {len(completed_goals)} meta(s) completada(s) ao completar reunião")
        except Exception as e:
            logger.error(f"❌ [KPI] Erro ao trackear reunião completada: {e}")
    
    # Se mudou para CANCELLED, atualizar cancelled_at
    if appointment.status == AppointmentStatus.CANCELLED and not appointment.cancelled_at:
        appointment.cancelled_at = datetime.utcnow()
    
    appointment.updated_at = datetime.utcnow()
    
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    
    # Log de auditoria
    log_update(
        session=session,
        user=current_user,
        entity_type="Appointment",
        entity_id=appointment.id,
        field_name="status",
        old_value=old_status.value if old_status else None,
        new_value=appointment.status.value,
        metadata={"old_status": old_status.value if old_status else None, "new_status": appointment.status.value}
    )
    
    session.refresh(appointment, ["lead"])
    return appointment_to_response(appointment, include_lead_info=True)


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_appointment(
    appointment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Deletar um agendamento"""
    appointment = session.get(Appointment, appointment_id)
    
    if not appointment or appointment.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )
    
    require_ownership(appointment, current_user)
    
    # Log de auditoria antes de deletar
    log_delete(
        session=session,
        user=current_user,
        entity_type="Appointment",
        entity_id=appointment.id,
        metadata={"title": appointment.title}
    )
    
    session.delete(appointment)
    session.commit()
    
    return None


@router.get("/stats/summary")
async def get_appointments_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Obter estatísticas de agendamentos"""
    base_query = select(Appointment).where(
        Appointment.tenant_id == current_user.tenant_id
    )
    
    # Aplicar filtro de ownership (não-admin só vê seus próprios)
    if current_user.role != UserRole.ADMIN:
        base_query = base_query.where(
            or_(
                Appointment.owner_id == current_user.id,
                Appointment.owner_id.is_(None)
            )
        )
    
    # Total agendado
    total_scheduled = session.exec(
        base_query.where(Appointment.status == AppointmentStatus.SCHEDULED)
    ).all()
    
    # Total completado
    total_completed = session.exec(
        base_query.where(Appointment.status == AppointmentStatus.COMPLETED)
    ).all()
    
    # Total cancelado
    total_cancelled = session.exec(
        base_query.where(Appointment.status == AppointmentStatus.CANCELLED)
    ).all()
    
    # Próximas reuniões (próximas 5)
    upcoming = session.exec(
        base_query.where(
            and_(
                Appointment.status == AppointmentStatus.SCHEDULED,
                Appointment.scheduled_at >= datetime.utcnow()
            )
        ).order_by(Appointment.scheduled_at.asc()).limit(5)
    ).all()
    
    return {
        "total_scheduled": len(total_scheduled),
        "total_completed": len(total_completed),
        "total_cancelled": len(total_cancelled),
        "upcoming": [appointment_to_response(a, include_lead_info=True) for a in upcoming]
    }

