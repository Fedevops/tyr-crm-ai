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
    Lead, LeadCreate, LeadResponse, LeadStatus, User, UserRole,
    LeadComment, LeadCommentCreate, LeadCommentResponse,
    Account, AccountCreate, Contact, ContactCreate, Opportunity, OpportunityCreate, SalesStage
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership, check_ownership, check_limit
from app.services.audit_service import log_convert
from app.services.enrichment_service import enrich_lead
from app.services.kpi_service import track_kpi_activity
from app.models import GoalMetricType
from app.utils.pdf_parser import extract_text_from_pdf, parse_linkedin_data_with_llm
from app.services.lead_scoring import calculate_lead_score, should_recalculate_score
from app.services.insight_generator import generate_lead_insight
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
        ("linkedin_url", "string", "LinkedIn"),
        ("status", "enum", "Status"),
        ("source", "string", "Origem"),
        ("score", "number", "Score"),
        ("owner_id", "number", "Responsável"),
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
    # Verificar limite antes de criar
    await check_limit("leads", session, current_user)
    # Preparar dados com ownership
    lead_dict = lead_data.dict()
    lead_dict = ensure_ownership(lead_dict, current_user)
    
    # Se assigned_to foi fornecido mas owner_id não, usar assigned_to como owner_id
    if lead_dict.get("assigned_to") and not lead_dict.get("owner_id"):
        lead_dict["owner_id"] = lead_dict["assigned_to"]
    
    lead = Lead(
        **lead_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)
    
    # Calcular score automaticamente
    try:
        lead.score = calculate_lead_score(lead, session)
        session.add(lead)
        session.commit()
        session.refresh(lead)
    except Exception as score_error:
        logger.warning(f"⚠️ [SCORING] Erro ao calcular score na criação do lead {lead.id}: {score_error}")
        # Não falhar a operação principal se o scoring falhar
    
    # Track KPI activity for lead creation
    try:
        completed_goals = track_kpi_activity(
            session=session,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            metric_type=GoalMetricType.LEADS_CREATED,
            value=1.0,
            entity_type='Lead',
            entity_id=lead.id
        )
        session.commit()
        if completed_goals:
            logger.info(f"🎯 [KPI] {len(completed_goals)} goal(s) completed by lead creation")
    except Exception as kpi_error:
        logger.warning(f"⚠️ [KPI] Error tracking activity: {kpi_error}")
        # Não falhar a operação principal se o tracking falhar
    
    return lead


@router.post("/filter", response_model=List[LeadResponse])
async def filter_leads(
    filters_request: LeadFiltersRequest = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get leads with advanced filters"""
    logger.info(f"🔍 [FILTERS] Recebida requisição de filtros: {len(filters_request.filters)} filtro(s), lógica={filters_request.logic}")
    
    # Base query for counting - aplicar filtro de ownership
    count_query = select(func.count(Lead.id))
    count_query = apply_ownership_filter(count_query, Lead, current_user)
    
    # Query for data - aplicar filtro de ownership
    query = select(Lead)
    query = apply_ownership_filter(query, Lead, current_user)
    
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
    # Base query for counting - aplicar filtro de ownership
    count_query = select(func.count(Lead.id))
    count_query = apply_ownership_filter(count_query, Lead, current_user)
    
    # Query for data - aplicar filtro de ownership
    query = select(Lead)
    query = apply_ownership_filter(query, Lead, current_user)
    
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


@router.get("/debug/ownership", response_model=dict)
async def debug_ownership(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Debug endpoint para verificar ownership dos leads"""
    from sqlmodel import text
    
    # Total de leads no tenant
    total_query = text("SELECT COUNT(*) FROM lead WHERE tenant_id = :tenant_id")
    total = session.exec(total_query.params(tenant_id=current_user.tenant_id)).first()
    
    # Leads sem owner_id
    null_owner_query = text("SELECT COUNT(*) FROM lead WHERE tenant_id = :tenant_id AND owner_id IS NULL")
    null_owner = session.exec(null_owner_query.params(tenant_id=current_user.tenant_id)).first()
    
    # Leads do usuário atual
    user_leads_query = text("SELECT COUNT(*) FROM lead WHERE tenant_id = :tenant_id AND owner_id = :user_id")
    user_leads = session.exec(user_leads_query.params(tenant_id=current_user.tenant_id, user_id=current_user.id)).first()
    
    # Leads que o usuário pode ver (com filtro de ownership)
    query = select(Lead)
    query = apply_ownership_filter(query, Lead, current_user)
    accessible_leads = len(session.exec(query).all())
    
    return {
        "user_id": current_user.id,
        "user_email": current_user.email,
        "user_role": current_user.role.value,
        "tenant_id": current_user.tenant_id,
        "total_leads_in_tenant": total[0] if total else 0,
        "leads_without_owner_id": null_owner[0] if null_owner else 0,
        "leads_owned_by_user": user_leads[0] if user_leads else 0,
        "leads_accessible_to_user": accessible_leads,
        "is_admin": current_user.role == UserRole.ADMIN
    }


@router.get("/stats/summary", response_model=dict)
async def get_leads_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get leads statistics for the current tenant"""
    # Aplicar filtro de ownership
    query = select(Lead)
    query = apply_ownership_filter(query, Lead, current_user)
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


@router.post("/parse-linkedin-pdf")
async def parse_linkedin_pdf(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Processa um PDF de exportação do LinkedIn e extrai informações usando IA
    
    Args:
        file: Arquivo PDF do LinkedIn
        
    Returns:
        JSON com dados extraídos do LinkedIn
    """
    # Validar tipo de arquivo
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo deve ser um PDF (.pdf)"
        )
    
    # Validar tamanho máximo (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Arquivo muito grande. Tamanho máximo: 10MB"
        )
    
    # Resetar posição do arquivo para leitura
    await file.seek(0)
    
    try:
        logger.info(f"📄 [PDF PARSER] Processando PDF: {file.filename}")
        
        # Verificar se LLM está disponível antes de processar
        from app.agents.llm_helper import is_llm_available
        if not is_llm_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM não está disponível. Verifique se o Ollama está rodando ou configure a API key do OpenAI no arquivo .env"
            )
        
        # Extrair texto do PDF
        text = await extract_text_from_pdf(file)
        
        if not text or len(text.strip()) < 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PDF não contém texto suficiente para análise. Pode ser um PDF escaneado (imagem)."
            )
        
        # Analisar texto com LLM
        try:
            parsed_data = await parse_linkedin_data_with_llm(
                text, 
                session=session, 
                tenant_id=current_user.tenant_id, 
                user_id=current_user.id
            )
        except ValueError as llm_error:
            error_msg = str(llm_error)
            # Melhorar mensagem de erro para conexão recusada
            if "Connection refused" in error_msg or "111" in error_msg:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Não foi possível conectar ao Ollama. Verifique se o Ollama está rodando. Em ambiente Docker, use 'host.docker.internal:11434' ou configure a URL correta no .env (OLLAMA_BASE_URL)"
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erro ao processar PDF com LLM: {error_msg}"
            )
        
        logger.info(f"✅ [PDF PARSER] Dados extraídos com sucesso: {len(parsed_data)} campos")
        
        return {
            "success": True,
            "data": parsed_data,
            "message": "PDF processado com sucesso"
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"❌ [PDF PARSER] Erro de validação: {error_msg}")
        # Verificar se é erro de conexão
        if "Connection refused" in error_msg or "111" in error_msg or "conexão" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Não foi possível conectar ao Ollama. Verifique se o Ollama está rodando. Em ambiente Docker, configure OLLAMA_BASE_URL no .env (ex: http://host.docker.internal:11434)"
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ [PDF PARSER] Erro ao processar PDF: {error_msg}")
        import traceback
        traceback.print_exc()
        
        # Mensagens de erro mais específicas
        if "Connection refused" in error_msg or "111" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Não foi possível conectar ao Ollama. Verifique se o Ollama está rodando. Em ambiente Docker, configure OLLAMA_BASE_URL no .env (ex: http://host.docker.internal:11434)"
            )
        elif "LLM não está configurado" in error_msg or "LLM não está disponível" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM não está configurado. Configure OpenAI (OPENAI_API_KEY) ou Ollama (OLLAMA_BASE_URL) no arquivo .env"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erro ao processar PDF: {error_msg}"
            )


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific lead"""
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
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
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
    # Salvar estado antigo para verificar mudanças relevantes
    # Criar um objeto temporário com os valores atuais
    old_values = {
        'email': lead.email,
        'phone': lead.phone,
        'linkedin_url': lead.linkedin_url,
        'linkedin_headline': lead.linkedin_headline,
        'linkedin_about': lead.linkedin_about,
        'linkedin_experience_json': lead.linkedin_experience_json,
        'linkedin_education_json': lead.linkedin_education_json,
        'cnpj': lead.cnpj,
        'situacao_cadastral': lead.situacao_cadastral,
        'capital_social': lead.capital_social,
        'porte': lead.porte,
        'industry': lead.industry,
        'status': lead.status,
        'last_contact': lead.last_contact,
        'next_followup': lead.next_followup,
        'owner_id': lead.owner_id
    }
    
    # Atualizar campos, mas manter ownership e tenant
    lead_dict = lead_data.dict()
    for key, value in lead_dict.items():
        if key not in ['owner_id', 'created_by_id', 'tenant_id']:
            setattr(lead, key, value)
    
    # Se owner_id foi especificado, atualizar (mas validar acesso)
    if lead_dict.get("owner_id") is not None:
        new_owner_id = lead_dict["owner_id"]
        # Verificar se o usuário existe e pertence ao mesmo tenant
        if new_owner_id:
            user = session.get(User, new_owner_id)
            if not user or user.tenant_id != current_user.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid user"
                )
        # Admin pode atribuir a qualquer usuário do tenant ou remover (None)
        if current_user.role.value == "admin":
            lead.owner_id = new_owner_id
        # Usuário normal só pode atribuir a si mesmo
        elif new_owner_id == current_user.id:
            lead.owner_id = new_owner_id
        elif new_owner_id is None:
            # Não permitir remover owner (sempre deve ter um)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Owner is required. You can reassign to another user."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only assign leads to yourself"
            )
    
    session.add(lead)
    session.commit()
    session.refresh(lead)
    
    # Recalcular score se houver mudanças relevantes
    # Criar objeto temporário com valores antigos para comparação
    class OldLead:
        def __init__(self, values):
            for key, value in values.items():
                setattr(self, key, value)
    
    old_lead_obj = OldLead(old_values)
    if should_recalculate_score(old_lead_obj, lead):
        try:
            lead.score = calculate_lead_score(lead, session)
            session.add(lead)
            session.commit()
            session.refresh(lead)
        except Exception as score_error:
            logger.warning(f"⚠️ [SCORING] Erro ao recalcular score do lead {lead.id}: {score_error}")
            # Não falhar a operação principal se o scoring falhar
    
    return lead


@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a lead"""
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
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
    # Verify lead access
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
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
    
    # Recalcular score após adicionar comentário
    try:
        lead.score = calculate_lead_score(lead, session)
        session.add(lead)
        session.commit()
        session.refresh(lead)
    except Exception as score_error:
        logger.warning(f"⚠️ [SCORING] Erro ao recalcular score do lead {lead.id} após comentário: {score_error}")
        # Não falhar a operação principal se o scoring falhar
    
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
    # Verify lead access
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
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
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
    lead.status = new_status
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


class BulkUpdateRequest(BaseModel):
    """Request para atualização em massa de leads"""
    lead_ids: List[int] = Field(..., description="Lista de IDs dos leads a atualizar")
    field: str = Field(..., description="Nome do campo a atualizar")
    value: Optional[Any] = Field(None, description="Valor a ser definido (None para limpar o campo)")


@router.post("/bulk-update")
async def bulk_update_leads(
    update_data: BulkUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Atualiza múltiplos leads em massa
    Permite atualizar qualquer campo de uma lista de leads
    """
    if not update_data.lead_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum lead especificado"
        )
    
    # Campos que não podem ser atualizados em massa (por segurança)
    protected_fields = ['id', 'tenant_id', 'created_at', 'updated_at', 'created_by_id']
    
    if update_data.field in protected_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campo '{update_data.field}' não pode ser atualizado em massa"
        )
    
    # Verificar se o campo existe no modelo Lead
    if not hasattr(Lead, update_data.field):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campo '{update_data.field}' não existe no modelo Lead"
        )
    
    # Buscar os leads do tenant
    all_leads = session.exec(
        select(Lead).where(
            and_(
                Lead.tenant_id == current_user.tenant_id,
                Lead.id.in_(update_data.lead_ids)
            )
        )
    ).all()
    
    if len(all_leads) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum lead encontrado"
        )
    
    # Filtrar apenas os leads que o usuário tem permissão (owner ou admin)
    is_admin = current_user.role == UserRole.ADMIN or current_user.role.value == "admin"
    
    logger.info(f"🔐 [BULK UPDATE] User {current_user.id} (role: {current_user.role}, is_admin: {is_admin}) tentando atualizar {len(all_leads)} leads")
    
    if is_admin:
        # Admin pode atualizar todos os leads do tenant
        leads = all_leads
        logger.info(f"✅ [BULK UPDATE] Admin - permitindo atualização de todos os {len(leads)} leads")
    else:
        # Usuário normal só pode atualizar seus próprios leads (ou leads sem owner)
        leads = [lead for lead in all_leads if lead.owner_id == current_user.id or lead.owner_id is None]
        logger.info(f"👤 [BULK UPDATE] Usuário normal - permitindo atualização de {len(leads)} leads (próprios ou sem owner)")
    
    if len(leads) == 0:
        logger.warning(f"⚠️ [BULK UPDATE] Nenhum lead pode ser atualizado. Total selecionado: {len(all_leads)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para atualizar nenhum dos leads selecionados"
        )
    
    # Se alguns leads não puderam ser atualizados, avisar mas continuar
    skipped_count = len(all_leads) - len(leads)
    
    # Converter valor se necessário
    value = update_data.value
    
    # Tratamento especial para campos enum
    if update_data.field == 'status':
        try:
            value = LeadStatus(update_data.value) if update_data.value else None
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Status inválido: {update_data.value}"
            )
    
    # Tratamento especial para campos numéricos
    if update_data.field in ['score', 'capital_social']:
        if value is not None:
            try:
                value = float(value) if update_data.field == 'capital_social' else int(value)
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Valor inválido para campo numérico: {update_data.value}"
                )
    
    # Tratamento especial para campos de data
    if update_data.field in ['last_contact', 'next_followup', 'data_abertura', 'data_situacao_cadastral', 
                             'data_opcao_simples', 'data_exclusao_simples']:
        if value:
            try:
                if isinstance(value, str):
                    value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                elif isinstance(value, datetime):
                    pass  # Já é datetime
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Formato de data inválido: {update_data.value}"
                )
    
    # Tratamento especial para campos booleanos
    if update_data.field == 'simples_nacional':
        if value is not None:
            value = bool(value)
    
    # Atualizar todos os leads
    updated_count = 0
    for lead in leads:
        try:
            setattr(lead, update_data.field, value)
            lead.updated_at = datetime.utcnow()
            session.add(lead)
            updated_count += 1
        except Exception as e:
            logger.error(f"Erro ao atualizar lead {lead.id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erro ao atualizar lead {lead.id}: {str(e)}"
            )
    
    session.commit()
    
    # Recalcular score para todos os leads atualizados
    # (sempre recalcular em bulk update, pois pode ter mudado campos relevantes)
    for lead in leads:
        try:
            session.refresh(lead)
            lead.score = calculate_lead_score(lead, session)
            session.add(lead)
        except Exception as score_error:
            logger.warning(f"⚠️ [SCORING] Erro ao recalcular score do lead {lead.id} em bulk update: {score_error}")
            # Não falhar a operação principal se o scoring falhar
    
    session.commit()
    
    message = f"{updated_count} lead(s) atualizado(s) com sucesso"
    if skipped_count > 0:
        message += f". {skipped_count} lead(s) não puderam ser atualizados (sem permissão)"
    
    return {
        "success": True,
        "message": message,
        "updated_count": updated_count,
        "skipped_count": skipped_count
    }


@router.patch("/{lead_id}/assign", response_model=LeadResponse)
async def assign_lead(
    lead_id: int,
    user_id: Optional[int] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Assign or unassign a lead to a user"""
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
    if user_id:
        # Verify user belongs to same tenant
        user = session.get(User, user_id)
        if not user or user.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid user"
            )
        # Admin pode atribuir a qualquer usuário, usuário normal só a si mesmo
        if current_user.role.value == "admin" or user_id == current_user.id:
            lead.owner_id = user_id
            lead.assigned_to = user_id  # Manter compatibilidade
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only assign leads to yourself"
            )
    else:
        # Não permitir remover owner (sempre deve ter um)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner is required. You can reassign to another user."
        )
    
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


@router.post("/{lead_id}/convert-to-account", response_model=dict)
async def convert_lead_to_account(
    lead_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Convert a lead to an account"""
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
    # Verificar se já existe account com o mesmo CNPJ
    account = None
    if lead.cnpj:
        account = session.exec(
            select(Account).where(
                and_(
                    Account.tenant_id == current_user.tenant_id,
                    Account.cnpj == lead.cnpj
                )
            )
        ).first()
    
    if not account:
        # Criar nova account
        account_data = AccountCreate(
            name=lead.company or lead.name or lead.razao_social or "Empresa sem nome",
            website=lead.website,
            phone=lead.phone or lead.telefone_empresa,
            email=lead.email or lead.email_empresa,
            industry=lead.industry,
            company_size=lead.company_size,
            address=lead.address or (f"{lead.logradouro or ''} {lead.numero or ''}".strip() if lead.logradouro else None),
            city=lead.city or lead.municipio,
            state=lead.state or lead.uf,
            zip_code=lead.zip_code or lead.cep,
            country=lead.country or "Brasil",
            description=lead.context or lead.notes,
            cnpj=lead.cnpj,
            razao_social=lead.razao_social,
            nome_fantasia=lead.nome_fantasia,
            owner_id=lead.owner_id
        )
        
        acc_dict = account_data.dict()
        acc_dict = ensure_ownership(acc_dict, current_user)
        
        account = Account(
            **acc_dict,
            tenant_id=current_user.tenant_id
        )
        session.add(account)
        session.commit()
        session.refresh(account)
    
    # Atualizar lead com account_id
    lead.account_id = account.id
    session.add(lead)
    session.commit()
    
    # Registrar auditoria
    log_convert(session, current_user, "Lead", lead_id, "Account", account.id)
    
    return {
        "message": "Lead converted to account successfully",
        "account_id": account.id,
        "account": account
    }


@router.post("/{lead_id}/convert-to-opportunity", response_model=dict)
async def convert_lead_to_opportunity(
    lead_id: int,
    stage_id: Optional[int] = Query(None),
    amount: Optional[float] = Query(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Convert a lead to an opportunity"""
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
    # Verificar se lead tem account, se não, criar
    account = None
    if lead.account_id:
        account = session.get(Account, lead.account_id)
        require_ownership(account, current_user)
    else:
        # Converter para account primeiro
        convert_result = await convert_lead_to_account(lead_id, session, current_user)
        account = convert_result["account"]
    
    # Buscar funil padrão e primeiro estágio se stage_id não fornecido
    if not stage_id:
        from app.models import SalesFunnel
        default_funnel = session.exec(
            select(SalesFunnel).where(
                and_(
                    SalesFunnel.tenant_id == current_user.tenant_id,
                    SalesFunnel.is_default == True
                )
            )
        ).first()
        
        if not default_funnel:
            # Buscar qualquer funil do tenant
            default_funnel = session.exec(
                select(SalesFunnel).where(SalesFunnel.tenant_id == current_user.tenant_id)
            ).first()
        
        if default_funnel:
            stages = session.exec(
                select(SalesStage).where(
                    SalesStage.funnel_id == default_funnel.id
                ).order_by(SalesStage.order)
            ).all()
            if stages:
                stage_id = stages[0].id
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No sales stages found. Please create a sales funnel with stages first."
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No sales funnel found. Please create a sales funnel first."
            )
    
    # Verificar se stage existe
    stage = session.get(SalesStage, stage_id)
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales stage not found"
        )
    
    # Criar opportunity
    opportunity_data = OpportunityCreate(
        account_id=account.id,
        contact_id=lead.contact_id,
        stage_id=stage_id,
        name=f"Oportunidade: {lead.name or lead.company or 'Sem nome'}",
        description=lead.context or lead.notes,
        amount=amount,
        currency="BRL",
        expected_close_date=None,
        probability=stage.probability,
        notes=f"Convertido do lead #{lead_id}"
    )
    
    opp_dict = opportunity_data.dict()
    opp_dict = ensure_ownership(opp_dict, current_user)
    
    opportunity = Opportunity(
        **opp_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    
    # Registrar auditoria
    log_convert(session, current_user, "Lead", lead_id, "Opportunity", opportunity.id)
    
    return {
        "message": "Lead converted to opportunity successfully",
        "opportunity_id": opportunity.id,
        "opportunity": opportunity
    }


@router.post("/{lead_id}/generate-insight")
async def generate_insight(
    lead_id: int,
    language: Optional[str] = Query("pt-BR", description="Idioma para gerar o insight (pt-BR ou en)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Gera um insight sobre o lead usando IA
    
    Args:
        lead_id: ID do lead
        
    Returns:
        JSON com o insight gerado
    """
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
    try:
        logger.info(f"🤖 [INSIGHT] Gerando insight para lead {lead_id} em idioma: {language}")
        insight = generate_lead_insight(lead, session, language=language)
        
        # Atualizar o campo linkedin_summary com o insight gerado
        lead.linkedin_summary = insight
        session.add(lead)
        session.commit()
        session.refresh(lead)
        
        logger.info(f"✅ [INSIGHT] Insight gerado e salvo para lead {lead_id}")
        
        return {
            "success": True,
            "insight": insight,
            "message": "Insight gerado com sucesso"
        }
        
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"❌ [INSIGHT] Erro ao gerar insight: {error_msg}")
        
        if "LLM não está disponível" in error_msg or "Connection refused" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env"
            )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar insight: {error_msg}"
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ [INSIGHT] Erro inesperado ao gerar insight: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar insight: {error_msg}"
        )

