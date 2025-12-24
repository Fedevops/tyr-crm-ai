from typing import List
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.database import get_session
from app.models import User
from app.dependencies import get_current_active_user

router = APIRouter()


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_active_user)):
    """Get current user"""
    return current_user


@router.get("", response_model=List[dict])
async def get_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all users in the current tenant"""
    query = select(User).where(User.tenant_id == current_user.tenant_id)
    users = session.exec(query).all()
    return [
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role)
        }
        for user in users
    ]






