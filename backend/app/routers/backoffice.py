from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, func, and_, or_, desc
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi.responses import JSONResponse
from app.database import get_session
from app.dependencies import get_current_active_user, require_ownership
from app.models import (
    User, UserRole, Partner, PartnerCreate, PartnerUpdate, PartnerResponse,
    Commission, CommissionCreate, CommissionUpdate, CommissionResponse, CommissionStatus,
    Tenant, PartnerStatus, PartnerLevel, PartnerUserCreateWithoutPassword
)
from app.models import PartnerUser, PartnerUserCreate, PartnerUserResponse
from app.auth import get_password_hash
import secrets
import string

router = APIRouter(prefix="/api/backoffice", tags=["Backoffice"])


def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Verifica se o usuário tem email autorizado"""
    ALLOWED_EMAIL = "fernando.silva@tyr-ai.com.br"
    
    if current_user.email != ALLOWED_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Apenas o administrador autorizado pode acessar esta área."
        )
    
    return current_user


# ==================== DASHBOARD ====================

@router.get("/dashboard")
async def get_backoffice_dashboard(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Dashboard principal do Backoffice com estatísticas"""
    
    # Total de parceiros ativos
    total_parceiros_ativos = session.exec(
        select(func.count(Partner.id)).where(Partner.status == PartnerStatus.ATIVO)
    ).one() or 0
    
    # Volume de vendas por parceiros este mês
    inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    volume_vendas_mes = session.exec(
        select(func.sum(Commission.valor_venda)).where(
            and_(
                Commission.data_pagamento >= inicio_mes,
                Commission.status_comissao == CommissionStatus.PAGO
            )
        )
    ).one() or 0.0
    
    # Comissões a pagar (pendentes)
    comissoes_pagar = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            Commission.status_comissao == CommissionStatus.PENDENTE
        )
    ).one() or 0.0
    
    # Total de parceiros (todos os status)
    total_parceiros = session.exec(
        select(func.count(Partner.id))
    ).one() or 0
    
    # Parceiros pendentes
    parceiros_pendentes = session.exec(
        select(func.count(Partner.id)).where(Partner.status == PartnerStatus.PENDENTE)
    ).one() or 0
    
    # Total de clientes vendidos via parceiros
    total_clientes_parceiros = session.exec(
        select(func.count(Tenant.id)).where(Tenant.partner_id.isnot(None))
    ).one() or 0
    
    # Comissões pagas este mês
    comissoes_pagas_mes = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.data_pagamento >= inicio_mes,
                Commission.status_comissao == CommissionStatus.PAGO
            )
        )
    ).one() or 0.0
    
    return {
        "total_parceiros_ativos": total_parceiros_ativos,
        "volume_vendas_mes": float(volume_vendas_mes),
        "comissoes_pagar": float(comissoes_pagar),
        "total_parceiros": total_parceiros,
        "parceiros_pendentes": parceiros_pendentes,
        "total_clientes_parceiros": total_clientes_parceiros,
        "comissoes_pagas_mes": float(comissoes_pagas_mes)
    }


# ==================== GESTÃO DE USUÁRIOS DE PARCEIROS ====================

@router.get("/partners/{partner_id}/users", response_model=List[PartnerUserResponse])
async def list_partner_users(
    partner_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Listar usuários de um parceiro"""
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parceiro não encontrado"
        )
    
    users = session.exec(
        select(PartnerUser).where(PartnerUser.partner_id == partner_id)
    ).all()
    
    return users

@router.post("/partners/{partner_id}/users")  # Remover response_model=PartnerUserResponse
async def create_partner_user(
    partner_id: int,
    user_data: PartnerUserCreateWithoutPassword,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Criar usuário para um parceiro com senha gerada automaticamente"""
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parceiro não encontrado"
        )
    
    # Verificar se email já existe
    existing_user = session.exec(
        select(PartnerUser).where(PartnerUser.email == user_data.email)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )
    
    # Gerar senha aleatória (12 caracteres: letras, números e símbolos)
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    password = ''.join(secrets.choice(alphabet) for i in range(12))
    
    # Criar usuário
    hashed_password = get_password_hash(password)
    partner_user = PartnerUser(
        partner_id=partner_id,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hashed_password,
        is_active=user_data.is_active if user_data.is_active is not None else True,
        is_owner=user_data.is_owner if user_data.is_owner is not None else False,
        role=user_data.role if user_data.role else "partner_user"
    )
    
    session.add(partner_user)
    session.commit()
    session.refresh(partner_user)
    
    # Retornar resposta com senha temporária (apenas na criação)
    response_dict = {
        "id": partner_user.id,
        "email": partner_user.email,
        "full_name": partner_user.full_name,
        "is_active": partner_user.is_active,
        "is_owner": partner_user.is_owner,
        "role": partner_user.role,
        "partner_id": partner_user.partner_id,
        "created_at": partner_user.created_at.isoformat() if partner_user.created_at else None,
        "updated_at": partner_user.updated_at.isoformat() if partner_user.updated_at else None,
        "temporary_password": password  # Senha temporária - IMPORTANTE!
    }
    
    return JSONResponse(content=response_dict, status_code=200)


@router.delete("/partners/{partner_id}/users/{user_id}")
async def delete_partner_user(
    partner_id: int,
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Deletar usuário de parceiro"""
    partner_user = session.get(PartnerUser, user_id)
    if not partner_user or partner_user.partner_id != partner_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    session.delete(partner_user)
    session.commit()
    
    return {"message": "Usuário deletado com sucesso"}


@router.get("/partners", response_model=List[PartnerResponse])
async def list_partners(
    status_filter: Optional[PartnerStatus] = Query(None, alias="status"),
    nivel_filter: Optional[PartnerLevel] = Query(None, alias="nivel"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Listar todos os parceiros com filtros"""
    query = select(Partner)
    
    if status_filter:
        query = query.where(Partner.status == status_filter)
    
    if nivel_filter:
        query = query.where(Partner.nivel == nivel_filter)
    
    query = query.order_by(desc(Partner.created_at)).offset(skip).limit(limit)
    partners = session.exec(query).all()
    
    # Adicionar estatísticas para cada parceiro
    result = []
    for partner in partners:
        partner_dict = partner.model_dump()
        
        # Total de comissões
        total_comissoes = session.exec(
            select(func.sum(Commission.valor_pago)).where(Commission.partner_id == partner.id)
        ).one() or 0.0
        
        # Comissões pagas
        comissoes_pagas = session.exec(
            select(func.sum(Commission.valor_pago)).where(
                and_(
                    Commission.partner_id == partner.id,
                    Commission.status_comissao == CommissionStatus.PAGO
                )
            )
        ).one() or 0.0
        
        # Comissões pendentes
        comissoes_pendentes = session.exec(
            select(func.sum(Commission.valor_pago)).where(
                and_(
                    Commission.partner_id == partner.id,
                    Commission.status_comissao == CommissionStatus.PENDENTE
                )
            )
        ).one() or 0.0
        
        # Total de clientes
        total_clientes = session.exec(
            select(func.count(Tenant.id)).where(Tenant.partner_id == partner.id)
        ).one() or 0
        
        partner_dict["total_comissoes"] = float(total_comissoes)
        partner_dict["comissoes_pagas"] = float(comissoes_pagas)
        partner_dict["comissoes_pendentes"] = float(comissoes_pendentes)
        partner_dict["total_clientes"] = total_clientes
        
        result.append(PartnerResponse(**partner_dict))
    
    return result


@router.get("/partners/{partner_id}", response_model=PartnerResponse)
async def get_partner(
    partner_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Obter detalhes de um parceiro"""
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parceiro não encontrado"
        )
    
    partner_dict = partner.model_dump()
    
    # Adicionar estatísticas
    total_comissoes = session.exec(
        select(func.sum(Commission.valor_pago)).where(Commission.partner_id == partner.id)
    ).one() or 0.0
    
    comissoes_pagas = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == partner.id,
                Commission.status_comissao == CommissionStatus.PAGO
            )
        )
    ).one() or 0.0
    
    comissoes_pendentes = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == partner.id,
                Commission.status_comissao == CommissionStatus.PENDENTE
            )
        )
    ).one() or 0.0
    
    total_clientes = session.exec(
        select(func.count(Tenant.id)).where(Tenant.partner_id == partner.id)
    ).one() or 0
    
    partner_dict["total_comissoes"] = float(total_comissoes)
    partner_dict["comissoes_pagas"] = float(comissoes_pagas)
    partner_dict["comissoes_pendentes"] = float(comissoes_pendentes)
    partner_dict["total_clientes"] = total_clientes
    
    return PartnerResponse(**partner_dict)


@router.post("/partners", response_model=PartnerResponse)
async def create_partner(
    partner_data: PartnerCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Criar novo parceiro"""
    # Verificar se CNPJ já existe
    if partner_data.cnpj:
        existing = session.exec(
            select(Partner).where(Partner.cnpj == partner_data.cnpj)
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CNPJ já cadastrado"
            )
    
    partner = Partner(**partner_data.model_dump())
    session.add(partner)
    session.commit()
    session.refresh(partner)
    
    partner_dict = partner.model_dump()
    partner_dict["total_comissoes"] = 0.0
    partner_dict["comissoes_pagas"] = 0.0
    partner_dict["comissoes_pendentes"] = 0.0
    partner_dict["total_clientes"] = 0
    
    return PartnerResponse(**partner_dict)


@router.put("/partners/{partner_id}", response_model=PartnerResponse)
async def update_partner(
    partner_id: int,
    partner_data: PartnerUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Atualizar parceiro"""
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parceiro não encontrado"
        )
    
    # Verificar se CNPJ já existe (se estiver sendo alterado)
    if partner_data.cnpj and partner_data.cnpj != partner.cnpj:
        existing = session.exec(
            select(Partner).where(
                and_(
                    Partner.cnpj == partner_data.cnpj,
                    Partner.id != partner_id
                )
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CNPJ já cadastrado"
            )
    
    # Atualizar campos
    update_data = partner_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(partner, field, value)
    
    partner.updated_at = datetime.utcnow()
    session.add(partner)
    session.commit()
    session.refresh(partner)
    
    partner_dict = partner.model_dump()
    
    # Adicionar estatísticas
    total_comissoes = session.exec(
        select(func.sum(Commission.valor_pago)).where(Commission.partner_id == partner.id)
    ).one() or 0.0
    
    comissoes_pagas = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == partner.id,
                Commission.status_comissao == CommissionStatus.PAGO
            )
        )
    ).one() or 0.0
    
    comissoes_pendentes = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == partner.id,
                Commission.status_comissao == CommissionStatus.PENDENTE
            )
        )
    ).one() or 0.0
    
    total_clientes = session.exec(
        select(func.count(Tenant.id)).where(Tenant.partner_id == partner.id)
    ).one() or 0
    
    partner_dict["total_comissoes"] = float(total_comissoes)
    partner_dict["comissoes_pagas"] = float(comissoes_pagas)
    partner_dict["comissoes_pendentes"] = float(comissoes_pendentes)
    partner_dict["total_clientes"] = total_clientes
    
    return PartnerResponse(**partner_dict)


@router.patch("/partners/{partner_id}/approve")
async def approve_partner(
    partner_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Aprovar parceiro (mudar status para ativo)"""
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parceiro não encontrado"
        )
    
    partner.status = PartnerStatus.ATIVO
    partner.updated_at = datetime.utcnow()
    session.add(partner)
    session.commit()
    
    return {"message": "Parceiro aprovado com sucesso", "status": "ativo"}


@router.delete("/partners/{partner_id}")
async def delete_partner(
    partner_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Deletar parceiro (soft delete - mudar status para inativo)"""
    partner = session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parceiro não encontrado"
        )
    
    # Verificar se há clientes associados
    clientes_count = session.exec(
        select(func.count(Tenant.id)).where(Tenant.partner_id == partner_id)
    ).one() or 0
    
    if clientes_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não é possível deletar parceiro com {clientes_count} cliente(s) associado(s). Desative o parceiro ao invés de deletar."
        )
    
    session.delete(partner)
    session.commit()
    
    return {"message": "Parceiro deletado com sucesso"}


# ==================== RELATÓRIO DE VENDAS ====================

@router.get("/sales-report")
async def get_sales_report(
    partner_id: Optional[int] = Query(None, description="Filtrar por parceiro"),
    data_inicio: Optional[datetime] = Query(None, description="Data inicial (YYYY-MM-DD)"),
    data_fim: Optional[datetime] = Query(None, description="Data final (YYYY-MM-DD)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Relatório de vendas (licenças vendidas via parceiros)"""
    
    # Buscar tenants que foram vendidos por parceiros
    query = select(Tenant).where(Tenant.partner_id.isnot(None))
    
    if partner_id:
        query = query.where(Tenant.partner_id == partner_id)
    
    if data_inicio:
        query = query.where(Tenant.created_at >= data_inicio)
    
    if data_fim:
        # Adicionar 1 dia para incluir o dia final
        data_fim_end = data_fim + timedelta(days=1)
        query = query.where(Tenant.created_at < data_fim_end)
    
    query = query.order_by(desc(Tenant.created_at)).offset(skip).limit(limit)
    tenants = session.exec(query).all()
    
    # Buscar parceiros para incluir nome
    partners_dict = {}
    if tenants:
        partner_ids = [t.partner_id for t in tenants if t.partner_id]
        if partner_ids:
            partners = session.exec(
                select(Partner).where(Partner.id.in_(partner_ids))
            ).all()
            partners_dict = {p.id: p for p in partners}
    
    # Montar resultado
    result = []
    for tenant in tenants:
        partner = partners_dict.get(tenant.partner_id) if tenant.partner_id else None
        
        # Buscar comissões relacionadas
        commissions = session.exec(
            select(Commission).where(
                and_(
                    Commission.customer_id == tenant.id,
                    Commission.partner_id == tenant.partner_id
                )
            ).order_by(desc(Commission.created_at))
        ).all()
        
        total_comissoes = sum(c.valor_pago for c in commissions)
        comissoes_pagas = sum(c.valor_pago for c in commissions if c.status_comissao == CommissionStatus.PAGO)
        comissoes_pendentes = sum(c.valor_pago for c in commissions if c.status_comissao == CommissionStatus.PENDENTE)
        
        result.append({
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "company_name": tenant.company_name,
            "partner_id": tenant.partner_id,
            "partner_nome": partner.nome if partner else None,
            "partner_cnpj": partner.cnpj if partner else None,
            "partner_nivel": partner.nivel.value if partner else None,
            "data_venda": tenant.created_at.isoformat(),
            "total_comissoes": float(total_comissoes),
            "comissoes_pagas": float(comissoes_pagas),
            "comissoes_pendentes": float(comissoes_pendentes),
            "total_comissoes_count": len(commissions)
        })
    
    # Total de registros (para paginação)
    count_query = select(func.count(Tenant.id)).where(Tenant.partner_id.isnot(None))
    if partner_id:
        count_query = count_query.where(Tenant.partner_id == partner_id)
    if data_inicio:
        count_query = count_query.where(Tenant.created_at >= data_inicio)
    if data_fim:
        data_fim_end = data_fim + timedelta(days=1)
        count_query = count_query.where(Tenant.created_at < data_fim_end)
    
    total = session.exec(count_query).one() or 0
    
    return {
        "items": result,
        "total": total,
        "skip": skip,
        "limit": limit
    }



# ==================== GESTÃO DE CLIENTES/TENANTS ====================

@router.get("/tenants")
async def list_tenants(
    partner_id: Optional[int] = Query(None, description="Filtrar por parceiro"),
    search: Optional[str] = Query(None, description="Buscar por nome ou empresa"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Listar todos os tenants (clientes) com seus usuários e status"""
    query = select(Tenant)
    
    if partner_id:
        query = query.where(Tenant.partner_id == partner_id)
    
    if search:
        query = query.where(
            or_(
                Tenant.name.ilike(f"%{search}%"),
                Tenant.company_name.ilike(f"%{search}%")
            )
        )
    
    query = query.order_by(desc(Tenant.created_at)).offset(skip).limit(limit)
    tenants = session.exec(query).all()
    
    # Buscar parceiros para incluir nome
    partners_dict = {}
    partner_ids = [t.partner_id for t in tenants if t.partner_id]
    if partner_ids:
        partners = session.exec(
            select(Partner).where(Partner.id.in_(partner_ids))
        ).all()
        partners_dict = {p.id: p for p in partners}
    
    # Montar resultado com usuários e status
    result = []
    for tenant in tenants:
        # Buscar usuários do tenant
        users = session.exec(
            select(User).where(User.tenant_id == tenant.id)
        ).all()
        
        # Contar usuários ativos
        active_users_count = sum(1 for u in users if u.is_active)
        total_users_count = len(users)
        
        # Determinar status da licença (ativo se tiver usuários ativos)
        license_status = "ativo" if active_users_count > 0 else "inativo"
        
        # Buscar comissões relacionadas (se houver parceiro)
        total_paid = 0.0
        if tenant.partner_id:
            commissions = session.exec(
                select(Commission).where(
                    and_(
                        Commission.customer_id == tenant.id,
                        Commission.partner_id == tenant.partner_id
                    )
                )
            ).all()
            total_paid = sum(c.valor_pago for c in commissions if c.status_comissao == CommissionStatus.PAGO)
        
        partner = partners_dict.get(tenant.partner_id) if tenant.partner_id else None
        
        result.append({
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "company_name": tenant.company_name,
            "partner_id": tenant.partner_id,
            "partner_nome": partner.nome if partner else None,
            "created_at": tenant.created_at.isoformat(),
            "license_status": license_status,
            "total_users": total_users_count,
            "active_users": active_users_count,
            "users": [
                {
                    "id": u.id,
                    "email": u.email,
                    "full_name": u.full_name,
                    "role": u.role.value,
                    "is_active": u.is_active,
                    "created_at": u.created_at.isoformat()
                }
                for u in users
            ],
            "total_paid": float(total_paid)
        })
    
    # Contar total
    count_query = select(func.count(Tenant.id))
    if partner_id:
        count_query = count_query.where(Tenant.partner_id == partner_id)
    if search:
        count_query = count_query.where(
            or_(
                Tenant.name.ilike(f"%{search}%"),
                Tenant.company_name.ilike(f"%{search}%")
            )
        )
    
    total = session.exec(count_query).one() or 0
    
    return {
        "items": result,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/tenants/{tenant_id}")
async def get_tenant_details(
    tenant_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
):
    """Detalhes completos de um tenant"""
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant não encontrado"
        )
    
    # Buscar usuários
    users = session.exec(
        select(User).where(User.tenant_id == tenant.id)
    ).all()
    
    # Buscar parceiro
    partner = None
    if tenant.partner_id:
        partner = session.get(Partner, tenant.partner_id)
    
    # Buscar comissões
    commissions = []
    if tenant.partner_id:
        commissions_list = session.exec(
            select(Commission).where(
                and_(
                    Commission.customer_id == tenant.id,
                    Commission.partner_id == tenant.partner_id
                )
            ).order_by(desc(Commission.created_at))
        ).all()
        
        commissions = [
            {
                "id": c.id,
                "valor_pago": float(c.valor_pago),
                "valor_venda": float(c.valor_venda) if c.valor_venda else None,
                "data_pagamento": c.data_pagamento.isoformat() if c.data_pagamento else None,
                "status_comissao": c.status_comissao.value,
                "created_at": c.created_at.isoformat()
            }
            for c in commissions_list
        ]
    
    active_users_count = sum(1 for u in users if u.is_active)
    
    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "company_name": tenant.company_name,
        "partner_id": tenant.partner_id,
        "partner_nome": partner.nome if partner else None,
        "partner_cnpj": partner.cnpj if partner else None,
        "created_at": tenant.created_at.isoformat(),
        "updated_at": tenant.updated_at.isoformat(),
        "license_status": "ativo" if active_users_count > 0 else "inativo",
        "total_users": len(users),
        "active_users": active_users_count,
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role.value,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
                "updated_at": u.updated_at.isoformat()
            }
            for u in users
        ],
        "commissions": commissions,
        "total_paid": float(sum(c["valor_pago"] for c in commissions if c["status_comissao"] == "pago"))
    }