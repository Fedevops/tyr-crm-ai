from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, func, and_, or_
from typing import Optional, List
from datetime import datetime
import json
import logging

from app.database import get_session
from app.models import (
    User, Order, OrderItem, OrderStatusHistory, OrderStatus,
    OrderCreate, OrderUpdate, OrderResponse, OrderItemCreate, OrderItemResponse, OrderStatusHistoryResponse,
    Item, Proposal, ProposalStatus, StockTransaction, StockTransactionType,
    Contact, Account
)
from app.dependencies import (
    get_current_active_user, apply_ownership_filter, ensure_ownership,
    require_ownership
)

logger = logging.getLogger(__name__)

router = APIRouter()


def validate_order_items(session: Session, items: List[OrderItemCreate], tenant_id: int) -> List[dict]:
    """
    Valida e processa os itens de um pedido.
    
    Args:
        session: Sessão do banco de dados
        items: Lista de OrderItemCreate
        tenant_id: ID do tenant para validação de segurança
    
    Returns:
        Lista de dicionários com itens validados e subtotais calculados
    
    Raises:
        HTTPException 400 se algum item for inválido ou de outro tenant
    """
    if not items or len(items) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must have at least one item"
        )
    
    validated_items = []
    total = 0.0
    
    for item_data in items:
        item_id = item_data.item_id
        quantity = item_data.quantity
        unit_price = item_data.unit_price
        
        if not isinstance(quantity, (int, float)) or quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid quantity for item {item_id}: must be a positive number"
            )
        
        # Buscar item no banco
        item = session.get(Item, item_id)
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item {item_id} not found"
            )
        
        # VALIDAÇÃO DE SEGURANÇA: Verificar se item pertence ao tenant
        if item.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Item {item_id} does not belong to your tenant"
            )
        
        # Usar preço do item se não fornecido
        if unit_price is None:
            unit_price = item.unit_price
        
        subtotal = float(quantity) * float(unit_price)
        total += subtotal
        
        validated_item = {
            'item_id': item_id,
            'quantity': int(quantity),
            'unit_price': float(unit_price),
            'subtotal': round(subtotal, 2)
        }
        validated_items.append(validated_item)
    
    return validated_items, round(total, 2)


def sync_order_to_erp(session: Session, order: Order, user_id: int):
    """
    Sincroniza pedido com ERP (TOTVS ou Salesforce) se integração estiver ativa
    """
    # Buscar integrações ativas de ERP
    totvs_integration = session.exec(
        select(TenantIntegration).where(
            and_(
                TenantIntegration.tenant_id == order.tenant_id,
                TenantIntegration.integration_type == IntegrationType.TOTVS,
                TenantIntegration.is_active == True
            )
        )
    ).first()
    
    salesforce_integration = session.exec(
        select(TenantIntegration).where(
            and_(
                TenantIntegration.tenant_id == order.tenant_id,
                TenantIntegration.integration_type == IntegrationType.SALESFORCE,
                TenantIntegration.is_active == True
            )
        )
    ).first()
    
    # Tentar sincronizar com TOTVS
    if totvs_integration:
        try:
            credentials = decrypt_credentials(totvs_integration.credentials_encrypted) if totvs_integration.credentials_encrypted else {}
            api_url = credentials.get("api_url")
            api_key = credentials.get("api_key")
            
            if api_url and api_key:
                import requests
                
                # Preparar dados do pedido para TOTVS
                order_items = session.exec(
                    select(OrderItem).where(OrderItem.order_id == order.id)
                ).all()
                
                payload = {
                    "order_id": order.id,
                    "customer_name": order.customer_name,
                    "customer_email": order.customer_email,
                    "customer_phone": order.customer_phone,
                    "total_amount": float(order.total_amount),
                    "currency": order.currency,
                    "status": order.status.value,
                    "items": [
                        {
                            "item_id": item.item_id,
                            "quantity": item.quantity,
                            "unit_price": float(item.unit_price),
                            "subtotal": float(item.subtotal)
                        }
                        for item in order_items
                    ],
                    "notes": order.notes
                }
                
                response = requests.post(
                    f"{api_url}/api/orders/sync",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json=payload,
                    timeout=10
                )
                response.raise_for_status()
                logger.info(f"Pedido {order.id} sincronizado com TOTVS com sucesso")
        except Exception as e:
            logger.error(f"Erro ao sincronizar pedido {order.id} com TOTVS: {e}")
            raise
    
    # Tentar sincronizar com Salesforce
    if salesforce_integration:
        try:
            credentials = decrypt_credentials(salesforce_integration.credentials_encrypted) if salesforce_integration.credentials_encrypted else {}
            instance_url = credentials.get("instance_url")
            access_token = credentials.get("access_token")
            
            if instance_url and access_token:
                import requests
                
                # Preparar dados do pedido para Salesforce
                order_items = session.exec(
                    select(OrderItem).where(OrderItem.order_id == order.id)
                ).all()
                
                # Criar Opportunity no Salesforce
                opportunity_data = {
                    "Name": f"Pedido #{order.id} - {order.customer_name}",
                    "Amount": float(order.total_amount),
                    "StageName": "Closed Won" if order.status.value == "completed" else "Negotiation/Review",
                    "CloseDate": order.created_at.strftime("%Y-%m-%d"),
                    "Description": order.notes or f"Pedido gerado no TYR CRM"
                }
                
                response = requests.post(
                    f"{instance_url}/services/data/v57.0/sobjects/Opportunity",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    json=opportunity_data,
                    timeout=10
                )
                response.raise_for_status()
                logger.info(f"Pedido {order.id} sincronizado com Salesforce com sucesso")
        except Exception as e:
            logger.error(f"Erro ao sincronizar pedido {order.id} com Salesforce: {e}")
            raise


def process_order_stock(session: Session, order: Order, user_id: int):
    """Processa estoque quando pedido é finalizado"""
    if order.status != OrderStatus.COMPLETED:
        return
    
    # Tentar sincronizar com ERP se integração estiver ativa
    try:
        sync_order_to_erp(session, order, user_id)
    except Exception as e:
        logger.warning(f"Erro ao sincronizar pedido {order.id} com ERP: {e}")
        # Não falhar o processamento do pedido se a sincronização falhar
    
    # Buscar todos os itens do pedido
    order_items = session.exec(
        select(OrderItem).where(OrderItem.order_id == order.id)
    ).all()
    
    for order_item in order_items:
        item = session.get(Item, order_item.item_id)
        if not item or not item.track_stock:
            continue
        
        # Validar estoque suficiente
        if item.stock_quantity is None or item.stock_quantity < order_item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para item {item.name}. Disponível: {item.stock_quantity or 0}, Necessário: {order_item.quantity}"
            )
        
        # Salvar quantidade anterior
        previous_quantity = item.stock_quantity
        
        # Decrementar estoque
        item.stock_quantity -= order_item.quantity
        session.add(item)
        
        # Criar transação de estoque
        stock_transaction = StockTransaction(
            tenant_id=order.tenant_id,
            item_id=item.id,
            user_id=user_id,
            transaction_type=StockTransactionType.SALE,
            quantity_change=-order_item.quantity,
            previous_quantity=previous_quantity,
            new_quantity=item.stock_quantity,
            reason=f"Venda - Pedido #{order.id}"
        )
        session.add(stock_transaction)


def order_to_response(order: Order, session: Session) -> OrderResponse:
    """Converte Order para OrderResponse com items e status_history"""
    # Buscar items
    order_items = session.exec(
        select(OrderItem).where(OrderItem.order_id == order.id)
    ).all()
    
    items_response = []
    for oi in order_items:
        item = session.get(Item, oi.item_id)
        items_response.append(OrderItemResponse(
            id=oi.id,
            tenant_id=oi.tenant_id,
            order_id=oi.order_id,
            item_id=oi.item_id,
            quantity=oi.quantity,
            unit_price=oi.unit_price,
            subtotal=oi.subtotal,
            item_name=item.name if item else None,
            item_sku=item.sku if item else None,
            item_type=item.type.value if item else None
        ))
    
    # Buscar status history
    status_history = session.exec(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id)
        .order_by(OrderStatusHistory.created_at)
    ).all()
    
    history_response = []
    for sh in status_history:
        user = session.get(User, sh.changed_by_id)
        history_response.append(OrderStatusHistoryResponse(
            id=sh.id,
            tenant_id=sh.tenant_id,
            order_id=sh.order_id,
            status=sh.status.value,
            notes=sh.notes,
            changed_by_id=sh.changed_by_id,
            created_at=sh.created_at,
            changed_by_name=user.full_name if user else None,
            changed_by_email=user.email if user else None
        ))
    
    # Buscar dados do contato e conta
    contact_name = None
    account_name = None
    if order.contact_id:
        contact = session.get(Contact, order.contact_id)
        if contact:
            contact_name = f"{contact.first_name} {contact.last_name}".strip()
    if order.account_id:
        account = session.get(Account, order.account_id)
        if account:
            account_name = account.name
    
    return OrderResponse(
        id=order.id,
        tenant_id=order.tenant_id,
        proposal_id=order.proposal_id,
        contact_id=order.contact_id,
        account_id=order.account_id,
        customer_name=order.customer_name,
        customer_email=order.customer_email,
        customer_phone=order.customer_phone,
        status=order.status.value,
        total_amount=order.total_amount,
        currency=order.currency,
        notes=order.notes,
        owner_id=order.owner_id,
        created_by_id=order.created_by_id,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=items_response,
        status_history=history_response,
        contact_name=contact_name,
        account_name=account_name
    )


@router.post("", response_model=OrderResponse)
async def create_order(
    order_data: OrderCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new order"""
    # Validar proposal_id se fornecido
    proposal = None
    if order_data.proposal_id:
        proposal = session.get(Proposal, order_data.proposal_id)
        if not proposal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposal not found"
            )
        # Validar que proposta pertence ao tenant
        if proposal.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Proposal does not belong to your tenant"
            )
        # Validar que proposta está aceita
        if proposal.status != ProposalStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Proposal must be accepted to create an order"
            )
    
    # Validar e processar itens
    validated_items, total_amount = validate_order_items(
        session, order_data.items, current_user.tenant_id
    )
    
    # Buscar contato se fornecido
    contact = None
    account = None
    customer_name = order_data.customer_name or ""
    customer_email = order_data.customer_email
    customer_phone = order_data.customer_phone
    account_id = order_data.account_id
    
    if order_data.contact_id:
        contact = session.get(Contact, order_data.contact_id)
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        # Validar que contato pertence ao tenant
        if contact.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Contact does not belong to your tenant"
            )
        # Preencher dados do contato
        customer_name = f"{contact.first_name} {contact.last_name}".strip()
        customer_email = contact.email or customer_email
        customer_phone = contact.phone or contact.mobile or customer_phone
        # Usar account_id do contato se não foi fornecido explicitamente
        if not account_id and contact.account_id:
            account_id = contact.account_id
    
    # Buscar conta se fornecido
    if account_id:
        account = session.get(Account, account_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found"
            )
        # Validar que conta pertence ao tenant
        if account.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account does not belong to your tenant"
            )
    
    # Validar que temos pelo menos um nome
    if not customer_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="customer_name is required (or provide contact_id)"
        )
    
    # Preparar dados com ownership
    order_dict = {
        "customer_name": customer_name,
        "customer_email": customer_email,
        "customer_phone": customer_phone,
        "contact_id": order_data.contact_id,
        "account_id": account_id,
        "proposal_id": order_data.proposal_id,
        "total_amount": total_amount,
        "currency": order_data.currency,
        "notes": order_data.notes,
        "status": OrderStatus.PENDING,
        "tenant_id": current_user.tenant_id
    }
    order_dict = ensure_ownership(order_dict, current_user)
    
    # Criar pedido
    order = Order(**order_dict)
    session.add(order)
    session.commit()
    session.refresh(order)
    
    # Criar itens do pedido
    for item_data in validated_items:
        order_item = OrderItem(
            tenant_id=current_user.tenant_id,
            order_id=order.id,
            item_id=item_data['item_id'],
            quantity=item_data['quantity'],
            unit_price=item_data['unit_price'],
            subtotal=item_data['subtotal']
        )
        session.add(order_item)
    
    # Criar histórico inicial
    status_history = OrderStatusHistory(
        tenant_id=current_user.tenant_id,
        order_id=order.id,
        status=OrderStatus.PENDING,
        changed_by_id=current_user.id,
        notes="Pedido criado"
    )
    session.add(status_history)
    
    session.commit()
    session.refresh(order)
    
    return order_to_response(order, session)


@router.get("", response_model=List[OrderResponse])
async def get_orders(
    status: Optional[OrderStatus] = Query(None, description="Filter by status"),
    customer_name: Optional[str] = Query(None, description="Filter by customer name"),
    date_from: Optional[datetime] = Query(None, description="Filter from date"),
    date_to: Optional[datetime] = Query(None, description="Filter to date"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """List all orders for the current tenant"""
    query = select(Order).where(Order.tenant_id == current_user.tenant_id)
    
    # Aplicar filtros de ownership
    query = apply_ownership_filter(query, Order, current_user)
    
    # Aplicar filtros opcionais
    if status:
        query = query.where(Order.status == status)
    if customer_name:
        query = query.where(Order.customer_name.ilike(f"%{customer_name}%"))
    if date_from:
        query = query.where(Order.created_at >= date_from)
    if date_to:
        query = query.where(Order.created_at <= date_to)
    
    orders = session.exec(query.order_by(Order.created_at.desc())).all()
    
    return [order_to_response(order, session) for order in orders]


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get order details"""
    order = session.get(Order, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    require_ownership(order, current_user)
    
    return order_to_response(order, session)


@router.put("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: int,
    order_data: OrderUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update an order"""
    order = session.get(Order, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    require_ownership(order, current_user)
    
    # Verificar se pedido já foi finalizado
    if order.status == OrderStatus.COMPLETED and order_data.status != OrderStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change status of a completed order"
        )
    
    old_status = order.status
    
    # Atualizar campos
    if order_data.status is not None:
        order.status = order_data.status
    if order_data.notes is not None:
        order.notes = order_data.notes
    
    order.updated_at = datetime.utcnow()
    session.add(order)
    
    # Se status mudou, criar histórico
    if order_data.status and order_data.status != old_status:
        status_history = OrderStatusHistory(
            tenant_id=order.tenant_id,
            order_id=order.id,
            status=order_data.status,
            changed_by_id=current_user.id,
            notes=order_data.notes or f"Status alterado de {old_status.value} para {order_data.status.value}"
        )
        session.add(status_history)
        
        # Processar estoque se status mudou para COMPLETED
        if order_data.status == OrderStatus.COMPLETED:
            process_order_stock(session, order, current_user.id)
    
    session.commit()
    session.refresh(order)
    
    return order_to_response(order, session)


@router.delete("/{order_id}")
async def delete_order(
    order_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an order"""
    order = session.get(Order, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    require_ownership(order, current_user)
    
    # Não permitir deletar pedido finalizado
    if order.status == OrderStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a completed order"
        )
    
    session.delete(order)
    session.commit()
    
    return {"message": "Order deleted successfully"}


@router.get("/{order_id}/html")
async def export_order_html(
    order_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Export order as HTML for PDF generation"""
    from fastapi.responses import Response
    
    order = session.get(Order, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    require_ownership(order, current_user)
    
    # Buscar items
    order_items = session.exec(
        select(OrderItem).where(OrderItem.order_id == order.id)
    ).all()
    
    # Formatar valores em BRL
    def format_currency(value: float) -> str:
        return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    
    # Gerar HTML do pedido
    items_html = ""
    for oi in order_items:
        item = session.get(Item, oi.item_id)
        items_html += f"""
        <tr>
            <td>{item.name if item else 'N/A'}</td>
            <td>{oi.quantity}</td>
            <td>{format_currency(oi.unit_price)}</td>
            <td>{format_currency(oi.subtotal)}</td>
        </tr>
        """
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <title>Pedido #{order.id} - TYR</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                margin: 40px;
                line-height: 1.6;
                color: #333;
            }}
            h1 {{ color: #2c3e50; }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
            }}
            table th, table td {{
                border: 1px solid #ddd;
                padding: 12px;
                text-align: left;
            }}
            table th {{
                background-color: #f2f2f2;
            }}
        </style>
    </head>
    <body>
        <h1>Pedido #{order.id}</h1>
        {f'<p><strong>Empresa:</strong> {account.name}</p>' if account else ''}
        {f'<p><strong>Contato:</strong> {contact.first_name} {contact.last_name}</p>' if contact else ''}
        <p><strong>Cliente:</strong> {order.customer_name}</p>
        <p><strong>Email:</strong> {order.customer_email or 'N/A'}</p>
        <p><strong>Telefone:</strong> {order.customer_phone or 'N/A'}</p>
        {f'<p><strong>Proposta:</strong> #{order.proposal_id}</p>' if order.proposal_id else ''}
        <p><strong>Status:</strong> {order.status.value}</p>
        <p><strong>Data:</strong> {order.created_at.strftime('%d/%m/%Y %H:%M')}</p>
        
        <h2>Itens do Pedido</h2>
        <table>
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Quantidade</th>
                    <th>Preço Unitário</th>
                    <th>Subtotal</th>
                </tr>
            </thead>
            <tbody>
                {items_html}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="3"><strong>Total</strong></td>
                    <td><strong>{format_currency(order.total_amount)}</strong></td>
                </tr>
            </tfoot>
        </table>
    </body>
    </html>
    """
    
    return Response(content=html_content, media_type="text/html")

