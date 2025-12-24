from typing import List, Optional, Dict, Any, Union
from enum import Enum
import csv
import io
import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, BackgroundTasks, Body
from fastapi.responses import Response, JSONResponse
from sqlmodel import Session, select, or_, and_, func
from pydantic import BaseModel, Field
from app.database import get_session
from app.models import (
    Lead, LeadCreate, LeadResponse, LeadStatus, User,
    LeadComment, LeadCommentCreate, LeadCommentResponse
)
from app.dependencies import get_current_active_user
from app.services.enrichment_service import enrich_lead
import pandas as pd
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# Modelos para filtros avançados
class FilterOperator(str, Enum):
    """Operadores disponíveis para filtros"""
    # Operadores numéricos e de data
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    GREATER_THAN_OR_EQUAL = "greater_than_or_equal"
    LESS_THAN_OR_EQUAL = "less_than_or_equal"
    BETWEEN = "between"
    
    # Operadores de string
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    
    # Operadores especiais
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"
    IN = "in"
    NOT_IN = "not_in"


class LeadFilter(BaseModel):
    """Filtro individual para um campo"""
    field: str = Field(..., description="Nome do campo do Lead")
    operator: str = Field(..., description="Operador de comparação")
    value: Optional[Union[str, int, float, bool, List[Any]]] = Field(None, description="Valor para comparação")
    value2: Optional[Union[str, int, float]] = Field(None, description="Segundo valor (para operador BETWEEN)")


class LeadFiltersRequest(BaseModel):
    """Request com múltiplos filtros"""
    filters: List[LeadFilter] = Field(default_factory=list, description="Lista de filtros")
    logic: str = Field("AND", description="Lógica de combinação: 'AND' ou 'OR'")
    search: Optional[str] = Field(None, description="Busca geral em name, email, company")
    status: Optional[LeadStatus] = None
    assigned_to: Optional[int] = None
    source: Optional[str] = None
    min_score: Optional[int] = None
    max_score: Optional[int] = None
    skip: int = 0
    limit: int = 100


# Mapeamento de campos e seus tipos
FIELD_TYPES: Dict[str, str] = {
    # Campos numéricos
    "id": "number",
    "score": "number",
    "capital_social": "number",
    "assigned_to": "number",
    
    # Campos de data
    "data_abertura": "date",
    "data_situacao_cadastral": "date",
    "data_opcao_simples": "date",
    "data_exclusao_simples": "date",
    "last_contact": "date",
    "next_followup": "date",
    "created_at": "date",
    "updated_at": "date",
    
    # Campos booleanos
    "simples_nacional": "boolean",
    
    # Campos de enum/dropdown
    "status": "enum",
    "situacao_cadastral": "enum",
    "porte": "enum",
    "natureza_juridica": "enum",
    "uf": "enum",
    
    # Campos de string (padrão)
    # Todos os outros campos são tratados como string
}


def get_field_type(field_name: str) -> str:
    """Retorna o tipo do campo"""
    return FIELD_TYPES.get(field_name, "string")


@router.get("/filter-fields")
async def get_filter_fields():
    """Retorna os campos disponíveis para filtros e seus tipos"""
    fields_info = []
    
    # Campos básicos
    basic_fields = [
        ("name", "string", "Nome"),
        ("email", "string", "E-mail"),
        ("phone", "string", "Telefone"),
        ("company", "string", "Empresa"),
        ("position", "string", "Cargo"),
        ("status", "enum", "Status"),
        ("source", "string", "Origem"),
        ("score", "number", "Score"),
    ]
    
    # Campos Casa dos Dados
    fiscal_fields = [
        ("cnpj", "string", "CNPJ"),
        ("razao_social", "string", "Razão Social"),
        ("nome_fantasia", "string", "Nome Fantasia"),
        ("data_abertura", "date", "Data de Abertura"),
        ("capital_social", "number", "Capital Social"),
        ("situacao_cadastral", "enum", "Situação Cadastral"),
        ("porte", "enum", "Porte"),
        ("natureza_juridica", "enum", "Natureza Jurídica"),
        ("municipio", "string", "Município"),
        ("uf", "enum", "UF"),
        ("cnae_principal_descricao", "string", "CNAE Principal"),
        ("simples_nacional", "boolean", "Simples Nacional"),
    ]
    
    # Campos de enriquecimento
    enrichment_fields = [
        ("city", "string", "Cidade"),
        ("state", "string", "Estado"),
        ("industry", "string", "Indústria"),
        ("company_size", "string", "Tamanho da Empresa"),
    ]
    
    all_fields = basic_fields + fiscal_fields + enrichment_fields
    
    for field_name, field_type, label in all_fields:
        operators = []
        
        if field_type == "number":
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "greater_than", "label": "Maior que"},
                {"value": "less_than", "label": "Menor que"},
                {"value": "greater_than_or_equal", "label": "Maior ou igual a"},
                {"value": "less_than_or_equal", "label": "Menor ou igual a"},
                {"value": "between", "label": "Entre"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        elif field_type == "date":
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "greater_than", "label": "Depois de"},
                {"value": "less_than", "label": "Antes de"},
                {"value": "between", "label": "Entre"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        elif field_type == "boolean":
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        elif field_type == "enum":
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "in", "label": "Está em"},
                {"value": "not_in", "label": "Não está em"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        else:  # string
            operators = [
                {"value": "equals", "label": "Igual a"},
                {"value": "not_equals", "label": "Diferente de"},
                {"value": "contains", "label": "Contém"},
                {"value": "not_contains", "label": "Não contém"},
                {"value": "starts_with", "label": "Começa com"},
                {"value": "ends_with", "label": "Termina com"},
                {"value": "is_null", "label": "É nulo"},
                {"value": "is_not_null", "label": "Não é nulo"},
            ]
        
        fields_info.append({
            "field": field_name,
            "type": field_type,
            "label": label,
            "operators": operators
        })
    
    return {"fields": fields_info}


@router.post("", response_model=LeadResponse)
async def create_lead(
    lead_data: LeadCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new lead for the current tenant"""
    lead = Lead(
        **lead_data.dict(),
        tenant_id=current_user.tenant_id
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


@router.post("/filter", response_model=List[LeadResponse])
async def filter_leads(
    filters_request: LeadFiltersRequest = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get leads with advanced filters"""
    logger.info(f"🔍 [FILTERS] Recebida requisição de filtros: {len(filters_request.filters)} filtro(s), lógica={filters_request.logic}")
    
    # Base query for counting
    count_query = select(func.count(Lead.id)).where(Lead.tenant_id == current_user.tenant_id)
    
    # Query for data
    query = select(Lead).where(Lead.tenant_id == current_user.tenant_id)
    
    # Aplicar filtros avançados
    filter_conditions = []
    
    # Filtros estruturados
    if filters_request.filters:
        for filter_obj in filters_request.filters:
            try:
                # Verificar se o campo existe
                if not hasattr(Lead, filter_obj.field):
                    logger.warning(f"Campo '{filter_obj.field}' não existe no modelo Lead")
                    continue
                
                field = getattr(Lead, filter_obj.field)
                field_type = get_field_type(filter_obj.field)
                operator = filter_obj.operator
                value = filter_obj.value
                value2 = filter_obj.value2
                
                logger.info(f"Aplicando filtro: campo={filter_obj.field}, operador={operator}, valor={value}, tipo={field_type}")
                
                # Ignorar filtros sem valor (exceto para operadores is_null/is_not_null)
                if value is None and operator not in ["is_null", "is_not_null"]:
                    logger.warning(f"Filtro ignorado: campo '{filter_obj.field}' sem valor")
                    continue
                
                if operator == "equals":
                    if field_type == "string":
                        # Para strings, equals deve ser comparação exata (case-insensitive)
                        if value:
                            filter_conditions.append(field.ilike(f"{value}"))
                    else:
                        filter_conditions.append(field == value)
                
                elif operator == "not_equals":
                    if field_type == "string":
                        # Para strings, not_equals deve ser comparação exata (case-insensitive)
                        if value:
                            filter_conditions.append(~field.ilike(f"{value}"))
                    else:
                        filter_conditions.append(field != value)
                
                elif operator == "greater_than":
                    if value is not None:
                        filter_conditions.append(field > value)
                
                elif operator == "less_than":
                    if value is not None:
                        filter_conditions.append(field < value)
                
                elif operator == "greater_than_or_equal":
                    if value is not None:
                        filter_conditions.append(field >= value)
                
                elif operator == "less_than_or_equal":
                    if value is not None:
                        filter_conditions.append(field <= value)
                
                elif operator == "between":
                    if value is not None and value2 is not None:
                        filter_conditions.append(and_(field >= value, field <= value2))
                    else:
                        logger.warning(f"Filtro 'between' ignorado: valores incompletos")
                
                elif operator == "contains":
                    if value:
                        filter_conditions.append(field.ilike(f"%{value}%"))
                
                elif operator == "not_contains":
                    if value:
                        filter_conditions.append(~field.ilike(f"%{value}%"))
                
                elif operator == "starts_with":
                    if value:
                        filter_conditions.append(field.ilike(f"{value}%"))
                
                elif operator == "ends_with":
                    if value:
                        filter_conditions.append(field.ilike(f"%{value}"))
                
                elif operator == "is_null":
                    filter_conditions.append(field.is_(None))
                
                elif operator == "is_not_null":
                    filter_conditions.append(field.isnot(None))
                
                elif operator == "in":
                    if value:
                        if not isinstance(value, list):
                            value = [value]
                        filter_conditions.append(field.in_(value))
                
                elif operator == "not_in":
                    if value:
                        if not isinstance(value, list):
                            value = [value]
                        filter_conditions.append(~field.in_(value))
                
            except Exception as e:
                logger.error(f"Erro ao aplicar filtro {filter_obj.field}: {e}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Erro ao aplicar filtro no campo '{filter_obj.field}': {str(e)}"
                )
    
    # Filtros legados (compatibilidade)
    if filters_request.status:
        filter_conditions.append(Lead.status == filters_request.status)
    
    if filters_request.assigned_to:
        filter_conditions.append(Lead.assigned_to == filters_request.assigned_to)
    
    if filters_request.source:
        filter_conditions.append(Lead.source == filters_request.source)
    
    if filters_request.min_score is not None:
        filter_conditions.append(Lead.score >= filters_request.min_score)
    
    if filters_request.max_score is not None:
        filter_conditions.append(Lead.score <= filters_request.max_score)
    
    if filters_request.search:
        search_filter = or_(
            Lead.name.ilike(f"%{filters_request.search}%"),
            Lead.email.ilike(f"%{filters_request.search}%"),
            Lead.company.ilike(f"%{filters_request.search}%")
        )
        filter_conditions.append(search_filter)
    
    # Combinar filtros com lógica AND ou OR
    if filter_conditions:
        logger.info(f"🔍 [FILTERS] Aplicando {len(filter_conditions)} condição(ões) com lógica {filters_request.logic}")
        if filters_request.logic.upper() == "OR":
            combined_filter = or_(*filter_conditions)
        else:
            combined_filter = and_(*filter_conditions)
        
        query = query.where(combined_filter)
        count_query = count_query.where(combined_filter)
    else:
        logger.warning("🔍 [FILTERS] Nenhuma condição de filtro aplicada")
    
    # Order by created_at descending (newest first)
    query = query.order_by(Lead.created_at.desc())
    
    # Get total count before pagination
    total_count = session.exec(count_query).one()
    
    # Apply pagination
    query = query.offset(filters_request.skip).limit(filters_request.limit)
    
    leads = session.exec(query).all()
    
    # Serialize leads properly (handles datetime objects)
    leads_data = []
    for lead in leads:
        lead_dict = lead.dict()
        # Convert datetime objects to ISO format strings
        for key, value in lead_dict.items():
            if isinstance(value, datetime):
                lead_dict[key] = value.isoformat()
        leads_data.append(lead_dict)
    
    # Return JSONResponse with total count in header
    response = JSONResponse(content=leads_data)
    response.headers["X-Total-Count"] = str(total_count)
    return response


@router.get("", response_model=List[LeadResponse])
async def get_leads(
    status: Optional[LeadStatus] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search in name, email, company"),
    assigned_to: Optional[int] = Query(None, description="Filter by assigned user"),
    source: Optional[str] = Query(None, description="Filter by source"),
    min_score: Optional[int] = Query(None, description="Minimum score"),
    max_score: Optional[int] = Query(None, description="Maximum score"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all leads for the current tenant with filters (legacy endpoint)"""
    # Base query for counting
    count_query = select(func.count(Lead.id)).where(Lead.tenant_id == current_user.tenant_id)
    
    # Query for data
    query = select(Lead).where(Lead.tenant_id == current_user.tenant_id)
    
    # Apply filters
    filters = []
    
    if status:
        filters.append(Lead.status == status)
    
    if assigned_to:
        filters.append(Lead.assigned_to == assigned_to)
    
    if source:
        filters.append(Lead.source == source)
    
    if min_score is not None:
        filters.append(Lead.score >= min_score)
    
    if max_score is not None:
        filters.append(Lead.score <= max_score)
    
    if search:
        search_filter = or_(
            Lead.name.ilike(f"%{search}%"),
            Lead.email.ilike(f"%{search}%"),
            Lead.company.ilike(f"%{search}%")
        )
        filters.append(search_filter)
    
    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))
    
    # Order by created_at descending (newest first)
    query = query.order_by(Lead.created_at.desc())
    
    # Get total count before pagination
    total_count = session.exec(count_query).one()
    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    leads = session.exec(query).all()
    
    # Return leads - FastAPI will serialize them via response_model
    # We need to add the total count to the response headers
    from fastapi import Response
    from fastapi.responses import JSONResponse
    
    # Serialize leads properly (handles datetime objects)
    leads_data = []
    for lead in leads:
        lead_dict = lead.dict()
        # Convert datetime objects to ISO format strings
        for key, value in lead_dict.items():
            if isinstance(value, datetime):
                lead_dict[key] = value.isoformat()
        leads_data.append(lead_dict)
    
    # Return JSONResponse with total count in header
    response = JSONResponse(content=leads_data)
    response.headers["X-Total-Count"] = str(total_count)
    return response


@router.get("/stats/summary", response_model=dict)
async def get_leads_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get leads statistics for the current tenant"""
    query = select(Lead).where(Lead.tenant_id == current_user.tenant_id)
    all_leads = session.exec(query).all()
    
    stats = {
        "total": len(all_leads),
        "by_status": {},
        "by_source": {},
        "average_score": 0,
        "assigned": 0,
        "unassigned": 0
    }
    
    total_score = 0
    leads_with_score = 0
    
    for lead in all_leads:
        # Count by status
        status_key = lead.status.value if isinstance(lead.status, LeadStatus) else lead.status
        stats["by_status"][status_key] = stats["by_status"].get(status_key, 0) + 1
        
        # Count by source
        if lead.source:
            stats["by_source"][lead.source] = stats["by_source"].get(lead.source, 0) + 1
        
        # Calculate average score
        if lead.score is not None:
            total_score += lead.score
            leads_with_score += 1
        
        # Count assigned/unassigned
        if lead.assigned_to:
            stats["assigned"] += 1
        else:
            stats["unassigned"] += 1
    
    if leads_with_score > 0:
        stats["average_score"] = round(total_score / leads_with_score, 2)
    
    return stats


@router.get("/import-template")
async def download_import_template():
    """Download CSV template for lead import"""
    
    # Create CSV content
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        'Nome',
        'Empresa',
        'Cargo',
        'Linkedin',
        'Data 1o contato',
        'Status',
        'Próxima ação',
        'Observação'
    ])
    
    # Write example rows
    writer.writerow([
        'João Silva',
        'Tech Solutions',
        'CEO',
        'https://www.linkedin.com/in/joaosilva',
        '22/01/2024',
        'Lead Novo',
        'Enviar conexão com nota',
        'Interessado em automação'
    ])
    writer.writerow([
        'Maria Santos',
        'Inovação Digital',
        'CTO',
        'https://www.linkedin.com/in/mariasantos',
        '22/01/2024',
        'Lead Novo',
        'Enviar conexão com nota',
        ''
    ])
    
    csv_content = output.getvalue()
    output.close()
    
    return Response(
        content=csv_content.encode('utf-8-sig'),  # BOM for Excel compatibility
        media_type='text/csv',
        headers={
            'Content-Disposition': 'attachment; filename="template_importacao_leads.csv"'
        }
    )


async def process_lead_enrichment(lead_id: int, cnpj: str):
    """Processa o enriquecimento de um lead em background"""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Criar nova sessão para o background task
        from app.database import engine
        from sqlmodel import Session
        with Session(engine) as db:
            try:
                lead = db.get(Lead, lead_id)
                if lead and cnpj:
                    enriched_lead = await enrich_lead(lead, cnpj)
                    db.add(enriched_lead)
                    db.commit()
                    db.refresh(enriched_lead)
                    logger.info(f"✅ [BACKGROUND] Lead {lead_id} enriquecido com sucesso")
                else:
                    logger.warning(f"⚠️ [BACKGROUND] Lead {lead_id} não encontrado ou CNPJ inválido")
            except Exception as db_error:
                db.rollback()
                logger.error(f"❌ [BACKGROUND] Erro no banco ao enriquecer lead {lead_id}: {db_error}")
    except Exception as e:
        logger.error(f"❌ [BACKGROUND] Erro ao enriquecer lead {lead_id}: {e}")
        import traceback
        traceback.print_exc()
        import traceback
        traceback.print_exc()


@router.post("/import-csv")
async def import_leads_csv(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Import leads from CSV file (formato Casa dos Dados)
    Processa o CSV com pandas e inicia enriquecimento agêntico para cada linha
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV file"
        )
    
    try:
        # Ler arquivo com pandas
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents), encoding='utf-8-sig', dtype=str)
        
        logger.info(f"📊 [IMPORT] CSV lido com sucesso. {len(df)} linhas encontradas")
        logger.info(f"📊 [IMPORT] Colunas: {list(df.columns)}")
        
        imported = 0
        errors = []
        leads_to_enrich = []  # Lista de (lead_id, cnpj) para enriquecimento
        
        for idx, row in df.iterrows():
            try:
                row_num = idx + 2  # +2 porque idx começa em 0 e linha 1 é header
                
                # Extrair CNPJ (campo obrigatório para enriquecimento)
                cnpj = None
                for col in ['cnpj', 'CNPJ', 'Cnpj']:
                    if col in row and pd.notna(row[col]):
                        cnpj = str(row[col]).strip().replace('.', '').replace('/', '').replace('-', '')
                        break
                
                if not cnpj or len(cnpj) != 14:
                    errors.append(f"Linha {row_num}: CNPJ inválido ou não encontrado")
                    continue
                
                # Verificar se lead já existe pelo CNPJ
                existing_lead = session.exec(
                    select(Lead).where(
                        and_(
                            Lead.tenant_id == current_user.tenant_id,
                            Lead.cnpj == cnpj
                        )
                    )
                ).first()
                
                if existing_lead:
                    logger.info(f"📋 [IMPORT] Lead com CNPJ {cnpj} já existe. Atualizando...")
                    lead = existing_lead
                else:
                    # Criar novo lead
                    # Extrair nome (pode ser do primeiro sócio ou razao_social)
                    name = None
                    for col in ['nome', 'Nome', 'NOME', 'name', 'Name']:
                        if col in row and pd.notna(row[col]):
                            name = str(row[col]).strip()
                            break
                    
                    # Se não tem nome, usar razao_social
                    if not name:
                        for col in ['razao_social', 'Razao Social', 'RAZAO_SOCIAL']:
                            if col in row and pd.notna(row[col]):
                                name = str(row[col]).strip()
                                break
                    
                    if not name:
                        errors.append(f"Linha {row_num}: Nome não encontrado")
                        continue
                    
                    lead = Lead(
                        tenant_id=current_user.tenant_id,
                        name=name,
                        cnpj=cnpj,
                        source='CSV Import - Casa dos Dados'
                    )
                    session.add(lead)
                    session.flush()  # Para obter o ID
                
                # Mapear colunas do CSV para campos do Lead
                # Razão Social
                for col in ['razao_social', 'Razao Social', 'RAZAO_SOCIAL', 'razaoSocial']:
                    if col in row and pd.notna(row[col]):
                        lead.razao_social = str(row[col]).strip()
                        if not lead.company:
                            lead.company = lead.razao_social
                        break
                
                # Nome Fantasia
                for col in ['nome_fantasia', 'Nome Fantasia', 'NOME_FANTASIA', 'nomeFantasia']:
                    if col in row and pd.notna(row[col]):
                        lead.nome_fantasia = str(row[col]).strip()
                        break
                
                # Data de Abertura
                for col in ['data_abertura', 'Data Abertura', 'DATA_ABERTURA', 'dataAbertura']:
                    if col in row and pd.notna(row[col]):
                        try:
                            date_str = str(row[col]).strip()
                            # Tentar diferentes formatos
                            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d']:
                                try:
                                    lead.data_abertura = datetime.strptime(date_str, fmt)
                                    break
                                except ValueError:
                                    continue
                        except Exception:
                            pass
                        break
                
                # Capital Social
                for col in ['capital_social', 'Capital Social', 'CAPITAL_SOCIAL', 'capitalSocial']:
                    if col in row and pd.notna(row[col]):
                        try:
                            capital_str = str(row[col]).strip().replace(',', '.').replace('R$', '').strip()
                            lead.capital_social = float(capital_str)
                        except (ValueError, TypeError):
                            pass
                        break
                
                # Situação Cadastral
                for col in ['situacao_cadastral', 'Situação Cadastral', 'SITUACAO_CADATRAL']:
                    if col in row and pd.notna(row[col]):
                        lead.situacao_cadastral = str(row[col]).strip()
                        break
                
                # Endereço
                for col in ['logradouro', 'Logradouro', 'LOGRADOURO']:
                    if col in row and pd.notna(row[col]):
                        lead.logradouro = str(row[col]).strip()
                        break
                
                for col in ['numero', 'Número', 'NUMERO', 'numero']:
                    if col in row and pd.notna(row[col]):
                        lead.numero = str(row[col]).strip()
                        break
                
                for col in ['bairro', 'Bairro', 'BAIRRO']:
                    if col in row and pd.notna(row[col]):
                        lead.bairro = str(row[col]).strip()
                        break
                
                for col in ['cep', 'CEP', 'Cep']:
                    if col in row and pd.notna(row[col]):
                        cep = str(row[col]).strip().replace('-', '').replace('.', '')
                        lead.cep = cep
                        lead.zip_code = cep
                        break
                
                for col in ['municipio', 'Município', 'MUNICIPIO', 'município']:
                    if col in row and pd.notna(row[col]):
                        lead.municipio = str(row[col]).strip()
                        lead.city = lead.municipio
                        break
                
                for col in ['uf', 'UF', 'Uf', 'estado', 'Estado']:
                    if col in row and pd.notna(row[col]):
                        lead.uf = str(row[col]).strip().upper()
                        lead.state = lead.uf
                        break
                
                # Complemento
                for col in ['complemento', 'Complemento', 'COMPLEMENTO']:
                    if col in row and pd.notna(row[col]):
                        lead.complemento = str(row[col]).strip()
                        break
                
                # Situação Cadastral (campos adicionais)
                for col in ['data_situacao_cadastral', 'Data Situação Cadastral', 'dataSituacaoCadastral']:
                    if col in row and pd.notna(row[col]):
                        try:
                            date_str = str(row[col]).strip()
                            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d']:
                                try:
                                    lead.data_situacao_cadastral = datetime.strptime(date_str, fmt)
                                    break
                                except ValueError:
                                    continue
                        except Exception:
                            pass
                        break
                
                for col in ['motivo_situacao_cadastral', 'Motivo Situação Cadastral', 'motivoSituacaoCadastral']:
                    if col in row and pd.notna(row[col]):
                        lead.motivo_situacao_cadastral = str(row[col]).strip()
                        break
                
                # Natureza Jurídica
                for col in ['natureza_juridica', 'Natureza Jurídica', 'NATUREZA_JURIDICA', 'naturezaJuridica']:
                    if col in row and pd.notna(row[col]):
                        lead.natureza_juridica = str(row[col]).strip()
                        break
                
                # Porte
                for col in ['porte', 'Porte', 'PORTE']:
                    if col in row and pd.notna(row[col]):
                        lead.porte = str(row[col]).strip()
                        break
                
                # CNAE Principal
                for col in ['cnae_principal_codigo', 'CNAE Principal Código', 'cnaePrincipalCodigo', 'cnae_principal', 'CNAE Principal']:
                    if col in row and pd.notna(row[col]):
                        lead.cnae_principal_codigo = str(row[col]).strip()
                        break
                
                for col in ['cnae_principal_descricao', 'CNAE Principal Descrição', 'cnaePrincipalDescricao']:
                    if col in row and pd.notna(row[col]):
                        lead.cnae_principal_descricao = str(row[col]).strip()
                        if not lead.industry:
                            lead.industry = lead.cnae_principal_descricao
                        break
                
                # CNAEs Secundários
                for col in ['cnaes_secundarios', 'CNAEs Secundários', 'CNAES_SECUNDARIOS', 'cnaesSecundarios', 'cnaes_secundarios_json']:
                    if col in row and pd.notna(row[col]):
                        cnaes_value = str(row[col]).strip()
                        try:
                            json.loads(cnaes_value)
                            lead.cnaes_secundarios_json = cnaes_value
                        except:
                            lead.cnaes_secundarios_json = cnaes_value
                        break
                
                # Telefone e Email da Empresa
                for col in ['telefone_empresa', 'Telefone Empresa', 'TELEFONE_EMPRESA', 'telefoneEmpresa', 'telefone', 'Telefone']:
                    if col in row and pd.notna(row[col]):
                        lead.telefone_empresa = str(row[col]).strip()
                        if not lead.phone:
                            lead.phone = lead.telefone_empresa
                        break
                
                for col in ['email_empresa', 'Email Empresa', 'EMAIL_EMPRESA', 'emailEmpresa', 'email', 'Email']:
                    if col in row and pd.notna(row[col]):
                        lead.email_empresa = str(row[col]).strip()
                        if not lead.email:
                            lead.email = lead.email_empresa
                        break
                
                # Simples Nacional
                for col in ['simples_nacional', 'Simples Nacional', 'SIMPLES_NACIONAL', 'simplesNacional', 'optante_simples']:
                    if col in row and pd.notna(row[col]):
                        simples_value = str(row[col]).strip().lower()
                        lead.simples_nacional = simples_value in ['true', '1', 'sim', 'yes', 's']
                        break
                
                for col in ['data_opcao_simples', 'Data Opção Simples', 'dataOpcaoSimples']:
                    if col in row and pd.notna(row[col]):
                        try:
                            date_str = str(row[col]).strip()
                            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d']:
                                try:
                                    lead.data_opcao_simples = datetime.strptime(date_str, fmt)
                                    break
                                except ValueError:
                                    continue
                        except Exception:
                            pass
                        break
                
                for col in ['data_exclusao_simples', 'Data Exclusão Simples', 'dataExclusaoSimples']:
                    if col in row and pd.notna(row[col]):
                        try:
                            date_str = str(row[col]).strip()
                            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d']:
                                try:
                                    lead.data_exclusao_simples = datetime.strptime(date_str, fmt)
                                    break
                                except ValueError:
                                    continue
                        except Exception:
                            pass
                        break
                
                # Sócios (pode estar em formato JSON ou texto)
                for col in ['socios', 'Sócios', 'SOCIOS', 'socios_json', 'sociosJson']:
                    if col in row and pd.notna(row[col]):
                        socios_value = str(row[col]).strip()
                        # Se já é JSON válido, usar direto
                        try:
                            json.loads(socios_value)
                            lead.socios_json = socios_value
                        except:
                            # Se não é JSON, tentar converter
                            lead.socios_json = socios_value
                        break
                
                # Montar endereço completo
                endereco_parts = []
                if lead.logradouro:
                    endereco_parts.append(lead.logradouro)
                if lead.numero:
                    endereco_parts.append(lead.numero)
                if lead.complemento:
                    endereco_parts.append(lead.complemento)
                if lead.bairro:
                    endereco_parts.append(lead.bairro)
                if lead.municipio:
                    endereco_parts.append(lead.municipio)
                if lead.uf:
                    endereco_parts.append(lead.uf)
                if lead.cep:
                    endereco_parts.append(f"CEP: {lead.cep}")
                
                if endereco_parts:
                    lead.address = ', '.join(endereco_parts)
                
                lead.updated_at = datetime.utcnow()
                session.add(lead)
                session.flush()
                
                imported += 1
                
                # Adicionar à lista para enriquecimento em background
                if cnpj:
                    leads_to_enrich.append((lead.id, cnpj))
                
            except Exception as e:
                errors.append(f"Linha {row_num}: {str(e)}")
                logger.error(f"❌ [IMPORT] Erro na linha {row_num}: {e}")
                continue
        
        session.commit()
        
        # Iniciar enriquecimento em background para cada lead
        for lead_id, cnpj in leads_to_enrich:
            background_tasks.add_task(process_lead_enrichment, lead_id, cnpj, session)
            logger.info(f"🚀 [IMPORT] Enriquecimento agendado para lead {lead_id} (CNPJ: {cnpj})")
        
        return {
            "message": f"Importação concluída. {len(leads_to_enrich)} lead(s) serão enriquecidos em background.",
            "imported": imported,
            "enrichment_scheduled": len(leads_to_enrich),
            "errors": errors if errors else None
        }
        
    except Exception as e:
        session.rollback()
        logger.error(f"❌ [IMPORT] Erro ao processar CSV: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao processar arquivo CSV: {str(e)}"
        )


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific lead"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    return lead


@router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: int,
    lead_data: LeadCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a lead"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    for key, value in lead_data.dict().items():
        setattr(lead, key, value)
    
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a lead"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    session.delete(lead)
    session.commit()
    return {"message": "Lead deleted successfully"}


@router.post("/{lead_id}/comments", response_model=LeadCommentResponse)
async def create_lead_comment(
    lead_id: int,
    comment_data: LeadCommentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a comment on a lead"""
    # Verify lead belongs to tenant
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    # Create comment
    comment = LeadComment(
        tenant_id=current_user.tenant_id,
        lead_id=lead_id,
        user_id=current_user.id,
        comment=comment_data.comment
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    
    # Update lead's updated_at
    lead.updated_at = datetime.utcnow()
    session.add(lead)
    session.commit()
    
    # Get user info for response
    user = session.get(User, current_user.id)
    response = LeadCommentResponse(
        id=comment.id,
        tenant_id=comment.tenant_id,
        lead_id=comment.lead_id,
        user_id=comment.user_id,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user_name=user.full_name if user else None,
        user_email=user.email if user else None
    )
    
    return response


@router.get("/{lead_id}/comments", response_model=List[LeadCommentResponse])
async def get_lead_comments(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all comments for a lead"""
    # Verify lead belongs to tenant
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    # Get comments
    comments = session.exec(
        select(LeadComment)
        .where(
            and_(
                LeadComment.lead_id == lead_id,
                LeadComment.tenant_id == current_user.tenant_id
            )
        )
        .order_by(LeadComment.created_at.desc())
    ).all()
    
    # Get user info for each comment
    result = []
    for comment in comments:
        user = session.get(User, comment.user_id)
        result.append(LeadCommentResponse(
            id=comment.id,
            tenant_id=comment.tenant_id,
            lead_id=comment.lead_id,
            user_id=comment.user_id,
            comment=comment.comment,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            user_name=user.full_name if user else None,
            user_email=user.email if user else None
        ))
    
    return result


@router.delete("/comments/{comment_id}")
async def delete_lead_comment(
    comment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a comment"""
    comment = session.get(LeadComment, comment_id)
    if not comment or comment.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Only allow deletion by comment owner or admin
    if comment.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments"
        )
    
    session.delete(comment)
    session.commit()
    return {"message": "Comment deleted successfully"}


@router.patch("/{lead_id}/status", response_model=LeadResponse)
async def update_lead_status(
    lead_id: int,
    new_status: LeadStatus = Query(..., description="New status for the lead"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update lead status"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    lead.status = new_status
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


@router.patch("/{lead_id}/assign", response_model=LeadResponse)
async def assign_lead(
    lead_id: int,
    user_id: Optional[int] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Assign or unassign a lead to a user"""
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    if user_id:
        # Verify user belongs to same tenant
        user = session.get(User, user_id)
        if not user or user.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid user"
            )
        lead.assigned_to = user_id
    else:
        lead.assigned_to = None
    
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead

