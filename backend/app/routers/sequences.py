from typing import List, Optional
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from sqlalchemy import and_
from pydantic import BaseModel
from app.database import get_session
from app.models import Sequence, SequenceCreate, SequenceResponse, User, Lead, TaskResponse
from app.dependencies import get_current_active_user
from app.routers.tasks import generate_tasks_from_sequence

router = APIRouter()


class AssignSequenceRequest(BaseModel):
    start_date: Optional[datetime] = None


@router.post("", response_model=SequenceResponse)
async def create_sequence(
    sequence_data: SequenceCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new sequence for the current tenant"""
    # Validate JSON steps
    try:
        json.loads(sequence_data.steps)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format for steps"
        )
    
    sequence = Sequence(
        **sequence_data.dict(),
        tenant_id=current_user.tenant_id
    )
    session.add(sequence)
    session.commit()
    session.refresh(sequence)
    return sequence


@router.get("", response_model=List[SequenceResponse])
async def get_sequences(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all sequences for the current tenant"""
    sequences = session.exec(
        select(Sequence).where(Sequence.tenant_id == current_user.tenant_id)
    ).all()
    return sequences


@router.get("/{sequence_id}", response_model=SequenceResponse)
async def get_sequence(
    sequence_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific sequence"""
    sequence = session.get(Sequence, sequence_id)
    if not sequence or sequence.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence not found"
        )
    return sequence


@router.put("/{sequence_id}", response_model=SequenceResponse)
async def update_sequence(
    sequence_id: int,
    sequence_data: SequenceCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a sequence"""
    sequence = session.get(Sequence, sequence_id)
    if not sequence or sequence.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence not found"
        )
    
    # Validate JSON steps
    try:
        json.loads(sequence_data.steps)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format for steps"
        )
    
    for key, value in sequence_data.dict().items():
        setattr(sequence, key, value)
    
    session.add(sequence)
    session.commit()
    session.refresh(sequence)
    return sequence


@router.delete("/{sequence_id}")
async def delete_sequence(
    sequence_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a sequence"""
    sequence = session.get(Sequence, sequence_id)
    if not sequence or sequence.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence not found"
        )
    
    session.delete(sequence)
    session.commit()
    return {"message": "Sequence deleted successfully"}


@router.post("/{sequence_id}/assign-to-lead/{lead_id}", response_model=List[TaskResponse])
async def assign_sequence_to_lead(
    sequence_id: int,
    lead_id: int,
    request_data: Optional[AssignSequenceRequest] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Assign a sequence to a lead and generate tasks for each step"""
    from app.models import Task
    
    # Verify sequence belongs to tenant
    sequence = session.get(Sequence, sequence_id)
    if not sequence or sequence.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence not found"
        )
    
    # Verify lead belongs to tenant
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    # Check if lead already has tasks from this sequence
    existing_tasks = session.exec(
        select(Task).where(
            and_(
                Task.tenant_id == current_user.tenant_id,
                Task.lead_id == lead_id,
                Task.sequence_id == sequence_id
            )
        )
    ).first()
    
    if existing_tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este lead já está associado a esta cadência. Não é possível associar novamente."
        )
    
    # Use provided start_date or default to None (which will use current date in generate_tasks_from_sequence)
    start_date = request_data.start_date if request_data and request_data.start_date else None
    
    # Generate tasks from sequence
    tasks = generate_tasks_from_sequence(
        session=session,
        lead_id=lead_id,
        sequence_id=sequence_id,
        tenant_id=current_user.tenant_id,
        assigned_to=current_user.id,
        start_date=start_date,
        created_by_id=current_user.id  # Associar ao usuário logado
    )
    
    # Refresh all tasks to get full data
    for task in tasks:
        session.refresh(task)
    
    return tasks

