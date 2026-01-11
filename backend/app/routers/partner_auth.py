from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from app.database import get_session
from app.models import PartnerUser, Partner
from app.auth import verify_password, get_password_hash, create_access_token
from app.config import settings
from app.dependencies import get_current_partner_user

router = APIRouter(prefix="/api/partner-auth", tags=["Partner Auth"])


class PartnerLogin(BaseModel):
    email: str
    password: str


class PartnerUserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    is_active: bool
    is_owner: bool
    role: str
    partner_id: int
    partner_nome: str | None = None


@router.post("/login")
async def partner_login(
    credentials: PartnerLogin,
    session: Session = Depends(get_session)
):
    """Login para usuários de parceiros"""
    partner_user = session.exec(
        select(PartnerUser).where(PartnerUser.email == credentials.email)
    ).first()
    
    if not partner_user or not verify_password(credentials.password, partner_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not partner_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo"
        )
    
    # Verificar se o parceiro está ativo
    partner = session.get(Partner, partner_user.partner_id)
    if not partner or partner.status != "ativo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parceiro inativo ou não aprovado"
        )
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={
            "sub": str(partner_user.id),
            "partner_id": partner_user.partner_id,
            "type": "partner"  # Tipo de usuário para diferenciar
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": PartnerUserResponse(
            id=partner_user.id,
            email=partner_user.email,
            full_name=partner_user.full_name,
            is_active=partner_user.is_active,
            is_owner=partner_user.is_owner,
            role=partner_user.role,
            partner_id=partner_user.partner_id,
            partner_nome=partner.nome if partner else None
        )
    }


@router.get("/me")
async def get_current_partner_user_info(
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Get current partner user information"""
    from app.dependencies import get_current_partner_user as get_partner_user
    partner = session.get(Partner, current_user.partner_id)
    
    return PartnerUserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_owner=current_user.is_owner,
        role=current_user.role,
        partner_id=current_user.partner_id,
        partner_nome=partner.nome if partner else None
    )

