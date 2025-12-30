"""
Router para gerenciar módulos customizados e criar tabelas dinâmicas
"""
import logging
import re
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, and_
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session as SQLAlchemySession
from app.database import get_session, engine
from app.models import (
    User, CustomModule, CustomField, CustomFieldCreate, CustomFieldType,
    CustomModuleCreate, CustomModuleUpdate, CustomModuleResponse
)
from app.dependencies import get_current_active_user
from app.services.audit_service import log_create, log_update, log_delete

logger = logging.getLogger(__name__)

router = APIRouter()


def validate_slug(slug: str) -> str:
    """Valida e normaliza o slug do módulo"""
    # Converter para lowercase e substituir espaços por underscores
    normalized = re.sub(r'[^a-z0-9_]', '_', slug.lower())
    # Remover underscores múltiplos
    normalized = re.sub(r'_+', '_', normalized)
    # Remover underscores no início e fim
    normalized = normalized.strip('_')
    if not normalized:
        raise ValueError("Slug inválido")
    return normalized


def get_custom_module_table_name(tenant_id: int, slug: str) -> str:
    """Gera nome da tabela para módulo customizado"""
    # Formato: custom_module_{tenant_id}_{slug}
    return f"custom_module_{tenant_id}_{slug}"


def create_custom_module_table(session: Session, tenant_id: int, slug: str, fields: List[CustomField]) -> None:
    """Cria tabela dinâmica para módulo customizado"""
    table_name = get_custom_module_table_name(tenant_id, slug)
    
    # Verificar se tabela já existe
    table_check = text(f"""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = '{table_name}'
        )
    """)
    result = session.exec(table_check).first()
    if result and result[0]:
        logger.info(f"Table {table_name} already exists")
        return
    
    # Criar colunas base
    columns = [
        "id SERIAL PRIMARY KEY",
        "tenant_id INTEGER NOT NULL",
        "owner_id INTEGER NOT NULL",
        "created_by_id INTEGER NOT NULL",
        "created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()",
        "updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()",
        "FOREIGN KEY (tenant_id) REFERENCES tenant(id)",
        "FOREIGN KEY (owner_id) REFERENCES \"user\"(id)",
        "FOREIGN KEY (created_by_id) REFERENCES \"user\"(id)"
    ]
    
    # Adicionar colunas para cada campo customizado
    for field in fields:
        if field.field_type.value == "text" or field.field_type.value == "url" or field.field_type.value == "email":
            columns.append(f"{field.field_name} VARCHAR(255)")
        elif field.field_type.value == "textarea":
            columns.append(f"{field.field_name} TEXT")
        elif field.field_type.value == "number":
            columns.append(f"{field.field_name} DECIMAL(10, 2)")
        elif field.field_type.value == "date":
            columns.append(f"{field.field_name} DATE")
        elif field.field_type.value == "boolean":
            columns.append(f"{field.field_name} BOOLEAN")
        elif field.field_type.value == "select":
            columns.append(f"{field.field_name} VARCHAR(255)")
        elif field.field_type.value == "file":
            columns.append(f"{field.field_name} VARCHAR(500)")  # URL do arquivo
        elif field.field_type.value == "relationship":
            columns.append(f"{field.field_name} INTEGER")  # ID da entidade relacionada
    
    # Criar tabela
    create_table_sql = f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            {', '.join(columns)}
        )
    """
    
    session.exec(text(create_table_sql))
    
    # Criar índices
    session.exec(text(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_tenant_id ON {table_name}(tenant_id)"))
    session.exec(text(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_owner_id ON {table_name}(owner_id)"))
    
    session.commit()
    logger.info(f"Created table {table_name}")


@router.get("", response_model=List[CustomModuleResponse])
async def get_custom_modules(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar módulos customizados do tenant"""
    modules = session.exec(
        select(CustomModule).where(
            CustomModule.tenant_id == current_user.tenant_id
        ).order_by(CustomModule.created_at.desc())
    ).all()
    
    return [
        CustomModuleResponse(
            id=module.id,
            tenant_id=module.tenant_id,
            name=module.name,
            slug=module.slug,
            description=module.description,
            icon=module.icon,
            is_active=module.is_active,
            created_at=module.created_at,
            updated_at=module.updated_at
        )
        for module in modules
    ]


@router.get("/{module_id}", response_model=CustomModuleResponse)
async def get_custom_module(
    module_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Obter módulo customizado específico"""
    try:
        import uuid
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid module ID format"
        )
    
    module = session.get(CustomModule, module_uuid)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom module not found"
        )
    
    if module.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom module does not belong to your tenant"
        )
    
    return CustomModuleResponse(
        id=module.id,
        tenant_id=module.tenant_id,
        name=module.name,
        slug=module.slug,
        description=module.description,
        icon=module.icon,
        is_active=module.is_active,
        created_at=module.created_at,
        updated_at=module.updated_at
    )


@router.post("", response_model=CustomModuleResponse)
async def create_custom_module(
    module_data: CustomModuleCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Criar novo módulo customizado"""
    # Validar e normalizar slug
    try:
        slug = validate_slug(module_data.slug)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Verificar se já existe módulo com mesmo slug
    existing = session.exec(
        select(CustomModule).where(
            and_(
                CustomModule.tenant_id == current_user.tenant_id,
                CustomModule.slug == slug
            )
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Module with slug '{slug}' already exists"
        )
    
    # Criar módulo
    module = CustomModule(
        tenant_id=current_user.tenant_id,
        name=module_data.name,
        slug=slug,
        description=module_data.description,
        icon=module_data.icon,
        is_active=module_data.is_active
    )
    
    session.add(module)
    session.commit()
    session.refresh(module)
    
    # Criar campos customizados se fornecidos
    created_fields = []
    if module_data.fields:
        for idx, field_data in enumerate(module_data.fields):
            try:
                # Validar e normalizar field_name
                import re
                field_name = field_data.field_name
                if not field_name or not field_name.strip():
                    # Se field_name não foi fornecido, gerar a partir do field_label
                    field_name = re.sub(r'[^a-z0-9_]', '_', field_data.field_label.lower())
                    field_name = re.sub(r'_+', '_', field_name).strip('_')
                
                # Normalizar field_name
                field_name = re.sub(r'[^a-z0-9_]', '_', field_name.lower())
                field_name = re.sub(r'_+', '_', field_name).strip('_')
                
                if not field_name:
                    logger.warning(f"Skipping field '{field_data.field_label}' - invalid field_name")
                    continue
                
                # Verificar se já existe campo com mesmo nome
                existing_field = session.exec(
                    select(CustomField).where(
                        and_(
                            CustomField.tenant_id == current_user.tenant_id,
                            CustomField.module_target == slug,
                            CustomField.field_name == field_name
                        )
                    )
                ).first()
                
                if existing_field:
                    logger.warning(f"Field '{field_name}' already exists, skipping")
                    continue
                
                # Criar campo
                field = CustomField(
                    tenant_id=current_user.tenant_id,
                    module_target=slug,  # Usar o slug do módulo como module_target
                    field_label=field_data.field_label,
                    field_name=field_name,
                    field_type=field_data.field_type,
                    options=field_data.options,
                    required=field_data.required if field_data.required is not None else False,
                    default_value=field_data.default_value,
                    order=field_data.order if field_data.order is not None else idx,
                    relationship_target=field_data.relationship_target
                )
                session.add(field)
                created_fields.append(field)
            except Exception as e:
                logger.error(f"Error creating field {field_data.field_label}: {e}")
                # Continuar criando outros campos mesmo se um falhar
        
        if created_fields:
            session.commit()
    
    # Criar tabela dinâmica se houver campos
    if created_fields:
        try:
            create_custom_module_table(session, current_user.tenant_id, slug, created_fields)
        except Exception as e:
            logger.error(f"Error creating table for custom module {slug}: {e}")
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create table for custom module: {str(e)}"
            )
    
    log_create(session, current_user, "CustomModule", str(module.id))
    
    return CustomModuleResponse(
        id=module.id,
        tenant_id=module.tenant_id,
        name=module.name,
        slug=module.slug,
        description=module.description,
        icon=module.icon,
        is_active=module.is_active,
        created_at=module.created_at,
        updated_at=module.updated_at
    )


@router.put("/{module_id}", response_model=CustomModuleResponse)
async def update_custom_module(
    module_id: str,
    module_data: CustomModuleUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar módulo customizado"""
    try:
        import uuid
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid module ID format"
        )
    
    module = session.get(CustomModule, module_uuid)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom module not found"
        )
    
    if module.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom module does not belong to your tenant"
        )
    
    # Atualizar campos
    update_data = module_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(module, key, value)
    
    module.updated_at = datetime.utcnow()
    session.add(module)
    session.commit()
    session.refresh(module)
    
    log_update(session, current_user, "CustomModule", str(module.id))
    
    return CustomModuleResponse(
        id=module.id,
        tenant_id=module.tenant_id,
        name=module.name,
        slug=module.slug,
        description=module.description,
        icon=module.icon,
        is_active=module.is_active,
        created_at=module.created_at,
        updated_at=module.updated_at
    )


@router.delete("/{module_id}")
async def delete_custom_module(
    module_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Deletar módulo customizado e sua tabela"""
    try:
        import uuid
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid module ID format"
        )
    
    module = session.get(CustomModule, module_uuid)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom module not found"
        )
    
    if module.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom module does not belong to your tenant"
        )
    
    # Deletar tabela dinâmica se existir
    table_name = get_custom_module_table_name(module.tenant_id, module.slug)
    try:
        drop_table_sql = text(f"DROP TABLE IF EXISTS {table_name}")
        session.exec(drop_table_sql)
        session.commit()
        logger.info(f"Dropped table {table_name}")
    except Exception as e:
        logger.warning(f"Error dropping table {table_name}: {e}")
        # Continuar mesmo se falhar ao deletar tabela
    
    module_id_str = str(module.id)
    session.delete(module)
    session.commit()
    
    log_delete(session, current_user, "CustomModule", module_id_str)
    
    return {"message": "Custom module deleted successfully"}


@router.get("/{module_id}/data", response_model=List[Dict[str, Any]])
async def get_custom_module_data(
    module_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar dados de um módulo customizado"""
    try:
        import uuid
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid module ID format"
        )
    
    module = session.get(CustomModule, module_uuid)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom module not found"
        )
    
    if module.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom module does not belong to your tenant"
        )
    
    table_name = get_custom_module_table_name(module.tenant_id, module.slug)
    
    # Verificar se tabela existe
    table_check = text(f"""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = '{table_name}'
        )
    """)
    result = session.exec(table_check).first()
    if not result or not result[0]:
        return []
    
    # Buscar dados
    select_sql = text(f"""
        SELECT * FROM {table_name}
        WHERE tenant_id = :tenant_id
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :skip
    """)
    
    result = session.execute(
        select_sql,
        {"tenant_id": current_user.tenant_id, "limit": limit, "skip": skip}
    )
    
    # Converter para dicionários
    rows = result.fetchall()
    
    # Obter nomes das colunas
    if hasattr(result, 'keys'):
        columns = list(result.keys())
    else:
        # Se não tiver keys, tentar obter do primeiro row
        if rows:
            columns = list(rows[0]._mapping.keys()) if hasattr(rows[0], '_mapping') else []
        else:
            columns = []
    
    data = []
    for row in rows:
        row_dict = {}
        # Tentar diferentes formas de acessar os dados
        if hasattr(row, '_mapping'):
            # Row object com _mapping
            row_dict = dict(row._mapping)
        elif hasattr(row, '_asdict'):
            # Named tuple
            row_dict = row._asdict()
        elif isinstance(row, dict):
            # Já é um dicionário
            row_dict = row
        elif isinstance(row, tuple):
            # Tuple simples - usar índices
            for i, col in enumerate(columns):
                if i < len(row):
                    row_dict[col] = row[i]
        else:
            # Tentar acessar como atributos
            for col in columns:
                row_dict[col] = getattr(row, col, None)
        
        # Converter tipos não serializáveis
        for key, value in row_dict.items():
            if value is None:
                continue
            # Converter datetime para string
            if hasattr(value, 'isoformat'):
                row_dict[key] = value.isoformat()
            # Converter outros tipos não serializáveis
            elif not isinstance(value, (str, int, float, bool, list, dict)):
                row_dict[key] = str(value)
        
        data.append(row_dict)
    
    return data


@router.post("/{module_id}/data")
async def create_custom_module_data(
    module_id: str,
    data: Dict[str, Any],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Criar registro em módulo customizado"""
    try:
        import uuid
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid module ID format"
        )
    
    module = session.get(CustomModule, module_uuid)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom module not found"
        )
    
    if module.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom module does not belong to your tenant"
        )
    
    table_name = get_custom_module_table_name(module.tenant_id, module.slug)
    
    # Buscar campos do módulo para validar
    fields = session.exec(
        select(CustomField).where(
            and_(
                CustomField.tenant_id == current_user.tenant_id,
                CustomField.module_target == module.slug
            )
        )
    ).all()
    
    # Preparar colunas e valores
    columns = ["tenant_id", "owner_id", "created_by_id"]
    values = [str(current_user.tenant_id), str(current_user.id), str(current_user.id)]
    placeholders = [":tenant_id", ":owner_id", ":created_by_id"]
    params = {
        "tenant_id": current_user.tenant_id,
        "owner_id": current_user.id,
        "created_by_id": current_user.id
    }
    
    # Adicionar campos customizados
    for field in fields:
        if field.field_name in data:
            columns.append(field.field_name)
            placeholders.append(f":{field.field_name}")
            params[field.field_name] = data[field.field_name]
        elif field.required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Required field '{field.field_label}' is missing"
            )
        elif field.default_value:
            columns.append(field.field_name)
            placeholders.append(f":{field.field_name}")
            params[field.field_name] = field.default_value
    
    # Inserir registro
    insert_sql = text(f"""
        INSERT INTO {table_name} ({', '.join(columns)})
        VALUES ({', '.join(placeholders)})
        RETURNING id
    """)
    
    result = session.execute(insert_sql, params)
    new_id = result.scalar()
    session.commit()
    
    return {"id": new_id, "message": "Record created successfully"}


@router.put("/{module_id}/data/{record_id}")
async def update_custom_module_data(
    module_id: str,
    record_id: int,
    data: Dict[str, Any],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Atualizar registro em módulo customizado"""
    try:
        import uuid
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid module ID format"
        )
    
    module = session.get(CustomModule, module_uuid)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom module not found"
        )
    
    if module.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom module does not belong to your tenant"
        )
    
    table_name = get_custom_module_table_name(module.tenant_id, module.slug)
    
    # Preparar SET clause
    set_clauses = ["updated_at = NOW()"]
    params = {"record_id": record_id, "tenant_id": current_user.tenant_id}
    
    # Campos que não devem ser atualizados diretamente (são gerenciados pelo sistema)
    system_fields = {"id", "tenant_id", "owner_id", "created_by_id", "created_at", "updated_at"}
    
    for key, value in data.items():
        # Ignorar campos do sistema que não devem ser atualizados pelo usuário
        if key not in system_fields:
            set_clauses.append(f"{key} = :{key}")
            params[key] = value
    
    update_sql = text(f"""
        UPDATE {table_name}
        SET {', '.join(set_clauses)}
        WHERE id = :record_id AND tenant_id = :tenant_id
    """)
    
    session.execute(update_sql, params)
    session.commit()
    
    return {"message": "Record updated successfully"}


@router.delete("/{module_id}/data/{record_id}")
async def delete_custom_module_data(
    module_id: str,
    record_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Deletar registro de módulo customizado"""
    try:
        import uuid
        module_uuid = uuid.UUID(module_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid module ID format"
        )
    
    module = session.get(CustomModule, module_uuid)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom module not found"
        )
    
    if module.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Custom module does not belong to your tenant"
        )
    
    table_name = get_custom_module_table_name(module.tenant_id, module.slug)
    
    delete_sql = text(f"""
        DELETE FROM {table_name}
        WHERE id = :record_id AND tenant_id = :tenant_id
    """)
    
    session.execute(delete_sql, {"record_id": record_id, "tenant_id": current_user.tenant_id})
    session.commit()
    
    return {"message": "Record deleted successfully"}

