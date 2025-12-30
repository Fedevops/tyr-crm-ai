from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlmodel import Session, select, and_, or_, func
from app.database import get_session
from app.models import (
    Item, ItemCreate, ItemUpdate, ItemResponse, ItemType,
    StockTransaction, StockTransactionCreate, StockTransactionResponse, StockTransactionType,
    OrderItem, User
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership, check_limit
from app.services.audit_service import log_create, log_update, log_delete
import logging
import os
import uuid
import aiofiles
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter()

# Diretório para armazenar imagens
UPLOAD_DIR = Path("uploads/images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def item_to_response(item: Item) -> ItemResponse:
    """Helper function to convert Item to ItemResponse with margin calculation"""
    margin_percentage = None
    if item.cost_price and item.cost_price > 0:
        margin_percentage = ((item.unit_price - item.cost_price) / item.cost_price) * 100
    
    return ItemResponse(
        id=item.id,
        tenant_id=item.tenant_id,
        name=item.name,
        sku=item.sku,
        description=item.description,
        image_url=item.image_url,
        type=item.type,
        cost_price=item.cost_price,
        unit_price=item.unit_price,
        currency=item.currency,
        track_stock=item.track_stock,
        stock_quantity=item.stock_quantity,
        low_stock_threshold=item.low_stock_threshold,
        owner_id=item.owner_id,
        created_by_id=item.created_by_id,
        created_at=item.created_at,
        updated_at=item.updated_at,
        margin_percentage=margin_percentage
    )


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    """Upload an image for a product"""
    # Validar tipo de arquivo
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de arquivo não permitido. Use: {', '.join(allowed_types)}"
        )
    
    # Validar tamanho (máximo 5MB)
    file_content = await file.read()
    if len(file_content) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo muito grande. Tamanho máximo: 5MB"
        )
    
    # Gerar nome único para o arquivo
    file_extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    
    # Criar diretório por tenant
    tenant_dir = UPLOAD_DIR / str(current_user.tenant_id)
    tenant_dir.mkdir(parents=True, exist_ok=True)
    
    # Salvar arquivo
    file_path = tenant_dir / unique_filename
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(file_content)
    
    # Retornar URL relativa
    image_url = f"/uploads/images/{current_user.tenant_id}/{unique_filename}"
    
    return {"image_url": image_url}


@router.post("", response_model=ItemResponse)
async def create_item(
    item_data: ItemCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new item (product or service)"""
    # Verificar limite antes de criar
    await check_limit("items", session, current_user)
    # Verificar se SKU já existe para este tenant (se fornecido)
    if item_data.sku:
        existing_item = session.exec(
            select(Item).where(
                and_(
                    Item.tenant_id == current_user.tenant_id,
                    Item.sku == item_data.sku
                )
            )
        ).first()
        if existing_item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SKU '{item_data.sku}' já existe para este tenant"
            )
    
    # Preparar dados com ownership
    item_dict = item_data.dict(exclude={'owner_id'})
    item_dict = ensure_ownership(item_dict, current_user)
    
    # Validar que se track_stock é True, stock_quantity deve ser fornecido
    if item_data.track_stock and item_data.stock_quantity is None:
        item_dict['stock_quantity'] = 0
    
    # Validar que serviços não devem ter track_stock
    if item_data.type == ItemType.SERVICE:
        item_dict['track_stock'] = False
        item_dict['stock_quantity'] = None
        item_dict['low_stock_threshold'] = None
    
    item = Item(
        **item_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    
    # Registrar auditoria
    log_create(session, current_user, "Item", item.id)
    
    return item_to_response(item)


@router.get("", response_model=List[ItemResponse])
async def get_items(
    type_filter: Optional[ItemType] = Query(None, alias="type", description="Filter by item type"),
    low_stock: Optional[bool] = Query(None, description="Filter by low stock status"),
    search: Optional[str] = Query(None, description="Search in name, sku, description"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """List items with filters"""
    query = select(Item)
    
    # Sempre filtrar por tenant
    query = query.where(Item.tenant_id == current_user.tenant_id)
    
    # Aplicar filtros
    if type_filter:
        query = query.where(Item.type == type_filter)
    
    if low_stock is not None:
        if low_stock:
            # Apenas itens com estoque baixo
            query = query.where(
                and_(
                    Item.track_stock == True,
                    Item.stock_quantity.isnot(None),
                    Item.low_stock_threshold.isnot(None),
                    Item.stock_quantity <= Item.low_stock_threshold
                )
            )
        else:
            # Itens sem estoque baixo ou sem controle de estoque
            query = query.where(
                or_(
                    Item.track_stock == False,
                    Item.low_stock_threshold.is_(None),
                    Item.stock_quantity > Item.low_stock_threshold
                )
            )
    
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Item.name.ilike(search_pattern),
                Item.sku.ilike(search_pattern),
                Item.description.ilike(search_pattern)
            )
        )
    
    # Ordenar por nome
    query = query.order_by(Item.name)
    
    items = session.exec(query.offset(skip).limit(limit)).all()
    
    # Calcular margem para cada item
    return [item_to_response(item) for item in items]


@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific item by ID"""
    item = session.get(Item, item_id)
    
    # Retornar 404 se não existir ou não pertencer ao tenant (proteção contra enumeration)
    if not item or item.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    return item_to_response(item)


@router.put("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: int,
    item_data: ItemUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update an item"""
    item = session.get(Item, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    require_ownership(item, current_user)
    
    # Verificar se SKU está sendo alterado e se já existe para outro item do mesmo tenant
    if item_data.sku and item_data.sku != item.sku:
        existing_item = session.exec(
            select(Item).where(
                and_(
                    Item.tenant_id == current_user.tenant_id,
                    Item.sku == item_data.sku,
                    Item.id != item_id
                )
            )
        ).first()
        if existing_item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SKU '{item_data.sku}' já existe para outro item"
            )
    
    # Atualizar campos
    update_data = item_data.dict(exclude_unset=True)
    
    # Validar que serviços não devem ter track_stock
    if update_data.get('type') == ItemType.SERVICE or (item.type == ItemType.SERVICE and 'type' not in update_data):
        update_data['track_stock'] = False
        update_data['stock_quantity'] = None
        update_data['low_stock_threshold'] = None
    
    for field, value in update_data.items():
        setattr(item, field, value)
    
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    
    # Registrar auditoria
    log_update(session, current_user, "Item", item.id)
    
    return item_to_response(item)


@router.delete("/{item_id}")
async def delete_item(
    item_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an item"""
    item = session.get(Item, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    require_ownership(item, current_user)
    
    # Verificar se o item está sendo usado em algum pedido
    order_items = session.exec(
        select(OrderItem).where(OrderItem.item_id == item_id)
    ).first()
    
    if order_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível excluir este item pois ele está sendo usado em um ou mais pedidos. Considere desativá-lo ou removê-lo dos pedidos primeiro."
        )
    
    session.delete(item)
    session.commit()
    
    # Registrar auditoria
    log_delete(session, current_user, "Item", item_id)
    
    return {"message": "Item deleted successfully"}


@router.post("/{item_id}/stock/adjust", response_model=StockTransactionResponse)
async def adjust_stock(
    item_id: int,
    transaction_data: StockTransactionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Adjust stock quantity for an item"""
    item = session.get(Item, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    if not item.track_stock:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este item não possui controle de estoque habilitado"
        )
    
    previous_quantity = item.stock_quantity or 0
    new_quantity = previous_quantity + transaction_data.quantity_change
    
    if new_quantity < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantidade de estoque não pode ser negativa"
        )
    
    # Atualizar estoque do item
    item.stock_quantity = new_quantity
    item.updated_at = datetime.utcnow()
    session.add(item)
    
    # Criar transação de estoque
    transaction = StockTransaction(
        tenant_id=current_user.tenant_id,
        item_id=item_id,
        user_id=current_user.id,
        transaction_type=transaction_data.transaction_type,
        quantity_change=transaction_data.quantity_change,
        previous_quantity=previous_quantity,
        new_quantity=new_quantity,
        reason=transaction_data.reason
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    
    # Buscar dados do usuário para resposta
    user = session.get(User, current_user.id)
    transaction_dict = transaction.dict()
    if user:
        transaction_dict['user_name'] = user.full_name
        transaction_dict['user_email'] = user.email
    else:
        transaction_dict['user_name'] = None
        transaction_dict['user_email'] = None
    
    return StockTransactionResponse(**transaction_dict)


@router.get("/{item_id}/stock/history", response_model=List[StockTransactionResponse])
async def get_stock_history(
    item_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get stock transaction history for an item"""
    item = session.get(Item, item_id)
    
    if not item or item.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    query = select(StockTransaction).where(
        and_(
            StockTransaction.tenant_id == current_user.tenant_id,
            StockTransaction.item_id == item_id
        )
    ).order_by(StockTransaction.created_at.desc())
    
    transactions = session.exec(query.offset(skip).limit(limit)).all()
    
    # Adicionar dados do usuário
    result = []
    for transaction in transactions:
        transaction_dict = transaction.dict()
        user = session.get(User, transaction.user_id)
        if user:
            transaction_dict['user_name'] = user.full_name
            transaction_dict['user_email'] = user.email
        else:
            transaction_dict['user_name'] = None
            transaction_dict['user_email'] = None
        result.append(StockTransactionResponse(**transaction_dict))
    
    return result

