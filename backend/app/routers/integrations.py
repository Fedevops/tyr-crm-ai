"""
Router para gerenciar integrações de tenant
"""
import os
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select, and_
from app.database import get_session
from app.models import (
    User, TenantIntegration, IntegrationType,
    TenantIntegrationCreate, TenantIntegrationUpdate, TenantIntegrationResponse
)
from app.dependencies import get_current_active_user, require_ownership
from app.services.encryption_service import encrypt_credentials, decrypt_credentials
from app.services.audit_service import log_create, log_update, log_delete

logger = logging.getLogger(__name__)

router = APIRouter()


def get_integration_or_404(
    integration_type: IntegrationType,
    tenant_id: int,
    session: Session
) -> Optional[TenantIntegration]:
    """Busca integração ou retorna None"""
    integration = session.exec(
        select(TenantIntegration).where(
            and_(
                TenantIntegration.tenant_id == tenant_id,
                TenantIntegration.integration_type == integration_type
            )
        )
    ).first()
    return integration


@router.get("", response_model=List[TenantIntegrationResponse])
async def get_integrations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar todas as integrações do tenant"""
    integrations = session.exec(
        select(TenantIntegration).where(
            TenantIntegration.tenant_id == current_user.tenant_id
        )
    ).all()
    
    return [
        TenantIntegrationResponse(
            id=integration.id,
            tenant_id=integration.tenant_id,
            integration_type=integration.integration_type.value,
            is_active=integration.is_active,
            config=integration.config,
            last_sync_at=integration.last_sync_at,
            created_at=integration.created_at,
            updated_at=integration.updated_at
        )
        for integration in integrations
    ]


@router.get("/{integration_type}", response_model=TenantIntegrationResponse)
async def get_integration(
    integration_type: IntegrationType,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Obter integração específica"""
    integration = get_integration_or_404(
        integration_type, current_user.tenant_id, session
    )
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration {integration_type.value} not found"
        )
    
    return TenantIntegrationResponse(
        id=integration.id,
        tenant_id=integration.tenant_id,
        integration_type=integration.integration_type.value,
        is_active=integration.is_active,
        config=integration.config,
        last_sync_at=integration.last_sync_at,
        created_at=integration.created_at,
        updated_at=integration.updated_at
    )


@router.post("/{integration_type}/connect", response_model=TenantIntegrationResponse)
async def connect_integration(
    integration_type: IntegrationType,
    integration_data: TenantIntegrationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Conectar integração"""
    # Verificar se já existe
    existing = get_integration_or_404(
        integration_type, current_user.tenant_id, session
    )
    
    # Criptografar credenciais se fornecidas
    credentials_encrypted = None
    if integration_data.credentials:
        try:
            credentials_encrypted = encrypt_credentials(integration_data.credentials)
        except Exception as e:
            logger.error(f"Erro ao criptografar credenciais: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falha ao criptografar credenciais"
            )
    
    if existing:
        # Atualizar existente
        if credentials_encrypted:
            existing.credentials_encrypted = credentials_encrypted
        if integration_data.config:
            existing.config = integration_data.config
        existing.is_active = integration_data.is_active
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        log_update(session, current_user, "TenantIntegration", existing.id)
        
        return TenantIntegrationResponse(
            id=existing.id,
            tenant_id=existing.tenant_id,
            integration_type=existing.integration_type.value,
            is_active=existing.is_active,
            config=existing.config,
            last_sync_at=existing.last_sync_at,
            created_at=existing.created_at,
            updated_at=existing.updated_at
        )
    else:
        # Criar nova
        integration = TenantIntegration(
            tenant_id=current_user.tenant_id,
            integration_type=integration_type,
            is_active=integration_data.is_active,
            credentials_encrypted=credentials_encrypted,
            config=integration_data.config
        )
        session.add(integration)
        session.commit()
        session.refresh(integration)
        log_create(session, current_user, "TenantIntegration", integration.id)
        
        return TenantIntegrationResponse(
            id=integration.id,
            tenant_id=integration.tenant_id,
            integration_type=integration.integration_type.value,
            is_active=integration.is_active,
            config=integration.config,
            last_sync_at=integration.last_sync_at,
            created_at=integration.created_at,
            updated_at=integration.updated_at
        )


@router.put("/{integration_type}", response_model=TenantIntegrationResponse)
async def update_integration(
    integration_type: IntegrationType,
    integration_data: TenantIntegrationUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar configuração de integração"""
    integration = get_integration_or_404(
        integration_type, current_user.tenant_id, session
    )
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration {integration_type.value} not found"
        )
    
    # Atualizar credenciais se fornecidas
    if integration_data.credentials:
        try:
            integration.credentials_encrypted = encrypt_credentials(integration_data.credentials)
        except Exception as e:
            logger.error(f"Erro ao criptografar credenciais: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falha ao criptografar credenciais"
            )
    
    if integration_data.config is not None:
        integration.config = integration_data.config
    
    if integration_data.is_active is not None:
        integration.is_active = integration_data.is_active
    
    integration.updated_at = datetime.utcnow()
    session.add(integration)
    session.commit()
    session.refresh(integration)
    log_update(session, current_user, "TenantIntegration", integration.id)
    
    return TenantIntegrationResponse(
        id=integration.id,
        tenant_id=integration.tenant_id,
        integration_type=integration.integration_type.value,
        is_active=integration.is_active,
        config=integration.config,
        last_sync_at=integration.last_sync_at,
        created_at=integration.created_at,
        updated_at=integration.updated_at
    )


@router.delete("/{integration_type}")
async def disconnect_integration(
    integration_type: IntegrationType,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Desconectar integração"""
    integration = get_integration_or_404(
        integration_type, current_user.tenant_id, session
    )
    
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration {integration_type.value} not found"
        )
    
    integration_id = integration.id
    session.delete(integration)
    session.commit()
    log_delete(session, current_user, "TenantIntegration", integration_id)
    
    return {"message": f"Integration {integration_type.value} disconnected successfully"}


@router.get("/{integration_type}/test")
async def test_integration(
    integration_type: IntegrationType,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Testar conexão de integração"""
    integration = get_integration_or_404(
        integration_type, current_user.tenant_id, session
    )
    
    if not integration or not integration.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration {integration_type.value} not found or not active"
        )
    
    # Descriptografar credenciais
    try:
        credentials = decrypt_credentials(integration.credentials_encrypted) if integration.credentials_encrypted else {}
    except Exception as e:
        logger.error(f"Erro ao descriptografar credenciais: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao descriptografar credenciais"
        )
    
    # Testar conexão baseado no tipo
    try:
        if integration_type == IntegrationType.WHATSAPP_TWILIO:
            from twilio.rest import Client
            account_sid = credentials.get("account_sid")
            auth_token = credentials.get("auth_token")
            if not account_sid or not auth_token:
                raise ValueError("account_sid e auth_token são obrigatórios")
            client = Client(account_sid, auth_token)
            # Testar listando contas (operação simples)
            client.api.accounts.list(limit=1)
            return {"status": "success", "message": "Conexão com Twilio bem-sucedida"}
        
        elif integration_type == IntegrationType.EMAIL_SMTP:
            import smtplib
            smtp_host = credentials.get("smtp_host")
            smtp_port = credentials.get("smtp_port", 587)
            smtp_user = credentials.get("smtp_user")
            smtp_password = credentials.get("smtp_password")
            if not smtp_host or not smtp_user or not smtp_password:
                raise ValueError("smtp_host, smtp_user e smtp_password são obrigatórios")
            # Testar conexão SMTP
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.quit()
            return {"status": "success", "message": "Conexão SMTP bem-sucedida"}
        
        elif integration_type == IntegrationType.EMAIL_IMAP:
            import imaplib
            imap_host = credentials.get("imap_host")
            imap_port = credentials.get("imap_port", 993)
            imap_user = credentials.get("imap_user")
            imap_password = credentials.get("imap_password")
            if not imap_host or not imap_user or not imap_password:
                raise ValueError("imap_host, imap_user e imap_password são obrigatórios")
            # Testar conexão IMAP
            mail = imaplib.IMAP4_SSL(imap_host, imap_port)
            mail.login(imap_user, imap_password)
            mail.logout()
            return {"status": "success", "message": "Conexão IMAP bem-sucedida"}
        
        elif integration_type == IntegrationType.TOTVS:
            # Teste genérico para TOTVS (requer endpoint configurado)
            import requests
            api_url = credentials.get("api_url")
            api_key = credentials.get("api_key")
            if not api_url or not api_key:
                raise ValueError("api_url e api_key são obrigatórios")
            # Fazer requisição de teste
            response = requests.get(
                f"{api_url}/health",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=5
            )
            response.raise_for_status()
            return {"status": "success", "message": "Conexão com TOTVS bem-sucedida"}
        
        elif integration_type == IntegrationType.SALESFORCE:
            # Teste genérico para Salesforce
            import requests
            instance_url = credentials.get("instance_url")
            access_token = credentials.get("access_token")
            if not instance_url or not access_token:
                raise ValueError("instance_url e access_token são obrigatórios")
            # Fazer requisição de teste
            response = requests.get(
                f"{instance_url}/services/data/v57.0/",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=5
            )
            response.raise_for_status()
            return {"status": "success", "message": "Conexão com Salesforce bem-sucedida"}
        
        else:
            return {"status": "error", "message": f"Tipo de integração {integration_type.value} não suporta teste automático"}
    
    except Exception as e:
        logger.error(f"Erro ao testar integração {integration_type.value}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Falha ao testar conexão: {str(e)}"
        )


# OAuth2 para Google Calendar
@router.get("/google-calendar/oauth/authorize")
async def google_calendar_oauth_authorize(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Iniciar fluxo OAuth2 do Google Calendar"""
    try:
        from google_auth_oauthlib.flow import Flow
        from google.oauth2.credentials import Credentials
        
        # Configurações OAuth2 (devem estar em variáveis de ambiente)
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/settings/integrations")
        
        if not client_id or not client_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Google OAuth2 não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET"
            )
        
        # Criar flow OAuth2
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=["https://www.googleapis.com/auth/calendar"]
        )
        flow.redirect_uri = redirect_uri
        
        # Gerar URL de autorização
        authorization_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent"  # Forçar consent para obter refresh_token
        )
        
        # Salvar state no config da integração (temporário)
        integration = get_integration_or_404(
            IntegrationType.GOOGLE_CALENDAR, current_user.tenant_id, session
        )
        if not integration:
            integration = TenantIntegration(
                tenant_id=current_user.tenant_id,
                integration_type=IntegrationType.GOOGLE_CALENDAR,
                is_active=False,
                config={"oauth_state": state}
            )
            session.add(integration)
        else:
            if not integration.config:
                integration.config = {}
            integration.config["oauth_state"] = state
            session.add(integration)
        session.commit()
        
        return RedirectResponse(url=authorization_url)
    
    except Exception as e:
        logger.error(f"Erro ao iniciar OAuth2 do Google: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao iniciar OAuth2: {str(e)}"
        )


@router.get("/google-calendar/oauth/callback")
async def google_calendar_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Callback OAuth2 do Google Calendar"""
    try:
        from google_auth_oauthlib.flow import Flow
        from google.oauth2.credentials import Credentials
        
        # Buscar integração pelo state
        integration = get_integration_or_404(
            IntegrationType.GOOGLE_CALENDAR, current_user.tenant_id, session
        )
        
        if not integration or not integration.config or integration.config.get("oauth_state") != state:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="State inválido ou integração não encontrada"
            )
        
        # Configurações OAuth2
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/settings/integrations")
        
        # Criar flow e trocar code por tokens
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=["https://www.googleapis.com/auth/calendar"],
            state=state
        )
        flow.redirect_uri = redirect_uri
        
        # Trocar authorization code por tokens
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Criptografar e salvar credenciais
        credentials_dict = {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": credentials.scopes
        }
        
        integration.credentials_encrypted = encrypt_credentials(credentials_dict)
        integration.is_active = True
        if integration.config:
            integration.config.pop("oauth_state", None)
        integration.updated_at = datetime.utcnow()
        session.add(integration)
        session.commit()
        session.refresh(integration)
        
        log_update(session, current_user, "TenantIntegration", integration.id)
        
        # Redirecionar para frontend
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(url=f"{frontend_url}/settings/integrations?success=google_calendar")
    
    except Exception as e:
        logger.error(f"Erro no callback OAuth2 do Google: {e}")
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(url=f"{frontend_url}/settings/integrations?error=oauth_failed")

