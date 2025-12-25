from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models import Playbook, PlaybookCreate, PlaybookResponse, User
from app.dependencies import get_current_active_user

router = APIRouter()


@router.post("", response_model=PlaybookResponse)
async def create_playbook(
    playbook_data: PlaybookCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new playbook for the current tenant"""
    playbook = Playbook(
        **playbook_data.dict(),
        tenant_id=current_user.tenant_id
    )
    session.add(playbook)
    session.commit()
    session.refresh(playbook)
    return playbook


@router.get("", response_model=List[PlaybookResponse])
async def get_playbooks(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all playbooks for the current tenant"""
    playbooks = session.exec(
        select(Playbook).where(Playbook.tenant_id == current_user.tenant_id)
    ).all()
    return playbooks


@router.get("/{playbook_id}", response_model=PlaybookResponse)
async def get_playbook(
    playbook_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific playbook"""
    playbook = session.get(Playbook, playbook_id)
    if not playbook or playbook.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playbook not found"
        )
    return playbook


@router.put("/{playbook_id}", response_model=PlaybookResponse)
async def update_playbook(
    playbook_id: int,
    playbook_data: PlaybookCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a playbook"""
    playbook = session.get(Playbook, playbook_id)
    if not playbook or playbook.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playbook not found"
        )
    
    for key, value in playbook_data.dict().items():
        setattr(playbook, key, value)
    
    session.add(playbook)
    session.commit()
    session.refresh(playbook)
    return playbook


@router.delete("/{playbook_id}")
async def delete_playbook(
    playbook_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a playbook"""
    playbook = session.get(Playbook, playbook_id)
    if not playbook or playbook.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playbook not found"
        )
    
    session.delete(playbook)
    session.commit()
    return {"message": "Playbook deleted successfully"}







