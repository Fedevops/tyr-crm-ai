from typing import List, Optional
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlmodel import Session, select, and_, or_, func
from app.database import get_session
from app.models import (
    Task, TaskCreate, TaskUpdate, TaskResponse, TaskType, TaskStatus,
    Lead, Sequence, User
)
from app.dependencies import get_current_active_user

router = APIRouter()


def generate_tasks_from_sequence(
    session: Session,
    lead_id: int,
    sequence_id: int,
    tenant_id: int,
    assigned_to: Optional[int] = None,
    start_date: Optional[datetime] = None
):
    """Generate tasks from a sequence for a lead"""
    if start_date is None:
        start_date = datetime.utcnow()
    
    sequence = session.get(Sequence, sequence_id)
    if not sequence or sequence.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence not found"
        )
    
    if not sequence.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sequence is not active"
        )
    
    try:
        steps = json.loads(sequence.steps)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sequence steps format"
        )
    
    if not isinstance(steps, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Steps must be a list"
        )
    
    created_tasks = []
    current_date = start_date
    
    for step in steps:
        if not isinstance(step, dict):
            continue
        
        step_type = step.get("type", "other")
        delay_days = step.get("delay_days", 0)
        title = step.get("title", f"Task: {step_type}")
        description = step.get("description") or step.get("template")
        
        # Calculate due date
        due_date = current_date + timedelta(days=delay_days)
        
        # Map step type to TaskType
        task_type_map = {
            "email": TaskType.EMAIL,
            "call": TaskType.CALL,
            "linkedin": TaskType.LINKEDIN,
            "meeting": TaskType.MEETING,
            "follow_up": TaskType.FOLLOW_UP,
            "research": TaskType.RESEARCH,
        }
        task_type = task_type_map.get(step_type.lower(), TaskType.OTHER)
        
        task = Task(
            tenant_id=tenant_id,
            lead_id=lead_id,
            sequence_id=sequence_id,
            assigned_to=assigned_to,
            type=task_type,
            title=title,
            description=description,
            due_date=due_date,
            status=TaskStatus.PENDING
        )
        session.add(task)
        created_tasks.append(task)
        
        # Update current date for next step
        current_date = due_date
    
    session.commit()
    return created_tasks


@router.post("", response_model=TaskResponse)
async def create_task(
    task_data: TaskCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new task"""
    # Verify lead belongs to tenant
    lead = session.get(Lead, task_data.lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    # If sequence_id is provided, generate tasks from sequence
    if task_data.sequence_id:
        tasks = generate_tasks_from_sequence(
            session=session,
            lead_id=task_data.lead_id,
            sequence_id=task_data.sequence_id,
            tenant_id=current_user.tenant_id,
            assigned_to=task_data.assigned_to or current_user.id
        )
        if tasks:
            session.refresh(tasks[0])
            return tasks[0]
    
    # Create single task
    task = Task(
        **task_data.dict(),
        tenant_id=current_user.tenant_id,
        assigned_to=task_data.assigned_to or current_user.id
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("")
async def get_tasks(
    lead_id: Optional[int] = Query(None, description="Filter by lead"),
    assigned_to: Optional[int] = Query(None, description="Filter by assigned user"),
    status: Optional[TaskStatus] = Query(None, description="Filter by status"),
    type: Optional[TaskType] = Query(None, description="Filter by type"),
    upcoming: Optional[bool] = Query(None, description="Get only upcoming tasks"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get tasks for the current tenant with filters and pagination"""
    # Base query
    base_query = select(Task).where(Task.tenant_id == current_user.tenant_id)
    
    filters = []
    
    if lead_id:
        filters.append(Task.lead_id == lead_id)
    
    if assigned_to:
        filters.append(Task.assigned_to == assigned_to)
    
    if status:
        filters.append(Task.status == status)
    
    if type:
        filters.append(Task.type == type)
    
    if upcoming:
        filters.append(Task.due_date >= datetime.utcnow())
        filters.append(Task.status != TaskStatus.COMPLETED)
    
    if filters:
        base_query = base_query.where(and_(*filters))
    
    # Count total tasks - use the same base query for consistency
    count_query = select(func.count(Task.id)).where(Task.tenant_id == current_user.tenant_id)
    if filters:
        count_query = count_query.where(and_(*filters))
    total_count = session.exec(count_query).one() or 0
    
    print(f"[TASKS API] Counting tasks - tenant_id: {current_user.tenant_id}, filters: {len(filters)}, total_count: {total_count}")
    
    # Get paginated tasks
    query = base_query.order_by(Task.due_date.asc())
    query = query.offset(skip).limit(limit)
    
    tasks = session.exec(query).all()
    
    # Create response with custom headers
    from fastapi.responses import JSONResponse
    
    # Serialize tasks properly (handles datetime objects)
    tasks_data = []
    for task in tasks:
        task_dict = task.dict()
        # Convert datetime objects to ISO format strings
        for key, value in task_dict.items():
            if isinstance(value, datetime):
                task_dict[key] = value.isoformat()
        tasks_data.append(task_dict)
    
    # Return JSONResponse with total count in header
    response = JSONResponse(content=tasks_data)
    response.headers["X-Total-Count"] = str(total_count)
    
    # Debug log
    print(f"[TASKS API] Total count: {total_count}, Returning {len(tasks_data)} tasks, Page: skip={skip}, limit={limit}")
    
    return response


@router.get("/upcoming", response_model=List[TaskResponse])
async def get_upcoming_tasks(
    days: int = Query(7, ge=1, le=30, description="Number of days ahead"),
    assigned_to: Optional[int] = Query(None, description="Filter by assigned user"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get upcoming tasks within the next N days"""
    now = datetime.utcnow()
    future_date = now + timedelta(days=days)
    
    query = select(Task).where(
        and_(
            Task.tenant_id == current_user.tenant_id,
            Task.due_date >= now,
            Task.due_date <= future_date,
            Task.status != TaskStatus.COMPLETED,
            Task.status != TaskStatus.CANCELLED
        )
    )
    
    if assigned_to:
        query = query.where(Task.assigned_to == assigned_to)
    
    query = query.order_by(Task.due_date.asc())
    
    tasks = session.exec(query).all()
    return tasks


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific task"""
    task = session.get(Task, task_id)
    if not task or task.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a task"""
    task = session.get(Task, task_id)
    if not task or task.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    update_data = task_data.dict(exclude_unset=True)
    
    # If marking as completed, set completed_at
    if update_data.get("status") == TaskStatus.COMPLETED and not task.completed_at:
        update_data["completed_at"] = datetime.utcnow()
    
    # If changing from completed to another status, clear completed_at
    if update_data.get("status") and update_data["status"] != TaskStatus.COMPLETED:
        if task.status == TaskStatus.COMPLETED:
            update_data["completed_at"] = None
    
    for key, value in update_data.items():
        setattr(task, key, value)
    
    task.updated_at = datetime.utcnow()
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a task"""
    task = session.get(Task, task_id)
    if not task or task.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    session.delete(task)
    session.commit()
    return {"message": "Task deleted successfully"}

