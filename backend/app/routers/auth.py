from datetime import timedelta
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models import User, UserCreate, UserLogin, UserResponse, Tenant
from app.auth import verify_password, get_password_hash, create_access_token
from app.config import settings
from app.dependencies import get_current_active_user

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register(
    user_data: UserCreate,
    session: Session = Depends(get_session)
):
    """Register a new user and create a tenant"""
    try:
        # Check if user already exists
        existing_user = session.exec(
            select(User).where(User.email == user_data.email)
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Check if tenant name already exists
        existing_tenant = session.exec(
            select(Tenant).where(Tenant.name == user_data.tenant_name)
        ).first()
        
        if existing_tenant:
            # Verificar se o tenant tem usuários associados
            tenant_users = session.exec(
                select(User).where(User.tenant_id == existing_tenant.id)
            ).all()
            
            if tenant_users:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tenant name already exists. Please choose a different company name."
                )
            else:
                # Tenant órfão (sem usuários) - podemos reutilizar
                # Mas por segurança, vamos criar um novo com sufixo
                tenant_name = f"{user_data.tenant_name}-{uuid.uuid4().hex[:8]}"
                tenant = Tenant(
                    name=tenant_name,
                    company_name=user_data.tenant_name
                )
        else:
            # Create new tenant
            tenant = Tenant(
                name=user_data.tenant_name,
                company_name=user_data.tenant_name
            )
        
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        
        # Create user
        # A validação do Pydantic já foi executada ao criar UserCreate
        # Mas vamos garantir que a senha está dentro do limite antes de fazer hash
        password = user_data.password
        password_bytes = password.encode('utf-8')
        if len(password_bytes) > 72:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is too long. Maximum length is 72 characters."
            )
        
        hashed_password = get_password_hash(password)
        user = User(
            email=user_data.email,
            full_name=user_data.full_name,
            hashed_password=hashed_password,
            tenant_id=tenant.id
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
        return UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            tenant_id=user.tenant_id,
            is_active=user.is_active
        )
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except ValueError as e:
        # Erros de validação do Pydantic
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        # Rollback em caso de erro
        session.rollback()
        # Log do erro completo para debug
        import traceback
        error_detail = str(e)
        # Se for erro do passlib sobre tamanho de senha, dar mensagem mais clara
        if "password cannot be longer than 72 bytes" in error_detail.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is too long. Maximum length is 72 characters. Please use a shorter password."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during registration: {error_detail}"
        )


@router.post("/login")
async def login(
    credentials: UserLogin,
    session: Session = Depends(get_session)
):
    """Login and get access token"""
    user = session.exec(
        select(User).where(User.email == credentials.email)
    ).first()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "tenant_id": user.tenant_id},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            tenant_id=user.tenant_id,
            is_active=user.is_active
        )
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user information"""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        tenant_id=current_user.tenant_id,
        is_active=current_user.is_active
    )

