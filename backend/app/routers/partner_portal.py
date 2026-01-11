from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, func, and_, or_, desc
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
from app.database import get_session
from app.dependencies import get_current_partner_user
from app.models import (
    PartnerUser, Partner, Tenant, Commission, CommissionStatus,
    SupportTicket, TicketStatus, TicketPriority, UserCreate
)
from app.auth import get_password_hash

router = APIRouter(prefix="/api/partner-portal", tags=["Partner Portal"])

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Trocar senha do usuário parceiro"""
    from app.auth import verify_password, get_password_hash
    
    # Verificar senha atual
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta"
        )
    
    # Validar nova senha
    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nova senha deve ter pelo menos 6 caracteres"
        )
    
    # Atualizar senha
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.updated_at = datetime.utcnow()
    
    session.add(current_user)
    session.commit()
    
    return {"message": "Senha alterada com sucesso"}

# ==================== DASHBOARD ====================

@router.get("/dashboard")
async def get_partner_dashboard(
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Dashboard do parceiro com resumo"""
    partner = session.get(Partner, current_user.partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Parceiro não encontrado")
    
    # Total de clientes
    total_clientes = session.exec(
        select(func.count(Tenant.id)).where(Tenant.partner_id == current_user.partner_id)
    ).one() or 0
    
    # Clientes ativos (assumindo que todos os tenants são ativos se existem)
    clientes_ativos = total_clientes  # Pode ser refinado com status do tenant
    
    # Comissões acumuladas (pendentes)
    comissoes_pendentes = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == current_user.partner_id,
                Commission.status_comissao == CommissionStatus.PENDENTE
            )
        )
    ).one() or 0.0
    
    # Total de comissões pagas
    comissoes_pagas = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == current_user.partner_id,
                Commission.status_comissao == CommissionStatus.PAGO
            )
        )
    ).one() or 0.0
    
    # Próxima data de pagamento (data mais próxima de comissão pendente)
    proxima_comissao = session.exec(
        select(Commission).where(
            and_(
                Commission.partner_id == current_user.partner_id,
                Commission.status_comissao == CommissionStatus.PENDENTE
            )
        ).order_by(Commission.data_pagamento.asc()).limit(1)
    ).first()
    
    return {
        "partner_nome": partner.nome,
        "partner_nivel": partner.nivel,
        "porcentagem_comissao": partner.porcentagem_comissao,
        "total_clientes": total_clientes,
        "clientes_ativos": clientes_ativos,
        "comissoes_pendentes": float(comissoes_pendentes),
        "comissoes_pagas": float(comissoes_pagas),
        "proxima_data_pagamento": proxima_comissao.data_pagamento.isoformat() if proxima_comissao and proxima_comissao.data_pagamento else None,
        "proximo_valor_pagamento": float(proxima_comissao.valor_pago) if proxima_comissao else None
    }


# ==================== LINK DE INDICAÇÃO/VENDA ====================

@router.get("/referral-link")
async def get_referral_link(
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Gerar link de indicação para o parceiro"""
    import os
    base_url = os.getenv("FRONTEND_URL", "https://crm.tyr-ai.com.br")
    referral_link = f"{base_url}/register?partner_id={current_user.partner_id}&ref={current_user.id}"
    
    return {
        "referral_link": referral_link,
        "partner_id": current_user.partner_id,
        "instructions": "Compartilhe este link com seus clientes. Quando eles se registrarem, serão automaticamente associados ao seu parceiro."
    }


@router.post("/register-customer")
async def register_customer_via_partner(
    customer_data: UserCreate,
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Registrar novo cliente diretamente pelo parceiro"""
    from app.models import User, Tenant
    import uuid
    
    # Verificar se email já existe
    existing_user = session.exec(
        select(User).where(User.email == customer_data.email)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )
    
    # Verificar se tenant name já existe
    existing_tenant = session.exec(
        select(Tenant).where(Tenant.name == customer_data.tenant_name)
    ).first()
    
    if existing_tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nome da empresa já cadastrado"
        )
    
    # Criar tenant associado ao parceiro
    tenant = Tenant(
        name=customer_data.tenant_name,
        company_name=customer_data.tenant_name,
        partner_id=current_user.partner_id
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    
    # Criar usuário
    from app.auth import get_password_hash
    hashed_password = get_password_hash(customer_data.password)
    user = User(
        email=customer_data.email,
        full_name=customer_data.full_name,
        hashed_password=hashed_password,
        tenant_id=tenant.id
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return {
        "message": "Cliente registrado com sucesso",
        "tenant_id": tenant.id,
        "user_id": user.id,
        "customer_name": customer_data.full_name,
        "company_name": customer_data.tenant_name
    }


# ==================== GESTÃO DE CLIENTES ====================

@router.get("/customers")
async def get_partner_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Listar clientes do parceiro"""
    query = select(Tenant).where(Tenant.partner_id == current_user.partner_id)
    
    # Contar total
    total = session.exec(select(func.count(Tenant.id)).where(Tenant.partner_id == current_user.partner_id)).one() or 0
    
    # Buscar tenants
    tenants = session.exec(
        query.order_by(desc(Tenant.created_at)).offset(skip).limit(limit)
    ).all()
    
    # Buscar usuários de cada tenant para determinar status
    result = []
    for tenant in tenants:
        # Contar usuários ativos
        from app.models import User
        active_users = session.exec(
            select(func.count(User.id)).where(
                and_(
                    User.tenant_id == tenant.id,
                    User.is_active == True
                )
            )
        ).one() or 0
        
        # Buscar comissões relacionadas
        commissions = session.exec(
            select(Commission).where(
                and_(
                    Commission.customer_id == tenant.id,
                    Commission.partner_id == current_user.partner_id
                )
            )
        ).all()
        
        total_comissoes = sum(c.valor_pago for c in commissions)
        
        result.append({
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "company_name": tenant.company_name,
            "created_at": tenant.created_at.isoformat(),
            "status": "ativo" if active_users > 0 else "inativo",
            "total_users": active_users,
            "total_comissoes": float(total_comissoes),
            "data_venda": tenant.created_at.isoformat()
        })
    
    return {
        "items": result,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/customers/{customer_id}")
async def get_customer_details(
    customer_id: int,
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Detalhes de um cliente específico"""
    tenant = session.get(Tenant, customer_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    if tenant.partner_id != current_user.partner_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Buscar usuários do tenant
    from app.models import User
    users = session.exec(
        select(User).where(User.tenant_id == tenant.id)
    ).all()
    
    # Buscar comissões
    commissions = session.exec(
        select(Commission).where(
            and_(
                Commission.customer_id == tenant.id,
                Commission.partner_id == current_user.partner_id
            )
        ).order_by(desc(Commission.created_at))
    ).all()
    
    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "company_name": tenant.company_name,
        "created_at": tenant.created_at.isoformat(),
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "is_active": u.is_active
            }
            for u in users
        ],
        "commissions": [
            {
                "id": c.id,
                "valor_pago": float(c.valor_pago),
                "data_pagamento": c.data_pagamento.isoformat() if c.data_pagamento else None,
                "status_comissao": c.status_comissao.value,
                "created_at": c.created_at.isoformat()
            }
            for c in commissions
        ]
    }


# ==================== EXTRATO FINANCEIRO ====================

@router.get("/financial-statement")
async def get_financial_statement(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    status_filter: Optional[CommissionStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Extrato financeiro do parceiro"""
    query = select(Commission).where(Commission.partner_id == current_user.partner_id)
    
    if start_date:
        query = query.where(Commission.created_at >= start_date)
    
    if end_date:
        end_date_end = end_date + timedelta(days=1)
        query = query.where(Commission.created_at < end_date_end)
    
    if status_filter:
        query = query.where(Commission.status_comissao == status_filter)
    
    # Contar total
    count_query = select(func.count(Commission.id)).where(Commission.partner_id == current_user.partner_id)
    if start_date:
        count_query = count_query.where(Commission.created_at >= start_date)
    if end_date:
        end_date_end = end_date + timedelta(days=1)
        count_query = count_query.where(Commission.created_at < end_date_end)
    if status_filter:
        count_query = count_query.where(Commission.status_comissao == status_filter)
    
    total = session.exec(count_query).one() or 0
    
    # Buscar comissões
    commissions = session.exec(
        query.order_by(desc(Commission.created_at)).offset(skip).limit(limit)
    ).all()
    
    # Buscar tenants para incluir nome do cliente
    tenant_ids = [c.customer_id for c in commissions]
    tenants = {}
    if tenant_ids:
        tenant_list = session.exec(
            select(Tenant).where(Tenant.id.in_(tenant_ids))
        ).all()
        tenants = {t.id: t for t in tenant_list}
    
    result = []
    for commission in commissions:
        tenant = tenants.get(commission.customer_id)
        result.append({
            "id": commission.id,
            "customer_id": commission.customer_id,
            "customer_name": tenant.name if tenant else None,
            "valor_pago": float(commission.valor_pago),
            "valor_venda": float(commission.valor_venda) if commission.valor_venda else None,
            "porcentagem_aplicada": float(commission.porcentagem_aplicada) if commission.porcentagem_aplicada else None,
            "data_pagamento": commission.data_pagamento.isoformat() if commission.data_pagamento else None,
            "status_comissao": commission.status_comissao.value,
            "periodo_referencia": commission.periodo_referencia,
            "created_at": commission.created_at.isoformat()
        })
    
    # Calcular totais
    total_pendente = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == current_user.partner_id,
                Commission.status_comissao == CommissionStatus.PENDENTE
            )
        )
    ).one() or 0.0
    
    total_pago = session.exec(
        select(func.sum(Commission.valor_pago)).where(
            and_(
                Commission.partner_id == current_user.partner_id,
                Commission.status_comissao == CommissionStatus.PAGO
            )
        )
    ).one() or 0.0
    
    return {
        "items": result,
        "total": total,
        "skip": skip,
        "limit": limit,
        "summary": {
            "total_pendente": float(total_pendente),
            "total_pago": float(total_pago),
            "saldo_total": float(total_pendente + total_pago)
        }
    }


# ==================== SUPORTE ====================

@router.get("/support-tickets")
async def get_support_tickets(
    status_filter: Optional[TicketStatus] = Query(None),
    priority_filter: Optional[TicketPriority] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Listar tickets de suporte dos clientes do parceiro"""
    # Buscar todos os tenants do parceiro
    tenant_ids = session.exec(
        select(Tenant.id).where(Tenant.partner_id == current_user.partner_id)
    ).all()
    
    if not tenant_ids:
        return {
            "items": [],
            "total": 0,
            "skip": skip,
            "limit": limit
        }
    
    # Buscar tickets dos clientes do parceiro
    query = select(SupportTicket).where(
        and_(
            SupportTicket.customer_id.in_(tenant_ids),
            SupportTicket.partner_id == current_user.partner_id
        )
    )
    
    if status_filter:
        query = query.where(SupportTicket.status == status_filter)
    
    if priority_filter:
        query = query.where(SupportTicket.prioridade == priority_filter)
    
    # Contar total
    count_query = select(func.count(SupportTicket.id)).where(
        and_(
            SupportTicket.customer_id.in_(tenant_ids),
            SupportTicket.partner_id == current_user.partner_id
        )
    )
    if status_filter:
        count_query = count_query.where(SupportTicket.status == status_filter)
    if priority_filter:
        count_query = count_query.where(SupportTicket.prioridade == priority_filter)
    
    total = session.exec(count_query).one() or 0
    
    # Buscar tickets
    tickets = session.exec(
        query.order_by(desc(SupportTicket.created_at)).offset(skip).limit(limit)
    ).all()
    
    # Buscar tenants para incluir nome do cliente
    tenant_dict = {}
    if tickets:
        ticket_tenant_ids = list(set(t.customer_id for t in tickets))
        tenant_list = session.exec(
            select(Tenant).where(Tenant.id.in_(ticket_tenant_ids))
        ).all()
        tenant_dict = {t.id: t for t in tenant_list}
    
    result = []
    for ticket in tickets:
        tenant = tenant_dict.get(ticket.customer_id)
        result.append({
            "id": ticket.id,
            "customer_id": ticket.customer_id,
            "customer_name": tenant.name if tenant else None,
            "titulo": ticket.titulo,
            "descricao": ticket.descricao,
            "status": ticket.status.value,
            "prioridade": ticket.prioridade.value,
            "categoria": ticket.categoria,
            "resolucao": ticket.resolucao,
            "created_at": ticket.created_at.isoformat(),
            "updated_at": ticket.updated_at.isoformat(),
            "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
            "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None
        })
    
    return {
        "items": result,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/support-tickets/{ticket_id}")
async def get_support_ticket(
    ticket_id: int,
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Detalhes de um ticket de suporte"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    
    # Verificar se o ticket pertence a um cliente do parceiro
    tenant = session.get(Tenant, ticket.customer_id)
    if not tenant or tenant.partner_id != current_user.partner_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    return {
        "id": ticket.id,
        "customer_id": ticket.customer_id,
        "customer_name": tenant.name,
        "titulo": ticket.titulo,
        "descricao": ticket.descricao,
        "status": ticket.status.value,
        "prioridade": ticket.prioridade.value,
        "categoria": ticket.categoria,
        "resolucao": ticket.resolucao,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None
    }


@router.put("/support-tickets/{ticket_id}")
async def update_support_ticket(
    ticket_id: int,
    update_data: dict,
    session: Session = Depends(get_session),
    current_user: PartnerUser = Depends(get_current_partner_user)
):
    """Atualizar ticket de suporte (resposta do parceiro)"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    
    # Verificar se o ticket pertence a um cliente do parceiro
    tenant = session.get(Tenant, ticket.customer_id)
    if not tenant or tenant.partner_id != current_user.partner_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Atualizar campos permitidos
    if "resolucao" in update_data:
        ticket.resolucao = update_data["resolucao"]
    
    if "status" in update_data:
        ticket.status = TicketStatus(update_data["status"])
        if update_data["status"] == "resolvido" and not ticket.resolved_at:
            ticket.resolved_at = datetime.utcnow()
        if update_data["status"] == "fechado" and not ticket.closed_at:
            ticket.closed_at = datetime.utcnow()
    
    ticket.updated_at = datetime.utcnow()
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    
    return {
        "id": ticket.id,
        "status": ticket.status.value,
        "resolucao": ticket.resolucao,
        "message": "Ticket atualizado com sucesso"
    }

