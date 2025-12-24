"""
Rotas de debug - Remover em produção!
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.database import get_session
from app.models import User, Tenant
from app.agents.researcher_agent import enrich_via_rapidapi_linkedin
from app.config import settings
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


@router.get("/tenants")
async def list_tenants(session: Session = Depends(get_session)):
    """Lista todos os tenants (apenas para debug)"""
    tenants = session.exec(select(Tenant)).all()
    result = []
    for tenant in tenants:
        users = session.exec(select(User).where(User.tenant_id == tenant.id)).all()
        result.append({
            "id": tenant.id,
            "name": tenant.name,
            "company_name": tenant.company_name,
            "user_count": len(users),
            "users": [{"id": u.id, "email": u.email} for u in users]
        })
    return {"tenants": result}


@router.delete("/cleanup-orphan-tenants")
async def cleanup_orphan_tenants(session: Session = Depends(get_session)):
    """Remove tenants sem usuários (apenas para debug)"""
    tenants = session.exec(select(Tenant)).all()
    deleted = 0
    for tenant in tenants:
        users = session.exec(select(User).where(User.tenant_id == tenant.id)).all()
        if not users:
            session.delete(tenant)
            deleted += 1
    session.commit()
    return {"message": f"Deleted {deleted} orphan tenants"}


class TestLinkedInRequest(BaseModel):
    linkedin_url: str
    name: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    email: Optional[str] = None


@router.post("/test-linkedin-enrichment")
async def test_linkedin_enrichment(request: TestLinkedInRequest):
    """Testa o enriquecimento via RapidAPI LinkedIn (apenas para debug)"""
    # Verificar se a API key está configurada
    if not settings.rapidapi_key:
        raise HTTPException(
            status_code=400,
            detail="RAPIDAPI_KEY não configurada no .env"
        )
    
    # Preparar lead_info
    lead_info = {
        "name": request.name or "Test Lead",
        "company": request.company or "",
        "position": request.position or "",
        "email": request.email or "",
        "linkedin_url": request.linkedin_url
    }
    
    # Executar enriquecimento
    try:
        result = await enrich_via_rapidapi_linkedin(request.linkedin_url, lead_info)
        return {
            "success": result.get("success", False),
            "enriched_data": result.get("enriched_data", {}),
            "error": result.get("error"),
            "method": result.get("method"),
            "sources": result.get("sources", []),
            "config": {
                "rapidapi_key_configured": settings.rapidapi_key is not None,
                "rapidapi_key_length": len(settings.rapidapi_key) if settings.rapidapi_key else 0,
                "rapidapi_linkedin_host": settings.rapidapi_linkedin_host
            }
        }
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "config": {
                "rapidapi_key_configured": settings.rapidapi_key is not None,
                "rapidapi_key_length": len(settings.rapidapi_key) if settings.rapidapi_key else 0,
                "rapidapi_linkedin_host": settings.rapidapi_linkedin_host
            }
        }
