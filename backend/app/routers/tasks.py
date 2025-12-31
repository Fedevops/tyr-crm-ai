from typing import List, Optional
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response, Body
from sqlmodel import Session, select, and_, or_, func
from typing import List
from app.database import get_session
from app.models import (
    Task, TaskCreate, TaskUpdate, TaskResponse, TaskType, TaskStatus,
    Lead, Sequence, User, UserRole,
    TaskComment, TaskCommentCreate, TaskCommentResponse
)
from app.dependencies import get_current_active_user, apply_ownership_filter, ensure_ownership, require_ownership
from app.services.kpi_service import track_kpi_activity
from app.services.lead_scoring import calculate_lead_score
from app.services.linkedin_message_generator import generate_linkedin_connection_note, generate_linkedin_followup_message
from app.models import GoalMetricType
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def replace_placeholders(text: str, lead: Lead) -> str:
    """
    Substitui placeholders no texto pelos valores reais do lead
    
    Placeholders suportados:
    - {Nome do lead} ou {name}
    - {Empresa} ou {company}
    - {Cargo} ou {position}
    - {Email} ou {email}
    - {Telefone} ou {phone}
    - {Website} ou {website}
    - {LinkedIn} ou {linkedin}
    """
    if not text:
        return text
    
    replacements = {
        "{Nome do lead}": lead.name or "",
        "{name}": lead.name or "",
        "{Empresa}": lead.company or "",
        "{company}": lead.company or "",
        "{Cargo}": lead.position or "",
        "{position}": lead.position or "",
        "{Email}": lead.email or "",
        "{email}": lead.email or "",
        "{Telefone}": lead.phone or "",
        "{phone}": lead.phone or "",
        "{Website}": lead.website or "",
        "{website}": lead.website or "",
        "{LinkedIn}": lead.linkedin_url or "",
        "{linkedin}": lead.linkedin_url or "",
    }
    
    result = text
    for placeholder, value in replacements.items():
        result = result.replace(placeholder, value)
    
    return result


def task_to_response(task: Task) -> TaskResponse:
    """Helper function to convert Task to TaskResponse, handling None values"""
    return TaskResponse(
        id=task.id,
        tenant_id=task.tenant_id,
        lead_id=task.lead_id,
        sequence_id=task.sequence_id,
        assigned_to=task.assigned_to,
        owner_id=task.owner_id,  # Pode ser None
        created_by_id=task.created_by_id,  # Pode ser None
        type=task.type,
        title=task.title,
        description=task.description,
        status=task.status,
        due_date=task.due_date,
        completed_at=task.completed_at,
        notes=task.notes,
        created_at=task.created_at,
        updated_at=task.updated_at
    )


def generate_tasks_from_sequence(
    session: Session,
    lead_id: int,
    sequence_id: int,
    tenant_id: int,
    assigned_to: Optional[int] = None,
    start_date: Optional[datetime] = None,
    created_by_id: Optional[int] = None
):
    """Generate tasks from a sequence for a lead"""
    sequence = session.get(Sequence, sequence_id)
    
    # Se start_date não foi fornecido, usar default_start_date da sequência ou datetime.utcnow()
    if start_date is None:
        if sequence and sequence.default_start_date:
            start_date = sequence.default_start_date
        else:
            start_date = datetime.utcnow()
    if not sequence or sequence.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence not found"
        )
    
    if not sequence.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sequence is not active"
        )
    
    try:
        steps = json.loads(sequence.steps)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sequence steps format"
        )
    
    if not isinstance(steps, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Steps must be a list"
        )
    
    # Buscar o lead para substituir placeholders
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    created_tasks = []
    current_date = start_date
    
    for step in steps:
        if not isinstance(step, dict):
            continue
        
        step_type = step.get("type", "other")
        delay_days = step.get("delay_days", 0)
        title = step.get("title", f"Task: {step_type}")
        description = step.get("description") or step.get("template")
        
        # Substituir placeholders na descrição se for tarefa do LinkedIn
        if step_type == "linkedin" and description:
            description = replace_placeholders(description, lead)
        
        # Calculate due date
        due_date = current_date + timedelta(days=delay_days)
        
        # Map step type to TaskType
        task_type_map = {
            "email": TaskType.EMAIL,
            "call": TaskType.CALL,
            "linkedin": TaskType.LINKEDIN,
            "meeting": TaskType.MEETING,
            "follow_up": TaskType.FOLLOW_UP,
            "research": TaskType.RESEARCH,
        }
        task_type = task_type_map.get(step_type.lower(), TaskType.OTHER)
        
        task = Task(
            tenant_id=tenant_id,
            lead_id=lead_id,
            sequence_id=sequence_id,
            assigned_to=assigned_to,
            owner_id=assigned_to,  # Associar ao usuário logado
            created_by_id=created_by_id,  # Associar ao usuário que criou
            type=task_type,
            title=title,
            description=description,
            due_date=due_date,
            status=TaskStatus.PENDING
        )
        session.add(task)
        created_tasks.append(task)
        
        # Update current date for next step
        current_date = due_date
    
    session.commit()
    return created_tasks


@router.post("", response_model=TaskResponse)
async def create_task(
    task_data: TaskCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new task"""
    # Verify lead access
    lead = session.get(Lead, task_data.lead_id)
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    require_ownership(lead, current_user)
    
    # If sequence_id is provided, generate tasks from sequence
    if task_data.sequence_id:
        assigned_user = task_data.assigned_to or task_data.owner_id or current_user.id
        tasks = generate_tasks_from_sequence(
            session=session,
            lead_id=task_data.lead_id,
            sequence_id=task_data.sequence_id,
            tenant_id=current_user.tenant_id,
            assigned_to=assigned_user,
            created_by_id=current_user.id  # Passar o ID do usuário logado
        )
        if tasks:
            # Garantir que todas as tasks tenham owner_id e created_by_id
            for task in tasks:
                if not task.owner_id:
                    task.owner_id = task_data.owner_id or current_user.id
                if not task.created_by_id:
                    task.created_by_id = current_user.id
            session.commit()
            session.refresh(tasks[0])
            return task_to_response(tasks[0])
    
    # Create single task
    task_dict = task_data.dict()
    task_dict = ensure_ownership(task_dict, current_user)
    
    # Se assigned_to foi fornecido mas owner_id não, usar assigned_to como owner_id
    if task_dict.get("assigned_to") and not task_dict.get("owner_id"):
        task_dict["owner_id"] = task_dict["assigned_to"]
    
    # Garantir que owner_id e created_by_id estejam definidos
    if not task_dict.get("owner_id"):
        task_dict["owner_id"] = current_user.id
    if not task_dict.get("created_by_id"):
        task_dict["created_by_id"] = current_user.id
    
    task = Task(
        **task_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task_to_response(task)


@router.get("")
async def get_tasks(
    lead_id: Optional[int] = Query(None, description="Filter by lead"),
    assigned_to: Optional[int] = Query(None, description="Filter by assigned user"),
    status: Optional[TaskStatus] = Query(None, description="Filter by status"),
    type: Optional[TaskType] = Query(None, description="Filter by type"),
    upcoming: Optional[bool] = Query(None, description="Get only upcoming tasks"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get tasks for the current tenant with filters and pagination"""
    # Base query - aplicar filtro de ownership
    base_query = select(Task)
    base_query = apply_ownership_filter(base_query, Task, current_user)
    
    filters = []
    
    if lead_id:
        filters.append(Task.lead_id == lead_id)
    
    if assigned_to:
        # Filtrar por assigned_to (deprecated) ou owner_id
        filters.append(or_(Task.assigned_to == assigned_to, Task.owner_id == assigned_to))
    
    if status:
        filters.append(Task.status == status)
    
    if type:
        filters.append(Task.type == type)
    
    if upcoming:
        filters.append(Task.due_date >= datetime.utcnow())
        filters.append(Task.status != TaskStatus.COMPLETED)
    
    if filters:
        base_query = base_query.where(and_(*filters))
    
    # Count total tasks - aplicar filtro de ownership
    count_query = select(func.count(Task.id))
    count_query = apply_ownership_filter(count_query, Task, current_user)
    if filters:
        count_query = count_query.where(and_(*filters))
    total_count = session.exec(count_query).one() or 0
    
    print(f"[TASKS API] Counting tasks - tenant_id: {current_user.tenant_id}, filters: {len(filters)}, total_count: {total_count}")
    
    # Get paginated tasks
    query = base_query.order_by(Task.due_date.asc())
    query = query.offset(skip).limit(limit)
    
    tasks = session.exec(query).all()
    
    # Create response with custom headers
    from fastapi.responses import JSONResponse
    
    # Serialize tasks properly (handles datetime objects)
    tasks_data = []
    for task in tasks:
        task_dict = task.dict()
        # Convert datetime objects to ISO format strings
        for key, value in task_dict.items():
            if isinstance(value, datetime):
                task_dict[key] = value.isoformat()
        tasks_data.append(task_dict)
    
    # Return JSONResponse with total count in header
    response = JSONResponse(content=tasks_data)
    response.headers["X-Total-Count"] = str(total_count)
    
    # Debug log
    print(f"[TASKS API] Total count: {total_count}, Returning {len(tasks_data)} tasks, Page: skip={skip}, limit={limit}")
    
    return response


@router.get("/upcoming", response_model=List[TaskResponse])
async def get_upcoming_tasks(
    days: int = Query(7, ge=1, le=30, description="Number of days ahead"),
    assigned_to: Optional[int] = Query(None, description="Filter by assigned user"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get upcoming tasks within the next N days"""
    try:
        now = datetime.utcnow()
        future_date = now + timedelta(days=days)
        
        # Usar apply_ownership_filter como nos outros endpoints
        query = select(Task)
        query = apply_ownership_filter(query, Task, current_user)
        
        # Adicionar filtros de data e status
        query = query.where(
            and_(
                Task.due_date.isnot(None),
                Task.due_date >= now,
                Task.due_date <= future_date,
                Task.status != TaskStatus.COMPLETED,
                Task.status != TaskStatus.CANCELLED
            )
        )
        
        if assigned_to:
            # Filtrar por assigned_to (deprecated) ou owner_id
            query = query.where(or_(
                Task.assigned_to == assigned_to,
                Task.owner_id == assigned_to
            ))
        
        query = query.order_by(Task.due_date.asc())
        
        tasks = session.exec(query).all()
        
        # Converter para TaskResponse garantindo que campos opcionais sejam tratados corretamente
        return [task_to_response(task) for task in tasks]
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        error_trace = traceback.format_exc()
        logger.error(f"Error fetching upcoming tasks: {e}\n{error_trace}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching upcoming tasks: {str(e)}"
        )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific task"""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    require_ownership(task, current_user)
    return task_to_response(task)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a task"""
    print(f"🔄 [BACKEND] Recebida requisição PATCH para tarefa {task_id}")
    print(f"🔍 [BACKEND] Dados recebidos: {task_data.dict()}")
    task = session.get(Task, task_id)
    print(f"🔍 [BACKEND] Tarefa encontrada: {task is not None}")
    
    if not task:
        print(f"❌ [BACKEND] Tarefa não encontrada")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    require_ownership(task, current_user)
    
    print(f"🔍 [BACKEND] Tarefa encontrada - ID: {task.id}, Tipo: {task.type}, Status atual: {task.status}")
    
    update_data = task_data.dict(exclude_unset=True)
    print(f"🔍 [BACKEND] Dados para atualização: {update_data}")
    
    # Inicializar was_not_completed antes de qualquer verificação
    was_not_completed = task.status != TaskStatus.COMPLETED
    
    # If marking as completed, set completed_at
    if update_data.get("status") == TaskStatus.COMPLETED:
        print(f"✅ [BACKEND] Tarefa está sendo marcada como COMPLETED")
        # Atualizar was_not_completed se necessário
        was_not_completed = task.status != TaskStatus.COMPLETED
        if not task.completed_at:
            update_data["completed_at"] = datetime.utcnow()
            print(f"✅ [BACKEND] completed_at definido para: {update_data['completed_at']}")
        
        # Se for tarefa de pesquisa, acionar agente pesquisador para enriquecer lead
        print(f"🔍 [DEBUG] Tarefa marcada como concluída. Tipo: {task.type} (tipo: {type(task.type)}), TaskType.RESEARCH: {TaskType.RESEARCH} (tipo: {type(TaskType.RESEARCH)})")
        print(f"🔍 [DEBUG] Comparação direta: task.type == TaskType.RESEARCH = {task.type == TaskType.RESEARCH}")
        print(f"🔍 [DEBUG] Comparação string: str(task.type) == 'research' = {str(task.type) == 'research'}")
        print(f"🔍 [DEBUG] Comparação enum: task.type == TaskType.RESEARCH.value = {task.type == TaskType.RESEARCH.value if hasattr(TaskType.RESEARCH, 'value') else 'N/A'}")
        
        # Comparar tanto como enum quanto como string para garantir
        if task.type == TaskType.RESEARCH or str(task.type).lower() == 'research':
            print(f"✅ [DEBUG] Tarefa é do tipo RESEARCH. Iniciando pesquisa automática...")
            lead = session.get(Lead, task.lead_id)
            print(f"🔍 [DEBUG] Lead encontrado: {lead is not None}, Lead ID: {task.lead_id}")
            
            if not lead:
                # Se não encontrou o lead, tentar buscar novamente após refresh
                print(f"⚠️ [DEBUG] Lead não encontrado na primeira tentativa. Tentando refresh...")
                session.refresh(task)
                lead = session.get(Lead, task.lead_id)
                print(f"🔍 [DEBUG] Lead após refresh: {lead is not None}")
            
            if lead:
                print(f"🔍 [DEBUG] Lead: {lead.name}, Website: {lead.website}")
                if not lead.website:
                    # Se não tem website, adicionar nota na tarefa
                    print(f"⚠️ [DEBUG] Lead não possui website cadastrado.")
                    if task.notes:
                        task.notes += f"\n\n⚠️ Pesquisa automática não executada: Lead não possui website cadastrado."
                    else:
                        task.notes = "⚠️ Pesquisa automática não executada: Lead não possui website cadastrado."
                else:
                    print(f"✅ [DEBUG] Lead possui website: {lead.website}. Iniciando pesquisa...")
                    try:
                        from app.agents.researcher_agent import research_lead_website
                        print(f"✅ [DEBUG] Módulo researcher_agent importado com sucesso.")
                        
                        lead_info = {
                            'name': lead.name,
                            'company': lead.company or '',
                            'position': lead.position or ''
                        }
                        
                        print(f"🔍 [DEBUG] Informações do lead para pesquisa: {lead_info}")
                        print(f"🔍 [DEBUG] Website a ser pesquisado: {lead.website}")
                        
                        # Executar pesquisa do website
                        print(f"🚀 [DEBUG] Chamando research_lead_website...")
                        try:
                            research_result = await research_lead_website(lead.website, lead_info)
                            print(f"✅ [DEBUG] Pesquisa concluída. Resultado: {research_result.get('success', False)}")
                            print(f"🔍 [DEBUG] Detalhes do resultado: {research_result}")
                        except Exception as research_error:
                            print(f"❌ [DEBUG] Erro ao executar research_lead_website: {research_error}")
                            import traceback
                            traceback.print_exc()
                            research_result = {
                                'success': False,
                                'error': f'Erro ao executar pesquisa: {str(research_error)}'
                            }
                        
                        if research_result.get('success'):
                            enriched_data = research_result.get('enriched_data', {})
                            fields_updated = []
                            
                            # Preencher campos do lead apenas se estiverem vazios
                            if enriched_data.get('phone') and not lead.phone:
                                lead.phone = enriched_data['phone']
                                fields_updated.append('telefone')
                            
                            if enriched_data.get('email') and not lead.email:
                                lead.email = enriched_data['email']
                                fields_updated.append('email')
                            
                            if enriched_data.get('address') and not lead.address:
                                lead.address = enriched_data['address']
                                fields_updated.append('endereço')
                            
                            if enriched_data.get('city') and not lead.city:
                                lead.city = enriched_data['city']
                                fields_updated.append('cidade')
                            
                            if enriched_data.get('state') and not lead.state:
                                lead.state = enriched_data['state']
                                fields_updated.append('estado')
                            
                            if enriched_data.get('zip_code') and not lead.zip_code:
                                lead.zip_code = enriched_data['zip_code']
                                fields_updated.append('CEP')
                            
                            if enriched_data.get('country') and not lead.country:
                                lead.country = enriched_data['country']
                                fields_updated.append('país')
                            
                            if enriched_data.get('industry') and not lead.industry:
                                lead.industry = enriched_data['industry']
                                fields_updated.append('setor')
                            
                            if enriched_data.get('company_size') and not lead.company_size:
                                lead.company_size = enriched_data['company_size']
                                fields_updated.append('tamanho da empresa')
                            
                            # Campos do LinkedIn
                            if enriched_data.get('linkedin_headline') and not lead.linkedin_headline:
                                lead.linkedin_headline = enriched_data['linkedin_headline']
                                fields_updated.append('headline LinkedIn')
                            
                            if enriched_data.get('linkedin_about') and not lead.linkedin_about:
                                lead.linkedin_about = enriched_data['linkedin_about']
                                fields_updated.append('sobre LinkedIn')
                            
                            if enriched_data.get('linkedin_experience_json') and not lead.linkedin_experience_json:
                                lead.linkedin_experience_json = enriched_data['linkedin_experience_json']
                                fields_updated.append('experiência LinkedIn')
                            
                            if enriched_data.get('linkedin_education_json') and not lead.linkedin_education_json:
                                lead.linkedin_education_json = enriched_data['linkedin_education_json']
                                fields_updated.append('educação LinkedIn')
                            
                            if enriched_data.get('linkedin_certifications_json') and not lead.linkedin_certifications_json:
                                lead.linkedin_certifications_json = enriched_data['linkedin_certifications_json']
                                fields_updated.append('certificações LinkedIn')
                            
                            if enriched_data.get('linkedin_skills') and not lead.linkedin_skills:
                                lead.linkedin_skills = enriched_data['linkedin_skills']
                                fields_updated.append('habilidades LinkedIn')
                            
                            if enriched_data.get('linkedin_articles_json') and not lead.linkedin_articles_json:
                                lead.linkedin_articles_json = enriched_data['linkedin_articles_json']
                                fields_updated.append('artigos LinkedIn')
                            
                            if enriched_data.get('linkedin_recent_activity') and not lead.linkedin_recent_activity:
                                lead.linkedin_recent_activity = enriched_data['linkedin_recent_activity']
                                fields_updated.append('atividades LinkedIn')
                            
                            if enriched_data.get('linkedin_connections_count') is not None and lead.linkedin_connections_count is None:
                                lead.linkedin_connections_count = enriched_data['linkedin_connections_count']
                                fields_updated.append('conexões LinkedIn')
                            
                            if enriched_data.get('linkedin_followers_count') is not None and lead.linkedin_followers_count is None:
                                lead.linkedin_followers_count = enriched_data['linkedin_followers_count']
                                fields_updated.append('seguidores LinkedIn')
                            
                            if enriched_data.get('linkedin_summary') and not lead.linkedin_summary:
                                lead.linkedin_summary = enriched_data['linkedin_summary']
                                fields_updated.append('resumo LinkedIn')
                            
                            # Contexto sempre atualiza (pode ser melhorado)
                            if enriched_data.get('context'):
                                if lead.context:
                                    # Se já existe contexto, adicionar nova informação
                                    lead.context = f"{lead.context}\n\n--- Atualização {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} ---\n{enriched_data['context']}"
                                else:
                                    lead.context = enriched_data['context']
                                fields_updated.append('contexto')
                            
                            # Adicionar análise às notes se houver
                            if research_result.get('analysis'):
                                analysis_summary = json.dumps(research_result.get('analysis', {}), indent=2, ensure_ascii=False)
                                if lead.notes:
                                    lead.notes += f"\n\n=== PESQUISA AUTOMÁTICA ({datetime.utcnow().strftime('%d/%m/%Y %H:%M')}) ===\n{analysis_summary}"
                                else:
                                    lead.notes = f"=== PESQUISA AUTOMÁTICA ({datetime.utcnow().strftime('%d/%m/%Y %H:%M')}) ===\n{analysis_summary}"
                            
                            # Adicionar tag indicando que foi enriquecido
                            tags = json.loads(lead.tags) if lead.tags else []
                            if 'enriquecido-automaticamente' not in tags:
                                tags.append('enriquecido-automaticamente')
                            lead.tags = json.dumps(tags)
                            
                            # Atualizar timestamp de atualização do lead
                            lead.updated_at = datetime.utcnow()
                            
                            session.add(lead)
                            session.commit()
                            
                            # Recalcular score após enriquecimento
                            try:
                                lead.score = calculate_lead_score(lead, session)
                                session.add(lead)
                                session.commit()
                                logger.info(f"📊 [SCORING] Score do lead {lead.id} recalculado após enriquecimento")
                            except Exception as score_error:
                                logger.warning(f"⚠️ [SCORING] Erro ao recalcular score do lead {lead.id} após enriquecimento: {score_error}")
                                # Não falhar a operação principal se o scoring falhar
                            
                            # Adicionar resumo na tarefa
                            method_used = research_result.get('method', 'scraping_direto')
                            method_label = {
                                'direct_scraping': 'Scraping Direto',
                                'google_search': 'Google Search + LLM',
                                'hunter_io': 'Hunter.io API',
                                'clearbit': 'Clearbit API'
                            }.get(method_used, method_used)
                            
                            if fields_updated:
                                research_summary = f"✅ Pesquisa automática concluída em {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} usando {method_label}.\nCampos enriquecidos: {', '.join(fields_updated)}"
                                if task.notes:
                                    task.notes = f"{task.notes}\n\n{research_summary}"
                                else:
                                    task.notes = research_summary
                            else:
                                research_summary = f"✅ Pesquisa automática concluída em {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} usando {method_label}.\nNenhum campo novo foi preenchido (todos já estavam preenchidos)."
                                if task.notes:
                                    task.notes = f"{task.notes}\n\n{research_summary}"
                                else:
                                    task.notes = research_summary
                            
                            print(f"✅ [DEBUG] Pesquisa concluída com sucesso usando método: {method_label}")
                        else:
                            # Pesquisa falhou - todas as estratégias foram tentadas
                            error_msg = research_result.get('error', 'Erro desconhecido')
                            status_code = research_result.get('status_code')
                            method_used = research_result.get('method', 'desconhecido')
                            suggestions = research_result.get('suggestions', [])
                            
                            # Mensagem detalhada baseada no método usado
                            attempted_strategies = research_result.get('attempted_strategies', [])
                            
                            if method_used == 'desconhecido' and status_code == 403:
                                error_note = f"❌ Pesquisa automática falhou após tentar múltiplas estratégias.\n\n"
                                error_note += f"Estratégia 1 (Scraping Direto): Bloqueado (403 Forbidden)\n\n"
                                
                                if attempted_strategies:
                                    error_note += f"Estratégias tentadas:\n"
                                    for i, strategy in enumerate(attempted_strategies, 1):
                                        error_note += f"  {i}. {strategy}\n"
                                    error_note += "\n"
                                
                                if suggestions:
                                    error_note += "Sugestões para melhorar:\n"
                                    for i, suggestion in enumerate(suggestions, 1):
                                        error_note += f"  {i}. {suggestion}\n"
                                else:
                                    error_note += "\n⚠️ Nenhuma estratégia alternativa configurada.\n"
                                    error_note += "Configure Google Search API ou Hunter.io/Clearbit para fallback automático."
                            else:
                                error_note = f"❌ Pesquisa automática falhou: {error_msg}"
                                if method_used != 'desconhecido':
                                    error_note += f"\nMétodo usado: {method_used}"
                                if attempted_strategies:
                                    error_note += f"\nEstratégias tentadas: {', '.join(attempted_strategies)}"
                            
                            if task.notes:
                                task.notes = f"{task.notes}\n\n{error_note}"
                            else:
                                task.notes = error_note
                            
                            print(f"❌ [DEBUG] Pesquisa falhou. Erro: {error_msg}, Status: {status_code}, Método: {method_used}")
                    except Exception as e:
                        print(f"❌ [DEBUG] Erro ao executar pesquisa automática: {e}")
                        import traceback
                        traceback.print_exc()
                        error_note = f"❌ Erro na pesquisa automática: {str(e)}"
                        if task.notes:
                            task.notes = f"{task.notes}\n\n{error_note}"
                        else:
                            task.notes = error_note
                        # Garantir que a tarefa seja salva mesmo com erro
                        session.add(task)
                        session.commit()
            else:
                print(f"❌ [DEBUG] Lead não encontrado. Lead ID: {task.lead_id}")
                # Adicionar nota na tarefa sobre lead não encontrado
                error_note = f"⚠️ Pesquisa automática não executada: Lead não encontrado (ID: {task.lead_id})"
                if task.notes:
                    task.notes = f"{task.notes}\n\n{error_note}"
                else:
                    task.notes = error_note
        else:
            print(f"ℹ️ [DEBUG] Tarefa não é do tipo RESEARCH. Tipo atual: {task.type}")
    
    # If changing from completed to another status, clear completed_at
    if update_data.get("status") and update_data["status"] != TaskStatus.COMPLETED:
        if task.status == TaskStatus.COMPLETED:
            update_data["completed_at"] = None
    
    # Aplicar todas as atualizações na tarefa
    for key, value in update_data.items():
        setattr(task, key, value)
    
    task.updated_at = datetime.utcnow()
    
    # Garantir que a tarefa seja salva
    try:
        session.add(task)
        session.commit()
        session.refresh(task)
        print(f"✅ [BACKEND] Tarefa {task.id} salva com sucesso. Status: {task.status}")
        
        # Recalcular score do lead se a task foi completada
        if was_not_completed and task.status == TaskStatus.COMPLETED:
            try:
                lead = session.get(Lead, task.lead_id)
                if lead:
                    lead.score = calculate_lead_score(lead, session)
                    session.add(lead)
                    session.commit()
                    logger.info(f"📊 [SCORING] Score do lead {lead.id} recalculado após conclusão da task {task.id}")
            except Exception as score_error:
                logger.warning(f"⚠️ [SCORING] Erro ao recalcular score do lead após conclusão da task {task.id}: {score_error}")
                # Não falhar a operação principal se o scoring falhar
        
        # Track KPI activity if task was just completed
        if was_not_completed and task.status == TaskStatus.COMPLETED:
            try:
                completed_goals = track_kpi_activity(
                    session=session,
                    user_id=current_user.id,
                    tenant_id=current_user.tenant_id,
                    metric_type=GoalMetricType.TASKS_COMPLETED,
                    value=1.0,
                    entity_type='Task',
                    entity_id=task.id
                )
                session.commit()
                if completed_goals:
                    print(f"🎯 [KPI] {len(completed_goals)} goal(s) completed by task completion")
            except Exception as kpi_error:
                print(f"⚠️ [KPI] Error tracking activity: {kpi_error}")
                # Não falhar a operação principal se o tracking falhar
    except Exception as e:
        print(f"❌ [BACKEND] Erro ao salvar tarefa: {e}")
        import traceback
        traceback.print_exc()
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao salvar tarefa: {str(e)}"
        )
    
    return task_to_response(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a task"""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    require_ownership(task, current_user)
    
    session.delete(task)
    session.commit()
    return {"message": "Task deleted successfully"}


@router.post("/bulk-delete")
async def bulk_delete_tasks(
    request: dict = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Apaga múltiplas tarefas em massa
    
    Args:
        request: Body com task_ids (lista de IDs das tarefas a serem apagadas)
        
    Returns:
        JSON com contagem de tarefas apagadas
    """
    task_ids = request.get("task_ids", [])
    if not task_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma tarefa especificada"
        )
    
    # Buscar todas as tarefas do tenant
    all_tasks = session.exec(
        select(Task).where(
            and_(
                Task.tenant_id == current_user.tenant_id,
                Task.id.in_(task_ids)
            )
        )
    ).all()
    
    if len(all_tasks) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhuma tarefa encontrada"
        )
    
    # Filtrar apenas as tarefas que o usuário tem permissão (owner ou admin)
    is_admin = current_user.role == UserRole.ADMIN or current_user.role.value == "admin"
    
    if is_admin:
        # Admin pode apagar todas as tarefas do tenant
        tasks_to_delete = all_tasks
    else:
        # Usuário normal só pode apagar suas próprias tarefas (ou tarefas sem owner)
        tasks_to_delete = [task for task in all_tasks if task.owner_id == current_user.id or task.owner_id is None]
    
    if len(tasks_to_delete) == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para apagar nenhuma das tarefas selecionadas"
        )
    
    # Apagar tarefas
    deleted_count = 0
    for task in tasks_to_delete:
        try:
            session.delete(task)
            deleted_count += 1
        except Exception as e:
            logger.error(f"Erro ao apagar tarefa {task.id}: {e}")
    
    session.commit()
    
    skipped_count = len(all_tasks) - deleted_count
    
    message = f"{deleted_count} tarefa(s) apagada(s) com sucesso"
    if skipped_count > 0:
        message += f". {skipped_count} tarefa(s) não puderam ser apagadas (sem permissão)"
    
    return {
        "success": True,
        "message": message,
        "deleted_count": deleted_count,
        "skipped_count": skipped_count
    }


@router.post("/{task_id}/comments", response_model=TaskCommentResponse)
async def create_task_comment(
    task_id: int,
    comment_data: TaskCommentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a comment on a task"""
    # Verify task access
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    require_ownership(task, current_user)
    
    # Create comment
    comment = TaskComment(
        tenant_id=current_user.tenant_id,
        task_id=task_id,
        user_id=current_user.id,
        comment=comment_data.comment
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    
    # Update task's updated_at
    task.updated_at = datetime.utcnow()
    session.add(task)
    session.commit()
    
    # Get user info for response
    user = session.get(User, current_user.id)
    response = TaskCommentResponse(
        id=comment.id,
        tenant_id=comment.tenant_id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user_name=user.full_name if user else None,
        user_email=user.email if user else None
    )
    
    return response


@router.get("/{task_id}/comments", response_model=List[TaskCommentResponse])
async def get_task_comments(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all comments for a task"""
    # Verify task access
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    require_ownership(task, current_user)
    
    # Get comments
    comments = session.exec(
        select(TaskComment)
        .where(
            and_(
                TaskComment.task_id == task_id,
                TaskComment.tenant_id == current_user.tenant_id
            )
        )
        .order_by(TaskComment.created_at.desc())
    ).all()
    
    # Get user info for each comment
    result = []
    for comment in comments:
        user = session.get(User, comment.user_id)
        result.append(TaskCommentResponse(
            id=comment.id,
            tenant_id=comment.tenant_id,
            task_id=comment.task_id,
            user_id=comment.user_id,
            comment=comment.comment,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            user_name=user.full_name if user else None,
            user_email=user.email if user else None
        ))
    
    return result


@router.delete("/comments/{comment_id}")
async def delete_task_comment(
    comment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a comment on a task"""
    comment = session.get(TaskComment, comment_id)
    if not comment or comment.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Only allow deletion by comment owner or admin
    if comment.user_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments"
        )
    
    session.delete(comment)
    session.commit()
    return {"message": "Comment deleted successfully"}


@router.post("/generate-linkedin-message")
async def generate_linkedin_message(
    request: dict = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Gera uma mensagem do LinkedIn (nota de conexão ou follow-up) usando IA
    
    Args:
        request: Body com lead_id, message_type ("connection_note" ou "followup") e language (opcional)
        
    Returns:
        JSON com a mensagem gerada
    """
    lead_id = request.get("lead_id", 0)
    message_type = request.get("message_type")
    language = request.get("language", "pt-BR")
    is_template = request.get("is_template", False)
    followup_context = request.get("followup_context", "generic")
    
    if not is_template and not lead_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lead_id é obrigatório quando is_template é False"
        )
    
    if message_type not in ["connection_note", "followup"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="message_type deve ser 'connection_note' ou 'followup'"
        )
    
    # Validar contexto de follow-up
    valid_contexts = ["after_connection", "after_meeting", "after_email", "after_call", "generic"]
    if followup_context not in valid_contexts:
        followup_context = "generic"
    
    # Se for template, criar um lead fictício
    if is_template:
        from app.models import LeadStatus
        lead = Lead(
            id=0,
            tenant_id=current_user.tenant_id,
            name="João Silva",
            company="Empresa Exemplo Ltda",
            position="Diretor de Tecnologia",
            email="joao@exemplo.com",
            phone="(11) 99999-9999",
            website="https://exemplo.com",
            linkedin_url="https://linkedin.com/in/joaosilva",
            status=LeadStatus.NEW
        )
    else:
        lead = session.get(Lead, lead_id)
        if not lead:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lead not found"
            )
        require_ownership(lead, current_user)
    
    try:
        logger.info(f"🤖 [LINKEDIN] Gerando mensagem tipo '{message_type}' para lead {lead_id} em idioma: {language} (template: {is_template})")
        
        if message_type == "connection_note":
            message = generate_linkedin_connection_note(lead, session, language=language, is_template=is_template)
        else:  # followup
            message = generate_linkedin_followup_message(
                lead, 
                session, 
                language=language, 
                is_template=is_template,
                followup_context=followup_context
            )
        
        logger.info(f"✅ [LINKEDIN] Mensagem gerada com sucesso ({len(message)} caracteres)")
        
        return {
            "success": True,
            "message": message,
            "message_type": message_type,
            "lead_id": lead_id
        }
        
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"❌ [LINKEDIN] Erro ao gerar mensagem: {error_msg}")
        
        if "LLM não está disponível" in error_msg or "Connection refused" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM não está disponível. Configure OpenAI ou Ollama no arquivo .env"
            )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar mensagem: {error_msg}"
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ [LINKEDIN] Erro inesperado ao gerar mensagem: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar mensagem: {error_msg}"
        )

