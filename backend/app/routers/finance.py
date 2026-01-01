from typing import List, Optional, Dict
from datetime import datetime, timedelta
from calendar import monthrange
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from sqlmodel import Session, select, and_, func, or_
from app.database import get_session
from app.models import (
    FinancialAccount, FinancialAccountCreate, FinancialAccountUpdate, FinancialAccountResponse,
    Transaction, TransactionCreate, TransactionUpdate, TransactionResponse,
    TransactionType, TransactionStatus, TransactionCategory, RecurrenceInterval,
    User, Order
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.audit_service import log_create, log_update, log_delete
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def calculate_account_balance(session: Session, account_id: int, tenant_id: int) -> float:
    """Calcula o saldo de uma conta financeira baseado nas transações pagas"""
    # Soma todas as transações pagas (INCOME aumenta saldo, EXPENSE diminui)
    income_sum = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.account_id == account_id,
                Transaction.tenant_id == tenant_id,
                Transaction.type == TransactionType.INCOME,
                Transaction.status == TransactionStatus.PAID
            )
        )
    ).first() or 0.0
    
    expense_sum = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.account_id == account_id,
                Transaction.tenant_id == tenant_id,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.status == TransactionStatus.PAID
            )
        )
    ).first() or 0.0
    
    return float(income_sum or 0.0) - float(expense_sum or 0.0)


def financial_account_to_response(account: FinancialAccount, session: Session) -> FinancialAccountResponse:
    """Converte FinancialAccount para FinancialAccountResponse com saldo calculado"""
    balance = calculate_account_balance(session, account.id, account.tenant_id)
    return FinancialAccountResponse(
        id=account.id,
        tenant_id=account.tenant_id,
        name=account.name,
        description=account.description,
        is_active=account.is_active,
        owner_id=account.owner_id,
        created_by_id=account.created_by_id,
        created_at=account.created_at,
        updated_at=account.updated_at,
        balance=balance
    )


def transaction_to_response(transaction: Transaction, session: Session) -> TransactionResponse:
    """Converte Transaction para TransactionResponse"""
    account = session.get(FinancialAccount, transaction.account_id)
    account_name = account.name if account else None
    
    order_number = None
    if transaction.order_id:
        order = session.get(Order, transaction.order_id)
        if order:
            order_number = f"#{order.id}"
    
    return TransactionResponse(
        id=transaction.id,
        tenant_id=transaction.tenant_id,
        account_id=transaction.account_id,
        description=transaction.description,
        amount=transaction.amount,
        type=transaction.type.value,
        status=transaction.status.value,
        category=transaction.category.value,
        due_date=transaction.due_date,
        payment_date=transaction.payment_date,
        order_id=transaction.order_id,
        is_recurring=transaction.is_recurring,
        recurrence_interval=transaction.recurrence_interval.value if transaction.recurrence_interval else None,
        recurrence_start=transaction.recurrence_start,
        recurrence_end=transaction.recurrence_end,
        parent_transaction_id=transaction.parent_transaction_id,
        owner_id=transaction.owner_id,
        created_by_id=transaction.created_by_id,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
        account_name=account_name,
        order_number=order_number
    )


# ==================== FINANCIAL ACCOUNT ENDPOINTS ====================

@router.post("/accounts", response_model=FinancialAccountResponse)
async def create_account(
    account_data: FinancialAccountCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new financial account"""
    account_dict = account_data.dict()
    account_dict = ensure_ownership(account_dict, current_user)
    
    account = FinancialAccount(
        **account_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    
    log_create(session, current_user, "FinancialAccount", account.id)
    
    return financial_account_to_response(account, session)


@router.get("/accounts", response_model=List[FinancialAccountResponse])
async def get_accounts(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all financial accounts for the current tenant"""
    query = select(FinancialAccount)
    query = apply_ownership_filter(query, FinancialAccount, current_user)
    
    if is_active is not None:
        query = query.where(FinancialAccount.is_active == is_active)
    
    accounts = session.exec(query).all()
    return [financial_account_to_response(acc, session) for acc in accounts]


@router.get("/accounts/{account_id}", response_model=FinancialAccountResponse)
async def get_account(
    account_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific financial account"""
    account = session.get(FinancialAccount, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial account not found"
        )
    
    require_ownership(account, current_user)
    
    return financial_account_to_response(account, session)


@router.put("/accounts/{account_id}", response_model=FinancialAccountResponse)
async def update_account(
    account_id: int,
    account_data: FinancialAccountUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a financial account"""
    account = session.get(FinancialAccount, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial account not found"
        )
    
    require_ownership(account, current_user)
    
    update_data = account_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        if field not in ['owner_id', 'created_by_id', 'tenant_id']:
            old_value = getattr(account, field, None)
            if old_value != value:
                log_update(session, current_user, "FinancialAccount", account_id, field, old_value, value)
        setattr(account, field, value)
    
    account.updated_at = datetime.utcnow()
    session.add(account)
    session.commit()
    session.refresh(account)
    
    return financial_account_to_response(account, session)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a financial account"""
    account = session.get(FinancialAccount, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial account not found"
        )
    
    require_ownership(account, current_user)
    
    # Verificar se há transações vinculadas
    transactions_count = session.exec(
        select(func.count(Transaction.id)).where(
            Transaction.account_id == account_id,
            Transaction.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if transactions_count and transactions_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete account with associated transactions"
        )
    
    session.delete(account)
    session.commit()
    
    log_delete(session, current_user, "FinancialAccount", account_id)
    
    return {"message": "Account deleted successfully"}


# ==================== TRANSACTION ENDPOINTS ====================

@router.post("/transactions", response_model=TransactionResponse)
async def create_transaction(
    transaction_data: TransactionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new transaction"""
    # Verificar se a conta existe e pertence ao tenant
    account = session.get(FinancialAccount, transaction_data.account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial account not found"
        )
    
    if account.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account does not belong to your tenant"
        )
    
    # Verificar se order_id existe (se fornecido)
    if transaction_data.order_id:
        order = session.get(Order, transaction_data.order_id)
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found"
            )
        if order.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Order does not belong to your tenant"
            )
    
    transaction_dict = transaction_data.dict()
    transaction_dict = ensure_ownership(transaction_dict, current_user)
    
    # Se payment_date foi fornecido, status deve ser PAID
    if transaction_data.payment_date:
        transaction_dict['status'] = TransactionStatus.PAID
    else:
        # Verificar se está vencida (normalizar datas para comparação)
        now = datetime.utcnow()
        due_date = transaction_data.due_date
        # Remover timezone se existir
        if due_date.tzinfo is not None:
            due_date = due_date.replace(tzinfo=None)
        # Verificar se está vencida
        if due_date < now:
            transaction_dict['status'] = TransactionStatus.OVERDUE
        else:
            transaction_dict['status'] = TransactionStatus.PENDING
    
    transaction = Transaction(
        **transaction_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    
    log_create(session, current_user, "Transaction", transaction.id)
    
    return transaction_to_response(transaction, session)


@router.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(
    account_id: Optional[int] = Query(None, description="Filter by account"),
    type: Optional[TransactionType] = Query(None, description="Filter by type"),
    status: Optional[TransactionStatus] = Query(None, description="Filter by status"),
    category: Optional[TransactionCategory] = Query(None, description="Filter by category"),
    start_date: Optional[datetime] = Query(None, description="Filter from date"),
    end_date: Optional[datetime] = Query(None, description="Filter to date"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all transactions for the current tenant"""
    query = select(Transaction)
    query = apply_ownership_filter(query, Transaction, current_user)
    
    if account_id:
        query = query.where(Transaction.account_id == account_id)
    if type:
        query = query.where(Transaction.type == type)
    if status:
        query = query.where(Transaction.status == status)
    if category:
        query = query.where(Transaction.category == category)
    if start_date:
        query = query.where(Transaction.due_date >= start_date)
    if end_date:
        query = query.where(Transaction.due_date <= end_date)
    
    query = query.order_by(Transaction.due_date.desc())
    
    transactions = session.exec(query).all()
    return [transaction_to_response(t, session) for t in transactions]


@router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific transaction"""
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    require_ownership(transaction, current_user)
    
    return transaction_to_response(transaction, session)


@router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    transaction_data: TransactionUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a transaction"""
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    require_ownership(transaction, current_user)
    
    old_status = transaction.status
    update_data = transaction_data.dict(exclude_unset=True)
    
    # Se account_id mudou, verificar se a nova conta existe
    if 'account_id' in update_data:
        new_account = session.get(FinancialAccount, update_data['account_id'])
        if not new_account or new_account.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Financial account not found"
            )
    
    # Atualizar campos e registrar mudanças (exceto status que será tratado separadamente)
    for field, value in update_data.items():
        if field not in ['owner_id', 'created_by_id', 'tenant_id', 'status']:
            old_value = getattr(transaction, field, None)
            if old_value != value:
                log_update(session, current_user, "Transaction", transaction_id, field, old_value, value)
            setattr(transaction, field, value)
    
    # Tratar atualização de status
    # Prioridade: 1) Status explícito do usuário, 2) payment_date define PAID (apenas se status não foi enviado), 3) Recalcular automaticamente
    if transaction_data.status is not None:
        # Status foi explicitamente enviado pelo usuário - respeitar a escolha do usuário
        new_status = transaction_data.status
        # Se payment_date foi definido E status é PAID, manter PAID
        # Mas se usuário escolheu outro status, respeitar a escolha (pode limpar payment_date se necessário)
        if transaction_data.payment_date is not None and new_status == TransactionStatus.PAID:
            # Manter payment_date e status PAID
            pass
        elif transaction_data.payment_date is not None and new_status != TransactionStatus.PAID:
            # Usuário escolheu outro status mas há payment_date - limpar payment_date
            transaction.payment_date = None
        
        # Garantir que o status seja aplicado
        transaction.status = new_status
        if new_status != old_status:
            log_update(session, current_user, "Transaction", transaction_id, "status", old_status.value, new_status.value)
    elif transaction_data.payment_date is not None:
        # Se payment_date foi definido mas status não foi enviado, status deve ser PAID
        if transaction.status != TransactionStatus.PAID:
            log_update(session, current_user, "Transaction", transaction_id, "status", transaction.status.value, TransactionStatus.PAID.value)
        transaction.status = TransactionStatus.PAID
    else:
        # Recalcular status automaticamente apenas se não foi explicitamente definido
        now = datetime.utcnow()
        due_date = transaction.due_date
        # Remover timezone se existir
        if due_date.tzinfo is not None:
            due_date = due_date.replace(tzinfo=None)
        
        if due_date < now and transaction.status != TransactionStatus.PAID:
            if transaction.status != TransactionStatus.OVERDUE:
                log_update(session, current_user, "Transaction", transaction_id, "status", transaction.status.value, TransactionStatus.OVERDUE.value)
            transaction.status = TransactionStatus.OVERDUE
        elif transaction.status == TransactionStatus.OVERDUE and due_date >= now:
            log_update(session, current_user, "Transaction", transaction_id, "status", transaction.status.value, TransactionStatus.PENDING.value)
            transaction.status = TransactionStatus.PENDING
    
    transaction.updated_at = datetime.utcnow()
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    
    return transaction_to_response(transaction, session)


@router.patch("/transactions/{transaction_id}/mark-paid", response_model=TransactionResponse)
async def mark_transaction_paid(
    transaction_id: int,
    payment_date: Optional[datetime] = Query(None, description="Payment date (defaults to now)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Mark a transaction as paid"""
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    require_ownership(transaction, current_user)
    
    old_status = transaction.status
    transaction.status = TransactionStatus.PAID
    transaction.payment_date = payment_date or datetime.utcnow()
    transaction.updated_at = datetime.utcnow()
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    
    # Registrar mudança de status
    if old_status != TransactionStatus.PAID:
        log_update(session, current_user, "Transaction", transaction_id, "status", old_status.value, TransactionStatus.PAID.value)
    
    return transaction_to_response(transaction, session)


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a transaction"""
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    require_ownership(transaction, current_user)
    
    session.delete(transaction)
    session.commit()
    
    log_delete(session, current_user, "Transaction", transaction_id)
    
    return {"message": "Transaction deleted successfully"}


# ==================== STATS ENDPOINT ====================

@router.get("/stats")
async def get_finance_stats(
    month: Optional[int] = Query(None, description="Month (1-12)"),
    year: Optional[int] = Query(None, description="Year"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get financial statistics"""
    now = datetime.utcnow()
    
    # Se start_date e end_date foram fornecidos, usar eles
    if start_date and end_date:
        try:
            # Parse das datas e normalizar para naive (sem timezone)
            start_date_parsed = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end_date_parsed = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
            # Remover timezone se existir
            if start_date_parsed.tzinfo is not None:
                start_date_dt = start_date_parsed.replace(tzinfo=None)
            else:
                start_date_dt = start_date_parsed
                
            if end_date_parsed.tzinfo is not None:
                end_date_dt = end_date_parsed.replace(tzinfo=None)
            else:
                end_date_dt = end_date_parsed
            
            # Adicionar um dia ao end_date para incluir o dia final
            end_date_dt = end_date_dt + timedelta(days=1)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
    else:
        # Usar lógica antiga baseada em mês/ano
        target_month = month or now.month
        target_year = year or now.year
        
        # Data inicial e final do mês
        start_date_dt = datetime(target_year, target_month, 1)
        if target_month == 12:
            end_date_dt = datetime(target_year + 1, 1, 1)
        else:
            end_date_dt = datetime(target_year, target_month + 1, 1)
    
    # Buscar transações recorrentes ativas para calcular totais
    recurring_transactions_for_totals = session.exec(
        select(Transaction).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.is_recurring == True,
                Transaction.recurrence_start.isnot(None),
                Transaction.recurrence_interval.isnot(None),
                or_(
                    Transaction.recurrence_end.is_(None),
                    Transaction.recurrence_end >= start_date_dt
                )
            )
        )
    ).all()
    
    # Função auxiliar para calcular total de ocorrências recorrentes no período
    def calculate_recurring_total(recurring_tx: Transaction, start: datetime, end: datetime) -> float:
        """Calcula o total de uma transação recorrente no período"""
        if not recurring_tx.recurrence_start or not recurring_tx.recurrence_interval:
            return 0.0
        
        # Normalizar todas as datas para naive (sem timezone)
        recurrence_start = recurring_tx.recurrence_start.replace(tzinfo=None) if recurring_tx.recurrence_start.tzinfo else recurring_tx.recurrence_start
        recurrence_end_naive = None
        if recurring_tx.recurrence_end:
            recurrence_end_naive = recurring_tx.recurrence_end.replace(tzinfo=None) if recurring_tx.recurrence_end.tzinfo else recurring_tx.recurrence_end
        due_date_naive = recurring_tx.due_date.replace(tzinfo=None) if recurring_tx.due_date.tzinfo else recurring_tx.due_date
        start_naive = start.replace(tzinfo=None) if start.tzinfo else start
        end_naive = end.replace(tzinfo=None) if end.tzinfo else end
        
        current_date = max(recurrence_start, start_naive)
        end_date = min(recurrence_end_naive or datetime.max.replace(tzinfo=None), end_naive)
        
        # Começar da data de vencimento original ou da data de início da recorrência
        base_date = due_date_naive if due_date_naive >= recurrence_start else recurrence_start
        
        # Calcular primeira ocorrência no período
        next_date = base_date
        if next_date < current_date:
            # Avançar até a primeira ocorrência no período
            if recurring_tx.recurrence_interval.value == "weekly":
                while next_date < current_date:
                    next_date = next_date + timedelta(weeks=1)
            elif recurring_tx.recurrence_interval.value == "monthly":
                while next_date < current_date:
                    # Adicionar 1 mês, lidando com dias inválidos (ex: 31 de fevereiro)
                    if next_date.month == 12:
                        # Tentar criar a data, se falhar (dia inválido), usar último dia do mês
                        try:
                            next_date = datetime(next_date.year + 1, 1, next_date.day)
                        except ValueError:
                            # Último dia de janeiro
                            next_date = datetime(next_date.year + 1, 1, 31)
                    else:
                        try:
                            next_date = datetime(next_date.year, next_date.month + 1, next_date.day)
                        except ValueError:
                            # Último dia do mês
                            last_day = monthrange(next_date.year, next_date.month + 1)[1]
                            next_date = datetime(next_date.year, next_date.month + 1, last_day)
            elif recurring_tx.recurrence_interval.value == "quarterly":
                while next_date < current_date:
                    if next_date.month >= 10:
                        new_month = (next_date.month + 3) % 12
                        if new_month == 0:
                            new_month = 12
                        try:
                            next_date = datetime(next_date.year + 1, new_month, next_date.day)
                        except ValueError:
                            last_day = monthrange(next_date.year + 1, new_month)[1]
                            next_date = datetime(next_date.year + 1, new_month, last_day)
                    else:
                        try:
                            next_date = datetime(next_date.year, next_date.month + 3, next_date.day)
                        except ValueError:
                            last_day = monthrange(next_date.year, next_date.month + 3)[1]
                            next_date = datetime(next_date.year, next_date.month + 3, last_day)
            elif recurring_tx.recurrence_interval.value == "yearly":
                while next_date < current_date:
                    try:
                        next_date = datetime(next_date.year + 1, next_date.month, next_date.day)
                    except ValueError:
                        # Para anos bissextos (29 de fevereiro)
                        last_day = monthrange(next_date.year + 1, next_date.month)[1]
                        next_date = datetime(next_date.year + 1, next_date.month, last_day)
        
        # Contar ocorrências no período
        count = 0
        while next_date < end_date:
            count += 1
            # Avançar para próxima ocorrência
            if recurring_tx.recurrence_interval.value == "weekly":
                next_date = next_date + timedelta(weeks=1)
            elif recurring_tx.recurrence_interval.value == "monthly":
                # Adicionar 1 mês, lidando com dias inválidos (ex: 31 de fevereiro)
                if next_date.month == 12:
                    try:
                        next_date = datetime(next_date.year + 1, 1, next_date.day)
                    except ValueError:
                        # Último dia de janeiro
                        next_date = datetime(next_date.year + 1, 1, 31)
                else:
                    try:
                        next_date = datetime(next_date.year, next_date.month + 1, next_date.day)
                    except ValueError:
                        # Último dia do mês
                        last_day = monthrange(next_date.year, next_date.month + 1)[1]
                        next_date = datetime(next_date.year, next_date.month + 1, last_day)
            elif recurring_tx.recurrence_interval.value == "quarterly":
                if next_date.month >= 10:
                    new_month = (next_date.month + 3) % 12
                    if new_month == 0:
                        new_month = 12
                    try:
                        next_date = datetime(next_date.year + 1, new_month, next_date.day)
                    except ValueError:
                        last_day = monthrange(next_date.year + 1, new_month)[1]
                        next_date = datetime(next_date.year + 1, new_month, last_day)
                else:
                    try:
                        next_date = datetime(next_date.year, next_date.month + 3, next_date.day)
                    except ValueError:
                        last_day = monthrange(next_date.year, next_date.month + 3)[1]
                        next_date = datetime(next_date.year, next_date.month + 3, last_day)
            elif recurring_tx.recurrence_interval.value == "yearly":
                try:
                    next_date = datetime(next_date.year + 1, next_date.month, next_date.day)
                except ValueError:
                    # Para anos bissextos (29 de fevereiro)
                    last_day = monthrange(next_date.year + 1, next_date.month)[1]
                    next_date = datetime(next_date.year + 1, next_date.month, last_day)
        
        return recurring_tx.amount * count
    
    # Calcular totais de transações recorrentes
    recurring_income_total = sum(
        calculate_recurring_total(tx, start_date_dt, end_date_dt)
        for tx in recurring_transactions_for_totals
        if tx.type == TransactionType.INCOME
    )
    
    recurring_expense_total = sum(
        calculate_recurring_total(tx, start_date_dt, end_date_dt)
        for tx in recurring_transactions_for_totals
        if tx.type == TransactionType.EXPENSE
    )
    
    # Total a receber no período (INCOME pendentes e futuras + recorrentes)
    total_to_receive = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.type == TransactionType.INCOME,
                Transaction.status == TransactionStatus.PENDING,
                Transaction.due_date >= start_date_dt,
                Transaction.due_date < end_date_dt,
                Transaction.is_recurring == False  # Excluir recorrentes (contadas separadamente)
            )
        )
    ).first() or 0.0
    total_to_receive = float(total_to_receive or 0.0) + recurring_income_total
    
    # Total a pagar no período (EXPENSE pendentes e futuras + recorrentes)
    total_to_pay = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.status == TransactionStatus.PENDING,
                Transaction.due_date >= start_date_dt,
                Transaction.due_date < end_date_dt,
                Transaction.is_recurring == False  # Excluir recorrentes (contadas separadamente)
            )
        )
    ).first() or 0.0
    total_to_pay = float(total_to_pay or 0.0) + recurring_expense_total
    
    # Total recebido no período (INCOME pagas)
    total_received = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.type == TransactionType.INCOME,
                Transaction.status == TransactionStatus.PAID,
                Transaction.payment_date >= start_date_dt,
                Transaction.payment_date < end_date_dt
            )
        )
    ).first() or 0.0
    
    # Total pago no período (EXPENSE pagas)
    total_paid = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.status == TransactionStatus.PAID,
                Transaction.payment_date >= start_date_dt,
                Transaction.payment_date < end_date_dt
            )
        )
    ).first() or 0.0
    
    # Vencidas hoje
    today = datetime.utcnow().date()
    overdue_today = session.exec(
        select(func.count(Transaction.id)).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.status == TransactionStatus.OVERDUE,
                func.date(Transaction.due_date) == today
            )
        )
    ).first() or 0
    
    # Buscar transações recorrentes ativas
    recurring_transactions = session.exec(
        select(Transaction).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.is_recurring == True,
                Transaction.recurrence_start.isnot(None),
                Transaction.recurrence_interval.isnot(None),
                or_(
                    Transaction.recurrence_end.is_(None),
                    Transaction.recurrence_end >= start_date_dt
                )
            )
        )
    ).all()
    
    # Função auxiliar para calcular próximas ocorrências de uma transação recorrente
    def calculate_recurring_occurrences(recurring_tx: Transaction, start: datetime, end: datetime) -> list:
        """Calcula todas as ocorrências futuras de uma transação recorrente no período"""
        occurrences = []
        if not recurring_tx.recurrence_start or not recurring_tx.recurrence_interval:
            return occurrences
        
        # Normalizar todas as datas para naive (sem timezone)
        recurrence_start = recurring_tx.recurrence_start.replace(tzinfo=None) if recurring_tx.recurrence_start.tzinfo else recurring_tx.recurrence_start
        recurrence_end_naive = None
        if recurring_tx.recurrence_end:
            recurrence_end_naive = recurring_tx.recurrence_end.replace(tzinfo=None) if recurring_tx.recurrence_end.tzinfo else recurring_tx.recurrence_end
        due_date_naive = recurring_tx.due_date.replace(tzinfo=None) if recurring_tx.due_date.tzinfo else recurring_tx.due_date
        start_naive = start.replace(tzinfo=None) if start.tzinfo else start
        end_naive = end.replace(tzinfo=None) if end.tzinfo else end
        
        current_date = max(recurrence_start, start_naive)
        end_date = min(recurrence_end_naive or datetime.max.replace(tzinfo=None), end_naive)
        
        # Começar da data de vencimento original ou da data de início da recorrência
        base_date = due_date_naive if due_date_naive >= recurrence_start else recurrence_start
        
        # Calcular primeira ocorrência no período
        next_date = base_date
        if next_date < current_date:
            # Avançar até a primeira ocorrência no período
            if recurring_tx.recurrence_interval.value == "weekly":
                while next_date < current_date:
                    next_date = next_date + timedelta(weeks=1)
            elif recurring_tx.recurrence_interval.value == "monthly":
                while next_date < current_date:
                    # Adicionar 1 mês, lidando com dias inválidos (ex: 31 de fevereiro)
                    if next_date.month == 12:
                        # Tentar criar a data, se falhar (dia inválido), usar último dia do mês
                        try:
                            next_date = datetime(next_date.year + 1, 1, next_date.day)
                        except ValueError:
                            # Último dia de janeiro
                            next_date = datetime(next_date.year + 1, 1, 31)
                    else:
                        try:
                            next_date = datetime(next_date.year, next_date.month + 1, next_date.day)
                        except ValueError:
                            # Último dia do mês
                            last_day = monthrange(next_date.year, next_date.month + 1)[1]
                            next_date = datetime(next_date.year, next_date.month + 1, last_day)
            elif recurring_tx.recurrence_interval.value == "quarterly":
                while next_date < current_date:
                    if next_date.month >= 10:
                        new_month = (next_date.month + 3) % 12
                        if new_month == 0:
                            new_month = 12
                        try:
                            next_date = datetime(next_date.year + 1, new_month, next_date.day)
                        except ValueError:
                            last_day = monthrange(next_date.year + 1, new_month)[1]
                            next_date = datetime(next_date.year + 1, new_month, last_day)
                    else:
                        try:
                            next_date = datetime(next_date.year, next_date.month + 3, next_date.day)
                        except ValueError:
                            last_day = monthrange(next_date.year, next_date.month + 3)[1]
                            next_date = datetime(next_date.year, next_date.month + 3, last_day)
            elif recurring_tx.recurrence_interval.value == "yearly":
                while next_date < current_date:
                    try:
                        next_date = datetime(next_date.year + 1, next_date.month, next_date.day)
                    except ValueError:
                        # Para anos bissextos (29 de fevereiro)
                        last_day = monthrange(next_date.year + 1, next_date.month)[1]
                        next_date = datetime(next_date.year + 1, next_date.month, last_day)
        
        # Gerar todas as ocorrências no período
        while next_date < end_date:
            occurrences.append({
                "date": next_date,
                "amount": recurring_tx.amount,
                "type": recurring_tx.type
            })
            
            # Avançar para próxima ocorrência
            if recurring_tx.recurrence_interval.value == "weekly":
                next_date = next_date + timedelta(weeks=1)
            elif recurring_tx.recurrence_interval.value == "monthly":
                # Adicionar 1 mês, lidando com dias inválidos (ex: 31 de fevereiro)
                if next_date.month == 12:
                    try:
                        next_date = datetime(next_date.year + 1, 1, next_date.day)
                    except ValueError:
                        # Último dia de janeiro
                        next_date = datetime(next_date.year + 1, 1, 31)
                else:
                    try:
                        next_date = datetime(next_date.year, next_date.month + 1, next_date.day)
                    except ValueError:
                        # Último dia do mês
                        last_day = monthrange(next_date.year, next_date.month + 1)[1]
                        next_date = datetime(next_date.year, next_date.month + 1, last_day)
            elif recurring_tx.recurrence_interval.value == "quarterly":
                if next_date.month >= 10:
                    new_month = (next_date.month + 3) % 12
                    if new_month == 0:
                        new_month = 12
                    try:
                        next_date = datetime(next_date.year + 1, new_month, next_date.day)
                    except ValueError:
                        last_day = monthrange(next_date.year + 1, new_month)[1]
                        next_date = datetime(next_date.year + 1, new_month, last_day)
                else:
                    try:
                        next_date = datetime(next_date.year, next_date.month + 3, next_date.day)
                    except ValueError:
                        last_day = monthrange(next_date.year, next_date.month + 3)[1]
                        next_date = datetime(next_date.year, next_date.month + 3, last_day)
            elif recurring_tx.recurrence_interval.value == "yearly":
                try:
                    next_date = datetime(next_date.year + 1, next_date.month, next_date.day)
                except ValueError:
                    # Para anos bissextos (29 de fevereiro)
                    last_day = monthrange(next_date.year + 1, next_date.month)[1]
                    next_date = datetime(next_date.year + 1, next_date.month, last_day)
        
        return occurrences
    
    # Coletar todas as ocorrências recorrentes no período
    recurring_occurrences = []
    for recurring_tx in recurring_transactions:
        occurrences = calculate_recurring_occurrences(recurring_tx, start_date_dt, end_date_dt)
        recurring_occurrences.extend(occurrences)
    
    # Fluxo de caixa baseado no período selecionado
    cash_flow_data = []
    
    # Calcular número de meses no período
    current_date = start_date_dt.replace(day=1)
    end_period = end_date_dt.replace(day=1)
    
    while current_date < end_period:
        month_start = current_date
        if current_date.month == 12:
            month_end = datetime(current_date.year + 1, 1, 1)
        else:
            month_end = datetime(current_date.year, current_date.month + 1, 1)
        
        # Limitar ao período selecionado
        month_start = max(month_start, start_date_dt)
        month_end = min(month_end, end_date_dt)
        
        # Entradas: INCOME pagas no mês + INCOME pendentes/futuras com vencimento no mês
        month_income_paid = session.exec(
            select(func.sum(Transaction.amount)).where(
                and_(
                    Transaction.tenant_id == current_user.tenant_id,
                    Transaction.type == TransactionType.INCOME,
                    Transaction.status == TransactionStatus.PAID,
                    Transaction.payment_date >= month_start,
                    Transaction.payment_date < month_end
                )
            )
        ).first() or 0.0
        
        month_income_pending = session.exec(
            select(func.sum(Transaction.amount)).where(
                and_(
                    Transaction.tenant_id == current_user.tenant_id,
                    Transaction.type == TransactionType.INCOME,
                    Transaction.status == TransactionStatus.PENDING,
                    Transaction.due_date >= month_start,
                    Transaction.due_date < month_end,
                    # Excluir transações recorrentes (serão contadas separadamente)
                    Transaction.is_recurring == False
                )
            )
        ).first() or 0.0
        
        # Adicionar ocorrências recorrentes de INCOME no mês
        month_recurring_income = sum(
            occ["amount"] for occ in recurring_occurrences
            if occ["type"] == TransactionType.INCOME
            and month_start <= occ["date"] < month_end
        )
        
        month_income = float(month_income_paid or 0.0) + float(month_income_pending or 0.0) + float(month_recurring_income)
        
        # Saídas: EXPENSE pagas no mês + EXPENSE pendentes/futuras com vencimento no mês
        month_expense_paid = session.exec(
            select(func.sum(Transaction.amount)).where(
                and_(
                    Transaction.tenant_id == current_user.tenant_id,
                    Transaction.type == TransactionType.EXPENSE,
                    Transaction.status == TransactionStatus.PAID,
                    Transaction.payment_date >= month_start,
                    Transaction.payment_date < month_end
                )
            )
        ).first() or 0.0
        
        month_expense_pending = session.exec(
            select(func.sum(Transaction.amount)).where(
                and_(
                    Transaction.tenant_id == current_user.tenant_id,
                    Transaction.type == TransactionType.EXPENSE,
                    Transaction.status == TransactionStatus.PENDING,
                    Transaction.due_date >= month_start,
                    Transaction.due_date < month_end,
                    # Excluir transações recorrentes (serão contadas separadamente)
                    Transaction.is_recurring == False
                )
            )
        ).first() or 0.0
        
        # Adicionar ocorrências recorrentes de EXPENSE no mês
        month_recurring_expense = sum(
            occ["amount"] for occ in recurring_occurrences
            if occ["type"] == TransactionType.EXPENSE
            and month_start <= occ["date"] < month_end
        )
        
        month_expense = float(month_expense_paid or 0.0) + float(month_expense_pending or 0.0) + float(month_recurring_expense)
        
        cash_flow_data.append({
            "month": current_date.strftime("%Y-%m"),
            "income": month_income,
            "expense": month_expense,
            "balance": month_income - month_expense
        })
        
        # Avançar para o próximo mês
        if current_date.month == 12:
            current_date = datetime(current_date.year + 1, 1, 1)
        else:
            current_date = datetime(current_date.year, current_date.month + 1, 1)
    
    # Calcular mês/ano para compatibilidade com código antigo
    if start_date and end_date:
        target_month = start_date_dt.month
        target_year = start_date_dt.year
    else:
        target_month = month or now.month
        target_year = year or now.year
    
    # Calcular valores do mês atual (para os cards) independente do período selecionado
    current_month_start = datetime(now.year, now.month, 1)
    if now.month == 12:
        current_month_end = datetime(now.year + 1, 1, 1)
    else:
        current_month_end = datetime(now.year, now.month + 1, 1)
    
    # Total a receber no mês atual (INCOME pendentes)
    current_month_to_receive = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.type == TransactionType.INCOME,
                Transaction.status == TransactionStatus.PENDING,
                Transaction.due_date >= current_month_start,
                Transaction.due_date < current_month_end,
                Transaction.is_recurring == False
            )
        )
    ).first() or 0.0
    
    # Adicionar recorrentes do mês atual
    current_month_recurring_income = sum(
        calculate_recurring_total(tx, current_month_start, current_month_end)
        for tx in recurring_transactions_for_totals
        if tx.type == TransactionType.INCOME
    )
    current_month_to_receive = float(current_month_to_receive or 0.0) + current_month_recurring_income
    
    # Total a pagar no mês atual (EXPENSE pendentes)
    current_month_to_pay = session.exec(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.status == TransactionStatus.PENDING,
                Transaction.due_date >= current_month_start,
                Transaction.due_date < current_month_end,
                Transaction.is_recurring == False
            )
        )
    ).first() or 0.0
    
    # Adicionar recorrentes do mês atual
    current_month_recurring_expense = sum(
        calculate_recurring_total(tx, current_month_start, current_month_end)
        for tx in recurring_transactions_for_totals
        if tx.type == TransactionType.EXPENSE
    )
    current_month_to_pay = float(current_month_to_pay or 0.0) + current_month_recurring_expense
    
    return {
        "month": target_month,
        "year": target_year,
        "total_to_receive": float(total_to_receive or 0.0),  # Período selecionado
        "total_to_pay": float(total_to_pay or 0.0),  # Período selecionado
        "current_month_to_receive": current_month_to_receive,  # Mês atual
        "current_month_to_pay": current_month_to_pay,  # Mês atual
        "total_received": float(total_received or 0.0),
        "total_paid": float(total_paid or 0.0),
        "overdue_today": overdue_today,
        "cash_flow": cash_flow_data
    }


@router.get("/export-monthly-report")
async def export_monthly_report(
    month: Optional[int] = Query(None, description="Month (1-12)"),
    year: Optional[int] = Query(None, description="Year"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Export monthly financial report as PDF"""
    now = datetime.utcnow()
    target_month = month or now.month
    target_year = year or now.year
    
    # Data inicial e final do mês
    start_date = datetime(target_year, target_month, 1)
    if target_month == 12:
        end_date = datetime(target_year + 1, 1, 1)
    else:
        end_date = datetime(target_year, target_month + 1, 1)
    
    # Buscar todas as transações do mês
    transactions = session.exec(
        select(Transaction).where(
            and_(
                Transaction.tenant_id == current_user.tenant_id,
                or_(
                    and_(
                        Transaction.due_date >= start_date,
                        Transaction.due_date < end_date
                    ),
                    and_(
                        Transaction.payment_date.isnot(None),
                        Transaction.payment_date >= start_date,
                        Transaction.payment_date < end_date
                    )
                )
            )
        ).order_by(Transaction.due_date)
    ).all()
    
    # Buscar contas financeiras
    accounts = session.exec(
        select(FinancialAccount).where(
            FinancialAccount.tenant_id == current_user.tenant_id,
            FinancialAccount.is_active == True
        )
    ).all()
    
    # Calcular totais
    total_pending_income = sum(t.amount for t in transactions if t.type == TransactionType.INCOME and t.status == TransactionStatus.PENDING)
    total_pending_expense = sum(t.amount for t in transactions if t.type == TransactionType.EXPENSE and t.status == TransactionStatus.PENDING)
    total_paid_income = sum(t.amount for t in transactions if t.type == TransactionType.INCOME and t.status == TransactionStatus.PAID)
    total_paid_expense = sum(t.amount for t in transactions if t.type == TransactionType.EXPENSE and t.status == TransactionStatus.PAID)
    
    # Criar PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#0B1220'),
        spaceAfter=12,
        alignment=1  # Center
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#0B1220'),
        spaceAfter=8,
        spaceBefore=12
    )
    
    normal_style = styles['Normal']
    
    # Título
    month_names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    month_name = month_names[target_month - 1]
    title = f"Relatório Financeiro - {month_name}/{target_year}"
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 12))
    
    # Resumo
    story.append(Paragraph("Resumo do Mês", heading_style))
    
    summary_data = [
        ['Item', 'Valor'],
        ['Total a Receber', f'R$ {total_pending_income:,.2f}'],
        ['Total Recebido', f'R$ {total_paid_income:,.2f}'],
        ['Total a Pagar', f'R$ {total_pending_expense:,.2f}'],
        ['Total Pago', f'R$ {total_paid_expense:,.2f}'],
        ['Saldo do Mês', f'R$ {(total_paid_income - total_paid_expense):,.2f}'],
    ]
    
    summary_table = Table(summary_data, colWidths=[120*mm, 70*mm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1550A1')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))
    
    # Transações a Receber
    income_transactions = [t for t in transactions if t.type == TransactionType.INCOME]
    if income_transactions:
        story.append(Paragraph("Contas a Receber", heading_style))
        income_data = [['Data', 'Descrição', 'Categoria', 'Status', 'Valor']]
        for t in income_transactions:
            status_label = {'pending': 'Pendente', 'paid': 'Paga', 'overdue': 'Vencida'}.get(t.status.value, t.status.value)
            income_data.append([
                t.due_date.strftime('%d/%m/%Y'),
                t.description[:40] + ('...' if len(t.description) > 40 else ''),
                t.category.value if hasattr(t.category, 'value') else str(t.category),
                status_label,
                f'R$ {t.amount:,.2f}'
            ])
        
        income_table = Table(income_data, colWidths=[25*mm, 60*mm, 30*mm, 25*mm, 30*mm])
        income_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#22c55e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (4, 0), (4, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F0FDF4')]),
        ]))
        story.append(income_table)
        story.append(Spacer(1, 20))
    
    # Transações a Pagar
    expense_transactions = [t for t in transactions if t.type == TransactionType.EXPENSE]
    if expense_transactions:
        story.append(Paragraph("Contas a Pagar", heading_style))
        expense_data = [['Data', 'Descrição', 'Categoria', 'Status', 'Valor']]
        for t in expense_transactions:
            status_label = {'pending': 'Pendente', 'paid': 'Paga', 'overdue': 'Vencida'}.get(t.status.value, t.status.value)
            expense_data.append([
                t.due_date.strftime('%d/%m/%Y'),
                t.description[:40] + ('...' if len(t.description) > 40 else ''),
                t.category.value if hasattr(t.category, 'value') else str(t.category),
                status_label,
                f'R$ {t.amount:,.2f}'
            ])
        
        expense_table = Table(expense_data, colWidths=[25*mm, 60*mm, 30*mm, 25*mm, 30*mm])
        expense_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ef4444')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (4, 0), (4, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FEF2F2')]),
        ]))
        story.append(expense_table)
        story.append(Spacer(1, 20))
    
    # Saldos das Contas
    if accounts:
        story.append(Paragraph("Saldos das Contas", heading_style))
        accounts_data = [['Conta', 'Saldo']]
        for acc in accounts:
            balance = calculate_account_balance(session, acc.id, current_user.tenant_id)
            accounts_data.append([
                acc.name,
                f'R$ {balance:,.2f}'
            ])
        
        accounts_table = Table(accounts_data, colWidths=[120*mm, 70*mm])
        accounts_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EFF6FF')]),
        ]))
        story.append(accounts_table)
    
    # Rodapé
    story.append(Spacer(1, 20))
    footer_text = f"Relatório gerado em {now.strftime('%d/%m/%Y %H:%M')} - TYR CRM"
    story.append(Paragraph(footer_text, ParagraphStyle(
        'Footer',
        parent=normal_style,
        fontSize=8,
        textColor=colors.grey,
        alignment=1
    )))
    
    # Gerar PDF
    doc.build(story)
    buffer.seek(0)
    
    # Retornar PDF
    filename = f"relatorio_financeiro_{month_name.lower()}_{target_year}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

