"""
Rotas de debug - Remover em produção!
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.database import get_session
from app.models import User, Tenant

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





