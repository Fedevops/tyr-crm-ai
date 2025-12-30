from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import Session
from app.models import AuditLog, AuditAction, User


def log_action(
    session: Session,
    user: User,
    entity_type: str,
    entity_id: Any,  # Aceita int ou str (para UUIDs)
    action: AuditAction,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """
    Registra uma ação no log de auditoria.
    
    Args:
        session: Sessão do banco de dados
        user: Usuário que realizou a ação
        entity_type: Tipo da entidade (Lead, Account, Contact, etc.)
        entity_id: ID da entidade
        action: Tipo de ação (CREATE, UPDATE, DELETE, etc.)
        field_name: Nome do campo alterado (para UPDATE)
        old_value: Valor antigo (para UPDATE)
        new_value: Valor novo (para UPDATE)
        metadata: Dados adicionais em formato dict (será convertido para JSON)
    
    Returns:
        AuditLog criado
    """
    import json
    
    # Converter entity_id para int se for UUID (usar hash ou armazenar como string no metadata)
    # Para entidades com UUID, vamos armazenar o UUID no metadata e usar hash como entity_id
    entity_id_int = entity_id
    if isinstance(entity_id, str):
        # Se for string (UUID), tentar converter para int se possível, senão usar 0
        try:
            # Tentar converter UUID para int (usando hash)
            import uuid
            uuid_obj = uuid.UUID(entity_id)
            # Usar hash do UUID como entity_id (pode haver colisões, mas é melhor que nada)
            entity_id_int = abs(hash(str(uuid_obj))) % (2**31)  # Limitar a 32 bits e garantir positivo
            # Adicionar UUID ao metadata para referência completa
            if metadata is None:
                metadata = {}
            metadata['uuid'] = entity_id
        except (ValueError, AttributeError):
            # Se não for UUID válido, converter para string e usar hash
            entity_id_str = str(entity_id)
            entity_id_int = abs(hash(entity_id_str)) % (2**31)
            if metadata is None:
                metadata = {}
            metadata['original_id'] = entity_id_str
    elif not isinstance(entity_id, int):
        # Se não for int nem string, converter para string e usar hash
        entity_id_str = str(entity_id)
        entity_id_int = abs(hash(entity_id_str)) % (2**31)
        if metadata is None:
            metadata = {}
        metadata['original_id'] = entity_id_str
    
    # Converter metadata dict para JSON string (após adicionar UUID se necessário)
    metadata_json = None
    if metadata:
        try:
            metadata_json = json.dumps(metadata, ensure_ascii=False)
        except (TypeError, ValueError):
            # Se não conseguir serializar, converter valores para string
            metadata_json = json.dumps({k: str(v) for k, v in metadata.items()}, ensure_ascii=False)
    
    # Converter valores para string se necessário
    old_value_str = str(old_value) if old_value is not None else None
    new_value_str = str(new_value) if new_value is not None else None
    
    audit_log = AuditLog(
        tenant_id=user.tenant_id,
        user_id=user.id,
        entity_type=entity_type,
        entity_id=entity_id_int,
        action=action,
        field_name=field_name,
        old_value=old_value_str,
        new_value=new_value_str,
        metadata_json=metadata_json,
        created_at=datetime.utcnow()
    )
    
    session.add(audit_log)
    session.commit()
    session.refresh(audit_log)
    
    return audit_log


def log_create(
    session: Session,
    user: User,
    entity_type: str,
    entity_id: Any,  # Aceita int ou str (para UUIDs)
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Registra criação de uma entidade"""
    return log_action(
        session=session,
        user=user,
        entity_type=entity_type,
        entity_id=entity_id,
        action=AuditAction.CREATE,
        metadata=metadata
    )


def log_update(
    session: Session,
    user: User,
    entity_type: str,
    entity_id: Any,  # Aceita int ou str (para UUIDs)
    field_name: str,
    old_value: Any,
    new_value: Any,
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Registra atualização de um campo"""
    return log_action(
        session=session,
        user=user,
        entity_type=entity_type,
        entity_id=entity_id,
        action=AuditAction.UPDATE,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        metadata=metadata
    )


def log_delete(
    session: Session,
    user: User,
    entity_type: str,
    entity_id: Any,  # Aceita int ou str (para UUIDs)
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Registra deleção de uma entidade"""
    return log_action(
        session=session,
        user=user,
        entity_type=entity_type,
        entity_id=entity_id,
        action=AuditAction.DELETE,
        metadata=metadata
    )


def log_assign(
    session: Session,
    user: User,
    entity_type: str,
    entity_id: int,
    old_owner_id: Optional[int],
    new_owner_id: int,
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Registra atribuição de ownership"""
    return log_action(
        session=session,
        user=user,
        entity_type=entity_type,
        entity_id=entity_id,
        action=AuditAction.ASSIGN,
        field_name="owner_id",
        old_value=str(old_owner_id) if old_owner_id else None,
        new_value=str(new_owner_id),
        metadata=metadata
    )


def log_status_change(
    session: Session,
    user: User,
    entity_type: str,
    entity_id: int,
    old_status: str,
    new_status: str,
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Registra mudança de status"""
    return log_action(
        session=session,
        user=user,
        entity_type=entity_type,
        entity_id=entity_id,
        action=AuditAction.STATUS_CHANGE,
        field_name="status",
        old_value=old_status,
        new_value=new_status,
        metadata=metadata
    )


def log_stage_change(
    session: Session,
    user: User,
    entity_type: str,
    entity_id: int,
    old_stage_id: Optional[int],
    new_stage_id: int,
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Registra mudança de estágio (para Opportunities)"""
    return log_action(
        session=session,
        user=user,
        entity_type=entity_type,
        entity_id=entity_id,
        action=AuditAction.STAGE_CHANGE,
        field_name="stage_id",
        old_value=str(old_stage_id) if old_stage_id else None,
        new_value=str(new_stage_id),
        metadata=metadata
    )


def log_convert(
    session: Session,
    user: User,
    source_entity_type: str,
    source_entity_id: int,
    target_entity_type: str,
    target_entity_id: int,
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Registra conversão de uma entidade (ex: Lead → Account)"""
    convert_metadata = {
        "source_entity_type": source_entity_type,
        "source_entity_id": source_entity_id,
        "target_entity_type": target_entity_type,
        "target_entity_id": target_entity_id,
        **(metadata or {})
    }
    return log_action(
        session=session,
        user=user,
        entity_type=source_entity_type,
        entity_id=source_entity_id,
        action=AuditAction.CONVERT,
        metadata=convert_metadata
    )



