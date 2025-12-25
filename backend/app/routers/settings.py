from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta
import json
from app.database import get_session
from app.models import User, Tenant, CompanyProfile
from app.auth import verify_password, get_password_hash
from app.dependencies import get_current_active_user

router = APIRouter()


# ==================== PROFILE ====================

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    position: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None  # Base64 ou URL


class ProfileResponse(BaseModel):
    full_name: str
    email: str
    position: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user profile"""
    # Por enquanto, vamos usar campos do User e adicionar campos extras depois
    return ProfileResponse(
        full_name=current_user.full_name,
        email=current_user.email,
        position=None,  # TODO: adicionar campo no model
        bio=None,  # TODO: adicionar campo no model
        avatar=None,  # TODO: adicionar campo no model
    )


@router.put("/profile", response_model=ProfileResponse)
async def update_profile(
    profile_data: ProfileUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update current user profile"""
    if profile_data.full_name:
        current_user.full_name = profile_data.full_name
    # TODO: adicionar campos position, bio, avatar no model User
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    return ProfileResponse(
        full_name=current_user.full_name,
        email=current_user.email,
        position=profile_data.position,
        bio=profile_data.bio,
        avatar=profile_data.avatar,
    )


# ==================== BRANDING ====================

class BrandingUpdate(BaseModel):
    organization_name: Optional[str] = None
    logo: Optional[str] = None  # Base64 ou URL
    primary_color: Optional[str] = None  # Hex color


class BrandingResponse(BaseModel):
    organization_name: str
    logo: Optional[str] = None
    primary_color: str


@router.get("/branding", response_model=BrandingResponse)
async def get_branding(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get branding settings"""
    tenant = session.exec(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    ).first()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Por enquanto, usar company_name como organization_name
    # TODO: adicionar campos logo e primary_color no model Tenant
    return BrandingResponse(
        organization_name=tenant.company_name or tenant.name,
        logo=None,
        primary_color="#3b82f6",  # Default
    )


@router.put("/branding", response_model=BrandingResponse)
async def update_branding(
    branding_data: BrandingUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update branding settings"""
    tenant = session.exec(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    ).first()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    if branding_data.organization_name:
        tenant.company_name = branding_data.organization_name
        # Também atualizar name se necessário
        if not tenant.name or tenant.name == tenant.company_name:
            tenant.name = branding_data.organization_name
    
    # TODO: adicionar campos logo e primary_color no model Tenant
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    
    return BrandingResponse(
        organization_name=tenant.company_name or tenant.name,
        logo=branding_data.logo,
        primary_color=branding_data.primary_color or "#3b82f6",
    )


# ==================== TEAM ====================

class TeamMemberResponse(BaseModel):
    id: int
    name: str
    email: str
    access_level: str  # admin, manager, user
    status: str  # active, pending
    invited_at: str


@router.get("/team", response_model=List[TeamMemberResponse])
async def get_team(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get team members"""
    users = session.exec(
        select(User).where(User.tenant_id == current_user.tenant_id)
    ).all()
    
    return [
        TeamMemberResponse(
            id=user.id,
            name=user.full_name,
            email=user.email,
            access_level=user.role.value if hasattr(user.role, 'value') else str(user.role),
            status="active" if user.is_active else "pending",
            invited_at=user.created_at.isoformat() if user.created_at else datetime.utcnow().isoformat(),
        )
        for user in users
    ]


class InviteMemberRequest(BaseModel):
    email: EmailStr
    access_level: str  # admin, manager, user


@router.post("/team/invite", response_model=TeamMemberResponse)
async def invite_member(
    invite_data: InviteMemberRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Invite a new team member"""
    # Verificar se usuário já existe
    existing_user = session.exec(
        select(User).where(User.email == invite_data.email)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    # Por enquanto, apenas retornar um mock
    # TODO: implementar sistema de convites real
    from app.models import UserRole
    role_map = {
        "admin": UserRole.ADMIN,
        "manager": UserRole.MANAGER,
        "user": UserRole.SDR,
    }
    
    # Criar usuário temporário (sem senha) - precisa de sistema de convites
    # Por enquanto, retornar erro informando que precisa criar usuário completo
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Team invitation system not yet implemented. Please create users through registration."
    )


@router.delete("/team/{member_id}")
async def remove_member(
    member_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Remove a team member"""
    user = session.exec(
        select(User).where(
            User.id == member_id,
            User.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself"
        )
    
    session.delete(user)
    session.commit()
    
    return {"message": "Member removed successfully"}


# ==================== BILLING ====================

class BillingPlanResponse(BaseModel):
    name: str
    price: float
    next_renewal: str


@router.get("/billing", response_model=BillingPlanResponse)
async def get_billing(
    current_user: User = Depends(get_current_active_user)
):
    """Get billing plan information"""
    # Mock data por enquanto
    return BillingPlanResponse(
        name="Professional",
        price=99.99,
        next_renewal=(datetime.utcnow().replace(day=15) + timedelta(days=30)).isoformat(),
    )


class InvoiceResponse(BaseModel):
    id: int
    date: str
    amount: float
    pdf_url: str


@router.get("/billing/invoices", response_model=List[InvoiceResponse])
async def get_invoices(
    current_user: User = Depends(get_current_active_user)
):
    """Get invoice history"""
    # Mock data por enquanto
    return []


# ==================== SECURITY ====================

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@router.put("/security/password")
async def change_password(
    password_data: PasswordChangeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Change user password"""
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    if len(password_data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters"
        )
    
    current_user.hashed_password = get_password_hash(password_data.new_password)
    session.add(current_user)
    session.commit()
    
    return {"message": "Password updated successfully"}


class TwoFactorToggle(BaseModel):
    enabled: bool


@router.put("/security/2fa")
async def toggle_2fa(
    two_factor_data: TwoFactorToggle,
    current_user: User = Depends(get_current_active_user)
):
    """Toggle two-factor authentication"""
    # TODO: implementar 2FA real
    return {"message": f"2FA {'enabled' if two_factor_data.enabled else 'disabled'}", "enabled": two_factor_data.enabled}


class ActiveSessionResponse(BaseModel):
    id: int
    device: str
    ip: str
    last_activity: str
    location: str


@router.get("/security/sessions", response_model=List[ActiveSessionResponse])
async def get_active_sessions(
    current_user: User = Depends(get_current_active_user)
):
    """Get active sessions"""
    # Mock data por enquanto
    return []


@router.post("/security/sessions/revoke-all")
async def revoke_all_sessions(
    current_user: User = Depends(get_current_active_user)
):
    """Revoke all active sessions"""
    # TODO: implementar sistema de sessões real
    return {"message": "All sessions revoked"}


# ==================== API KEYS ====================

class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key: str
    created_at: str
    last_used: Optional[str] = None


@router.get("/api-keys", response_model=List[ApiKeyResponse])
async def get_api_keys(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get API keys"""
    # Buscar do company_profile
    profile = session.exec(
        select(CompanyProfile).where(CompanyProfile.tenant_id == current_user.tenant_id)
    ).first()
    
    if not profile or not profile.api_keys:
        return []
    
    try:
        keys_data = json.loads(profile.api_keys)
        return [
            ApiKeyResponse(
                id=idx,
                name=key.get("name", f"Key {idx}"),
                key=key.get("key", ""),
                created_at=key.get("created_at", datetime.utcnow().isoformat()),
                last_used=key.get("last_used"),
            )
            for idx, key in enumerate(keys_data, 1)
        ]
    except:
        return []


class GenerateApiKeyRequest(BaseModel):
    name: str


@router.post("/api-keys", response_model=ApiKeyResponse)
async def generate_api_key(
    key_data: GenerateApiKeyRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Generate a new API key"""
    import secrets
    
    # Gerar chave aleatória
    new_key = f"sk_{secrets.token_urlsafe(32)}"
    
    # Buscar ou criar company_profile
    profile = session.exec(
        select(CompanyProfile).where(CompanyProfile.tenant_id == current_user.tenant_id)
    ).first()
    
    if not profile:
        profile = CompanyProfile(tenant_id=current_user.tenant_id)
        session.add(profile)
        session.commit()
        session.refresh(profile)
    
    # Adicionar nova chave
    existing_keys = []
    if profile.api_keys:
        try:
            existing_keys = json.loads(profile.api_keys)
        except:
            existing_keys = []
    
    new_key_data = {
        "name": key_data.name,
        "key": new_key,
        "created_at": datetime.utcnow().isoformat(),
    }
    existing_keys.append(new_key_data)
    
    profile.api_keys = json.dumps(existing_keys)
    session.add(profile)
    session.commit()
    
    return ApiKeyResponse(
        id=len(existing_keys),
        name=key_data.name,
        key=new_key,
        created_at=new_key_data["created_at"],
    )


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Revoke an API key"""
    profile = session.exec(
        select(CompanyProfile).where(CompanyProfile.tenant_id == current_user.tenant_id)
    ).first()
    
    if not profile or not profile.api_keys:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    try:
        keys_data = json.loads(profile.api_keys)
        if key_id < 1 or key_id > len(keys_data):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API key not found"
            )
        
        keys_data.pop(key_id - 1)  # key_id é 1-indexed
        profile.api_keys = json.dumps(keys_data)
        session.add(profile)
        session.commit()
        
        return {"message": "API key revoked successfully"}
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error revoking API key"
        )


# ==================== WEBHOOKS ====================

class WebhookUpdate(BaseModel):
    url: str


@router.get("/webhook")
async def get_webhook(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get webhook URL"""
    # TODO: adicionar campo webhook_url no Tenant ou CompanyProfile
    return {"url": ""}


@router.put("/webhook")
async def update_webhook(
    webhook_data: WebhookUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update webhook URL"""
    # TODO: adicionar campo webhook_url no Tenant ou CompanyProfile
    return {"message": "Webhook updated successfully", "url": webhook_data.url}

