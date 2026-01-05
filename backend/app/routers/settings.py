from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func, and_
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import json
from app.database import get_session
from app.models import User, Tenant, CompanyProfile, TenantLimit, Lead, Item, ApiCallLog, PlanLimitDefaults, PlanType, UserRole
from app.auth import verify_password, get_password_hash
from app.dependencies import get_current_active_user, check_limit

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
    # Verificar limite de usuários antes de convidar
    await check_limit("users", session, current_user)
    
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


# ==================== USAGE & LIMITS ====================

class UsageMetricResponse(BaseModel):
    current: int
    max: int
    percentage: float


class UsageResponse(BaseModel):
    plan_type: str
    limits: Dict[str, UsageMetricResponse]


@router.get("/usage", response_model=UsageResponse)
async def get_usage(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get current usage and limits for the tenant"""
    tenant_id = current_user.tenant_id
    
    # Buscar limites do tenant
    tenant_limit = session.exec(
        select(TenantLimit).where(TenantLimit.tenant_id == tenant_id)
    ).first()
    
    # Se não existir, criar com valores padrão do plan_type
    if not tenant_limit:
        plan_type = PlanType.STARTER
        default_limits = get_default_limits_for_plan(session, plan_type)
        tenant_limit = TenantLimit(
            tenant_id=tenant_id,
            plan_type=plan_type,
            max_leads=default_limits.max_leads,
            max_users=default_limits.max_users,
            max_items=default_limits.max_items,
            max_api_calls=default_limits.max_api_calls,
            max_tokens=getattr(default_limits, 'max_tokens', 100000)
        )
        session.add(tenant_limit)
        session.commit()
        session.refresh(tenant_limit)
    
    # Calcular uso atual em tempo real
    # Leads
    leads_count = session.exec(
        select(func.count(Lead.id)).where(Lead.tenant_id == tenant_id)
    ).one() or 0
    
    # Users (apenas ativos)
    users_count = session.exec(
        select(func.count(User.id)).where(
            and_(
                User.tenant_id == tenant_id,
                User.is_active == True
            )
        )
    ).one() or 0
    
    # Items
    items_count = session.exec(
        select(func.count(Item.id)).where(Item.tenant_id == tenant_id)
    ).one() or 0
    
    # API Calls (último mês)
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    api_calls_count = session.exec(
        select(func.count(ApiCallLog.id)).where(
            and_(
                ApiCallLog.tenant_id == tenant_id,
                ApiCallLog.created_at >= month_start
            )
        )
    ).one() or 0
    
    # Tokens LLM (último mês)
    from app.services.token_tracker import get_tokens_usage
    from app.models import LLMTokenUsage
    tokens_used = get_tokens_usage(session, tenant_id, month_start)
    
    # Calcular percentuais
    def calculate_usage(current: int, max_limit: int) -> UsageMetricResponse:
        if max_limit == -1:  # Ilimitado
            percentage = 0.0
            # Usar um valor muito grande para representar ilimitado no frontend
            max_value = 999999999
        else:
            percentage = min((current / max_limit * 100) if max_limit > 0 else 0, 100.0)
            max_value = max_limit
        return UsageMetricResponse(
            current=current,
            max=max_value,
            percentage=round(percentage, 2)
        )
    
    return UsageResponse(
        plan_type=tenant_limit.plan_type.value,
        limits={
            "leads": calculate_usage(leads_count, tenant_limit.max_leads),
            "users": calculate_usage(users_count, tenant_limit.max_users),
            "items": calculate_usage(items_count, tenant_limit.max_items),
            "api_calls": calculate_usage(api_calls_count, tenant_limit.max_api_calls),
            "tokens": calculate_usage(tokens_used, getattr(tenant_limit, 'max_tokens', 100000))
        }
    )


# ==================== PLAN LIMITS MANAGEMENT ====================

class PlanLimitDefaultsResponse(BaseModel):
    plan_type: str
    max_leads: int
    max_users: int
    max_items: int
    max_api_calls: int
    max_tokens: int
    created_at: str
    updated_at: str


class UpdatePlanLimitDefaultsRequest(BaseModel):
    max_leads: Optional[int] = None
    max_users: Optional[int] = None
    max_items: Optional[int] = None
    max_api_calls: Optional[int] = None
    max_tokens: Optional[int] = None


class UpdateTenantLimitsRequest(BaseModel):
    plan_type: Optional[PlanType] = None
    max_leads: Optional[int] = None
    max_users: Optional[int] = None
    max_items: Optional[int] = None
    max_api_calls: Optional[int] = None
    max_tokens: Optional[int] = None


def get_default_limits_for_plan(session: Session, plan_type: PlanType) -> PlanLimitDefaults:
    """Obter limites padrão para um tipo de plano, criando se não existir"""
    plan_limits = session.exec(
        select(PlanLimitDefaults).where(PlanLimitDefaults.plan_type == plan_type)
    ).first()
    
    if not plan_limits:
        # Criar limites padrão baseado no tipo de plano
        defaults = {
            PlanType.STARTER: {
                "max_leads": 100,
                "max_users": 3,
                "max_items": 50,
                "max_api_calls": 1000
            },
            PlanType.PROFESSIONAL: {
                "max_leads": 1000,
                "max_users": 10,
                "max_items": 500,
                "max_api_calls": 10000
            },
            PlanType.ENTERPRISE: {
                "max_leads": -1,  # Ilimitado
                "max_users": -1,
                "max_items": -1,
                "max_api_calls": -1
            }
        }
        
        plan_limits = PlanLimitDefaults(
            plan_type=plan_type,
            **defaults.get(plan_type, defaults[PlanType.STARTER])
        )
        session.add(plan_limits)
        session.commit()
        session.refresh(plan_limits)
    
    return plan_limits


@router.get("/usage/plan-limits", response_model=List[PlanLimitDefaultsResponse])
async def get_plan_limits(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar limites padrão de todos os tipos de plano (apenas admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem visualizar limites de planos"
        )
    
    # Garantir que todos os planos tenham limites definidos
    for plan_type in PlanType:
        get_default_limits_for_plan(session, plan_type)
    
    all_limits = session.exec(select(PlanLimitDefaults)).all()
    return [
        PlanLimitDefaultsResponse(
            plan_type=limit.plan_type.value,
            max_leads=limit.max_leads,
            max_users=limit.max_users,
            max_items=limit.max_items,
            max_api_calls=limit.max_api_calls,
            max_tokens=getattr(limit, 'max_tokens', 100000),
            created_at=limit.created_at.isoformat(),
            updated_at=limit.updated_at.isoformat()
        )
        for limit in all_limits
    ]


@router.get("/usage/plan-limits/{plan_type}", response_model=PlanLimitDefaultsResponse)
async def get_plan_limit(
    plan_type: PlanType,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Obter limites padrão de um tipo de plano específico (apenas admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem visualizar limites de planos"
        )
    
    plan_limits = get_default_limits_for_plan(session, plan_type)
    return PlanLimitDefaultsResponse(
        plan_type=plan_limits.plan_type.value,
        max_leads=plan_limits.max_leads,
        max_users=plan_limits.max_users,
        max_items=plan_limits.max_items,
        max_api_calls=plan_limits.max_api_calls,
        max_tokens=getattr(plan_limits, 'max_tokens', 100000),
        created_at=plan_limits.created_at.isoformat(),
        updated_at=plan_limits.updated_at.isoformat()
    )


@router.put("/usage/plan-limits/{plan_type}", response_model=PlanLimitDefaultsResponse)
async def update_plan_limits(
    plan_type: PlanType,
    limits_data: UpdatePlanLimitDefaultsRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar limites padrão de um tipo de plano (apenas admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem atualizar limites de planos"
        )
    
    plan_limits = get_default_limits_for_plan(session, plan_type)
    
    # Atualizar campos fornecidos
    if limits_data.max_leads is not None:
        plan_limits.max_leads = limits_data.max_leads
    if limits_data.max_users is not None:
        plan_limits.max_users = limits_data.max_users
    if limits_data.max_items is not None:
        plan_limits.max_items = limits_data.max_items
    if limits_data.max_api_calls is not None:
        plan_limits.max_api_calls = limits_data.max_api_calls
    if limits_data.max_tokens is not None:
        plan_limits.max_tokens = limits_data.max_tokens
    
    plan_limits.updated_at = datetime.utcnow()
    session.add(plan_limits)
    session.commit()
    session.refresh(plan_limits)
    
    return PlanLimitDefaultsResponse(
        plan_type=plan_limits.plan_type.value,
        max_leads=plan_limits.max_leads,
        max_users=plan_limits.max_users,
        max_items=plan_limits.max_items,
        max_api_calls=plan_limits.max_api_calls,
        max_tokens=getattr(plan_limits, 'max_tokens', 100000),
        created_at=plan_limits.created_at.isoformat(),
        updated_at=plan_limits.updated_at.isoformat()
    )


@router.put("/usage/limits", response_model=dict)
async def update_tenant_limits(
    limits_data: UpdateTenantLimitsRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar limites do tenant atual (apenas admin do tenant)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem atualizar limites do tenant"
        )
    
    tenant_id = current_user.tenant_id
    tenant_limit = session.exec(
        select(TenantLimit).where(TenantLimit.tenant_id == tenant_id)
    ).first()
    
    if not tenant_limit:
        # Se não existir, criar usando limites padrão do plan_type
        plan_type = limits_data.plan_type or PlanType.STARTER
        default_limits = get_default_limits_for_plan(session, plan_type)
        
        tenant_limit = TenantLimit(
            tenant_id=tenant_id,
            plan_type=plan_type,
            max_leads=default_limits.max_leads,
            max_users=default_limits.max_users,
            max_items=default_limits.max_items,
            max_api_calls=default_limits.max_api_calls
        )
        session.add(tenant_limit)
    else:
        # Se mudou o plan_type, atualizar limites usando os padrões do novo plano
        if limits_data.plan_type and limits_data.plan_type != tenant_limit.plan_type:
            default_limits = get_default_limits_for_plan(session, limits_data.plan_type)
            tenant_limit.plan_type = limits_data.plan_type
            # Aplicar limites padrão apenas se não foram especificados explicitamente
            if limits_data.max_leads is None:
                tenant_limit.max_leads = default_limits.max_leads
            if limits_data.max_users is None:
                tenant_limit.max_users = default_limits.max_users
            if limits_data.max_items is None:
                tenant_limit.max_items = default_limits.max_items
            if limits_data.max_api_calls is None:
                tenant_limit.max_api_calls = default_limits.max_api_calls
            if limits_data.max_tokens is None:
                tenant_limit.max_tokens = getattr(default_limits, 'max_tokens', 100000)
    
    # Atualizar campos fornecidos explicitamente
    if limits_data.max_leads is not None:
        tenant_limit.max_leads = limits_data.max_leads
    if limits_data.max_users is not None:
        tenant_limit.max_users = limits_data.max_users
    if limits_data.max_items is not None:
        tenant_limit.max_items = limits_data.max_items
    if limits_data.max_api_calls is not None:
        tenant_limit.max_api_calls = limits_data.max_api_calls
    if limits_data.max_tokens is not None:
        tenant_limit.max_tokens = limits_data.max_tokens
    
    tenant_limit.updated_at = datetime.utcnow()
    session.add(tenant_limit)
    session.commit()
    session.refresh(tenant_limit)
    
    return {
        "message": "Limites atualizados com sucesso",
        "limits": {
            "plan_type": tenant_limit.plan_type.value,
            "max_leads": tenant_limit.max_leads,
            "max_users": tenant_limit.max_users,
            "max_items": tenant_limit.max_items,
            "max_api_calls": tenant_limit.max_api_calls,
            "max_tokens": tenant_limit.max_tokens
        }
    }


@router.post("/usage/limits/leads/unlimited")
async def set_unlimited_leads(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Definir limite de leads como ilimitado para o tenant atual (apenas admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem definir limites ilimitados"
        )
    
    tenant_id = current_user.tenant_id
    tenant_limit = session.exec(
        select(TenantLimit).where(TenantLimit.tenant_id == tenant_id)
    ).first()
    
    if not tenant_limit:
        tenant_limit = TenantLimit(
            tenant_id=tenant_id,
            plan_type=PlanType.ENTERPRISE,
            max_leads=-1,
            max_users=3,
            max_items=50,
            max_api_calls=1000,
            max_tokens=100000
        )
        session.add(tenant_limit)
    else:
        tenant_limit.max_leads = -1
        tenant_limit.updated_at = datetime.utcnow()
    
    session.add(tenant_limit)
    session.commit()
    session.refresh(tenant_limit)
    
    return {
        "message": "Limite de leads definido como ilimitado com sucesso",
        "max_leads": tenant_limit.max_leads
    }


@router.post("/usage/limits/unlimited")
async def set_unlimited_limits(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Definir todos os limites como ilimitados para o tenant atual (apenas admin)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem definir limites ilimitados"
        )
    
    tenant_id = current_user.tenant_id
    tenant_limit = session.exec(
        select(TenantLimit).where(TenantLimit.tenant_id == tenant_id)
    ).first()
    
    if not tenant_limit:
        tenant_limit = TenantLimit(
            tenant_id=tenant_id,
            plan_type=PlanType.ENTERPRISE,
            max_leads=-1,
            max_users=-1,
            max_items=-1,
            max_api_calls=-1,
            max_tokens=-1
        )
        session.add(tenant_limit)
    else:
        tenant_limit.plan_type = PlanType.ENTERPRISE
        tenant_limit.max_leads = -1
        tenant_limit.max_users = -1
        tenant_limit.max_items = -1
        tenant_limit.max_api_calls = -1
        tenant_limit.max_tokens = -1
        tenant_limit.updated_at = datetime.utcnow()
    
    session.add(tenant_limit)
    session.commit()
    session.refresh(tenant_limit)
    
    return {
        "message": "Limites definidos como ilimitados com sucesso",
        "limits": {
            "plan_type": tenant_limit.plan_type.value,
            "max_leads": tenant_limit.max_leads,
            "max_users": tenant_limit.max_users,
            "max_items": tenant_limit.max_items,
            "max_api_calls": tenant_limit.max_api_calls,
            "max_tokens": tenant_limit.max_tokens
        }
    }

