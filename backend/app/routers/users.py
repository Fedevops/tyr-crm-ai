from fastapi import APIRouter, Depends
from sqlmodel import Session
from app.database import get_session
from app.models import User
from app.dependencies import get_current_active_user

router = APIRouter()


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_active_user)):
    """Get current user"""
    return current_user





