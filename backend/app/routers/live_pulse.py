from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.responses import JSONResponse, Response
from sqlmodel import Session, select, func
from typing import List, Dict, Set
from datetime import datetime, timedelta
import uuid
import logging
import json
from app.database import get_session
from app.models import (
    Visitor, VisitorCreate, VisitorUpdate, VisitorResponse, VisitorStatus,
    ChatMessage, ChatMessageCreate, ChatMessageResponse, ChatMessageSenderType,
    ConvertToLeadRequest, User, Lead, LeadCreate,
    VisitReport, VisitReportCreate, VisitReportResponse
)
from app.dependencies import get_current_active_user, ensure_ownership

logger = logging.getLogger(__name__)

router = APIRouter()

# Headers CORS para endpoints públicos
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}

# Função auxiliar para serializar VisitorResponse com datetimes
def serialize_visitor_response(response: VisitorResponse) -> dict:
    """Serializa VisitorResponse para dict com datetimes convertidos para ISO format"""
    data = response.dict()
    # Converter datetimes para strings ISO
    for key in ['created_at', 'updated_at', 'last_activity_at']:
        if key in data and data[key] is not None:
            if isinstance(data[key], datetime):
                data[key] = data[key].isoformat()
    return data

# Gerenciador de conexões WebSocket
class ConnectionManager:
    def __init__(self):
        # tenant_id -> Set[WebSocket]
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        # visitor_id -> Set[WebSocket]
        self.visitor_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect_operator(self, websocket: WebSocket, tenant_id: int):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        self.active_connections[tenant_id].add(websocket)
    
    async def connect_visitor(self, websocket: WebSocket, visitor_id: str):
        await websocket.accept()
        if visitor_id not in self.visitor_connections:
            self.visitor_connections[visitor_id] = set()
        self.visitor_connections[visitor_id].add(websocket)
    
    def disconnect_operator(self, websocket: WebSocket, tenant_id: int):
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)
    
    def disconnect_visitor(self, websocket: WebSocket, visitor_id: str):
        if visitor_id in self.visitor_connections:
            self.visitor_connections[visitor_id].discard(websocket)
    
    async def broadcast_to_operators(self, tenant_id: int, message: dict):
        if tenant_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[tenant_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error broadcasting to operator: {e}")
                    disconnected.add(connection)
            # Remove conexões desconectadas
            for conn in disconnected:
                self.active_connections[tenant_id].discard(conn)
    
    async def send_to_visitor(self, visitor_id: str, message: dict):
        if visitor_id in self.visitor_connections:
            disconnected = set()
            for connection in self.visitor_connections[visitor_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending to visitor: {e}")
                    disconnected.add(connection)
            for conn in disconnected:
                self.visitor_connections[visitor_id].discard(conn)

manager = ConnectionManager()


@router.get("/visitors", response_model=List[VisitorResponse])
async def get_visitors(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Lista visitantes ativos do tenant"""
    # Buscar visitantes ativos (últimos 30 minutos)
    cutoff_time = datetime.utcnow() - timedelta(minutes=30)
    
    visitors = session.exec(
        select(Visitor).where(
            Visitor.tenant_id == current_user.tenant_id,
            Visitor.last_activity_at >= cutoff_time
        ).order_by(Visitor.last_activity_at.desc())
    ).all()
    
    now = datetime.utcnow()
    
    return [
        VisitorResponse(
            id=v.id,
            tenant_id=v.tenant_id,
            visitor_id=v.visitor_id,
            ip=v.ip,
            latitude=v.latitude,
            longitude=v.longitude,
            city=v.city,
            country=v.country,
            current_page=v.current_page,
            # Calcular duration baseado no tempo desde created_at
            duration=int((now - v.created_at).total_seconds()),
            status=v.status.value,
            name=v.name,
            email=v.email,
            created_at=v.created_at,
            updated_at=v.updated_at,
            last_activity_at=v.last_activity_at
        )
        for v in visitors
    ]


@router.get("/visitors/{visitor_id}", response_model=VisitorResponse)
async def get_visitor(
    visitor_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Detalhes de um visitante específico"""
    visitor = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor not found"
        )
    
    return VisitorResponse(
        id=visitor.id,
        tenant_id=visitor.tenant_id,
        visitor_id=visitor.visitor_id,
        ip=visitor.ip,
        latitude=visitor.latitude,
        longitude=visitor.longitude,
        city=visitor.city,
        country=visitor.country,
        current_page=visitor.current_page,
        duration=visitor.duration,
        status=visitor.status.value,
        name=visitor.name,
        email=visitor.email,
        created_at=visitor.created_at,
        updated_at=visitor.updated_at,
        last_activity_at=visitor.last_activity_at
    )


@router.options("/visitors")
async def options_visitors():
    """Handle CORS preflight for visitors endpoint"""
    from fastapi.responses import Response
    return Response(
        content="",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )

@router.post("/visitors", response_model=VisitorResponse)
async def create_visitor(
    visitor_data: VisitorCreate,
    tenant_id: int = Query(..., description="Tenant ID (obrigatório)"),
    session: Session = Depends(get_session),
    request: Request = None
):
    """Registrar novo visitante (chamado pelo widget) - Endpoint público"""
    from app.models import Tenant
    
    # Verificar se tenant existe
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Gerar visitor_id se não fornecido
    visitor_id = visitor_data.visitor_id or str(uuid.uuid4())
    
    # Verificar se já existe
    existing = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == tenant_id
        )
    ).first()
    
    if existing:
        # Atualizar atividade
        existing.last_activity_at = datetime.utcnow()
        existing.current_page = visitor_data.current_page or existing.current_page
        if visitor_data.latitude and visitor_data.longitude:
            existing.latitude = visitor_data.latitude
            existing.longitude = visitor_data.longitude
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        
        # Broadcast atualização
        await manager.broadcast_to_operators(
            tenant_id,
            {
                "type": "visitor_updated",
                "visitor": VisitorResponse(
                    id=existing.id,
                    tenant_id=existing.tenant_id,
                    visitor_id=existing.visitor_id,
                    ip=existing.ip,
                    latitude=existing.latitude,
                    longitude=existing.longitude,
                    city=existing.city,
                    country=existing.country,
                    current_page=existing.current_page,
                    duration=existing.duration,
                    status=existing.status.value,
                    name=existing.name,
                    email=existing.email,
                    created_at=existing.created_at,
                    updated_at=existing.updated_at,
                    last_activity_at=existing.last_activity_at
                ).dict()
            }
        )
        
        response_data = VisitorResponse(
            id=existing.id,
            tenant_id=existing.tenant_id,
            visitor_id=existing.visitor_id,
            ip=existing.ip,
            latitude=existing.latitude,
            longitude=existing.longitude,
            city=existing.city,
            country=existing.country,
            current_page=existing.current_page,
            duration=existing.duration,
            status=existing.status.value,
            name=existing.name,
            email=existing.email,
            created_at=existing.created_at,
            updated_at=existing.updated_at,
            last_activity_at=existing.last_activity_at
        )
        
        # Retornar com headers CORS para endpoints públicos
        return JSONResponse(
            content=json.loads(response_data.json()),
            headers=CORS_HEADERS
        )
    
    # Criar novo visitante
    visitor = Visitor(
        tenant_id=tenant_id,
        visitor_id=visitor_id,
        ip=visitor_data.ip,
        latitude=visitor_data.latitude,
        longitude=visitor_data.longitude,
        city=visitor_data.city,
        country=visitor_data.country,
        current_page=visitor_data.current_page,
        status=VisitorStatus.NAVIGATING
    )
    
    session.add(visitor)
    session.commit()
    session.refresh(visitor)
    
    # Broadcast novo visitante
    await manager.broadcast_to_operators(
        tenant_id,
        {
            "type": "visitor_new",
            "visitor": VisitorResponse(
                id=visitor.id,
                tenant_id=visitor.tenant_id,
                visitor_id=visitor.visitor_id,
                ip=visitor.ip,
                latitude=visitor.latitude,
                longitude=visitor.longitude,
                city=visitor.city,
                country=visitor.country,
                current_page=visitor.current_page,
                duration=visitor.duration,
                status=visitor.status.value,
                name=visitor.name,
                email=visitor.email,
                created_at=visitor.created_at,
                updated_at=visitor.updated_at,
                last_activity_at=visitor.last_activity_at
            ).dict()
        }
    )
    
    response_data = VisitorResponse(
        id=visitor.id,
        tenant_id=visitor.tenant_id,
        visitor_id=visitor.visitor_id,
        ip=visitor.ip,
        latitude=visitor.latitude,
        longitude=visitor.longitude,
        city=visitor.city,
        country=visitor.country,
        current_page=visitor.current_page,
        duration=visitor.duration,
        status=visitor.status.value,
        name=visitor.name,
        email=visitor.email,
        created_at=visitor.created_at,
        updated_at=visitor.updated_at,
        last_activity_at=visitor.last_activity_at
    )
    
    # Retornar com headers CORS para endpoints públicos
    return JSONResponse(
        content=json.loads(response_data.json()),
        headers=CORS_HEADERS
    )


@router.options("/visitors/{visitor_id}")
async def options_update_visitor():
    """Handle CORS preflight for update visitor endpoint"""
    return Response(content="", headers=CORS_HEADERS)

@router.put("/visitors/{visitor_id}", response_model=VisitorResponse)
async def update_visitor(
    visitor_id: str,
    visitor_data: VisitorUpdate,
    tenant_id: int = Query(..., description="Tenant ID (obrigatório)"),
    session: Session = Depends(get_session)
):
    """Atualizar página/atividade do visitante - Endpoint público"""
    visitor = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == tenant_id
        )
    ).first()
    
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor not found"
        )
    
    if visitor_data.current_page:
        visitor.current_page = visitor_data.current_page
    if visitor_data.latitude is not None:
        visitor.latitude = visitor_data.latitude
    if visitor_data.longitude is not None:
        visitor.longitude = visitor_data.longitude
    if visitor_data.name:
        visitor.name = visitor_data.name
    if visitor_data.email:
        visitor.email = visitor_data.email
    
    visitor.last_activity_at = datetime.utcnow()
    visitor.updated_at = datetime.utcnow()
    
    session.add(visitor)
    session.commit()
    session.refresh(visitor)
    
    # Broadcast atualização
    await manager.broadcast_to_operators(
        tenant_id,
        {
            "type": "visitor_updated",
            "visitor": VisitorResponse(
                id=visitor.id,
                tenant_id=visitor.tenant_id,
                visitor_id=visitor.visitor_id,
                ip=visitor.ip,
                latitude=visitor.latitude,
                longitude=visitor.longitude,
                city=visitor.city,
                country=visitor.country,
                current_page=visitor.current_page,
                duration=visitor.duration,
                status=visitor.status.value,
                name=visitor.name,
                email=visitor.email,
                created_at=visitor.created_at,
                updated_at=visitor.updated_at,
                last_activity_at=visitor.last_activity_at
            ).dict()
        }
    )
    
    response_data = VisitorResponse(
        id=visitor.id,
        tenant_id=visitor.tenant_id,
        visitor_id=visitor.visitor_id,
        ip=visitor.ip,
        latitude=visitor.latitude,
        longitude=visitor.longitude,
        city=visitor.city,
        country=visitor.country,
        current_page=visitor.current_page,
        duration=visitor.duration,
        status=visitor.status.value,
        name=visitor.name,
        email=visitor.email,
        created_at=visitor.created_at,
        updated_at=visitor.updated_at,
        last_activity_at=visitor.last_activity_at
    )
    
    # Retornar com headers CORS para endpoints públicos
    return JSONResponse(
        content=json.loads(response_data.json()),
        headers=CORS_HEADERS
    )


@router.post("/visitors/{visitor_id}/chat", response_model=ChatMessageResponse)
async def send_chat_message(
    visitor_id: str,
    message_data: ChatMessageCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Enviar mensagem de operador para visitante"""
    visitor = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor not found"
        )
    
    message = ChatMessage(
        tenant_id=visitor.tenant_id,
        visitor_id=visitor_id,
        sender_type=ChatMessageSenderType.OPERATOR,
        user_id=current_user.id,
        message=message_data.message,
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    
    # Buscar informações do usuário
    user_name = current_user.full_name
    user_email = current_user.email
    
    # Broadcast para operadores
    await manager.broadcast_to_operators(
        visitor.tenant_id,
        {
            "type": "chat_message",
            "visitor_id": visitor_id,
            "message": {
                "id": message.id,
                "sender_type": "operator",
                "message": message.message,
                "created_at": message.created_at.isoformat(),
                "user_name": user_name,
                "user_email": user_email
            }
        }
    )
    
    # Enviar mensagem para o visitante via WebSocket
    await manager.send_to_visitor(
        visitor_id,
        {
            "type": "message",
            "message": message.message,
            "sender": user_name or "Operador",
            "created_at": message.created_at.isoformat()
        }
    )
    
    return ChatMessageResponse(
        id=message.id,
        tenant_id=message.tenant_id,
        visitor_id=message.visitor_id,
        sender_type=message.sender_type.value,
        user_id=message.user_id,
        message=message.message,
        created_at=message.created_at,
        user_name=user_name,
        user_email=user_email
    )


@router.get("/visitors/{visitor_id}/chat", response_model=List[ChatMessageResponse])
async def get_chat_history(
    visitor_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Histórico de mensagens do chat"""
    # Verificar se visitante existe e pertence ao tenant
    visitor = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor not found"
        )
    
    messages = session.exec(
        select(ChatMessage).where(
            ChatMessage.visitor_id == visitor_id,
            ChatMessage.tenant_id == current_user.tenant_id
        ).order_by(ChatMessage.created_at)
    ).all()
    
    # Buscar informações dos usuários
    result = []
    for msg in messages:
        user_name = None
        user_email = None
        if msg.user_id:
            user = session.get(User, msg.user_id)
            if user:
                user_name = user.full_name
                user_email = user.email
        
        result.append(ChatMessageResponse(
            id=msg.id,
            tenant_id=msg.tenant_id,
            visitor_id=msg.visitor_id,
            sender_type=msg.sender_type.value,
            user_id=msg.user_id,
            message=msg.message,
            created_at=msg.created_at,
            user_name=user_name,
            user_email=user_email
        ))
    
    return result


@router.post("/visitors/{visitor_id}/convert-to-lead")
async def convert_to_lead(
    visitor_id: str,
    lead_data: ConvertToLeadRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Converter visitante em lead"""
    visitor = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor not found"
        )
    
    # Criar lead usando a função existente
    lead_create = LeadCreate(
        name=lead_data.name,
        email=lead_data.email,
        phone=lead_data.phone,
        company=lead_data.company,
        notes=lead_data.notes or f"Convertido do Live Pulse. Visitante: {visitor_id}. Página: {visitor.current_page}",
        source="Live Pulse"
    )
    
    # Usar a função de criação de lead existente
    from app.dependencies import ensure_ownership
    lead_dict = lead_create.dict()
    lead_dict = ensure_ownership(lead_dict, current_user)
    
    lead = Lead(
        **lead_dict,
        tenant_id=current_user.tenant_id
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)
    
    return {
        "success": True,
        "lead_id": lead.id,
        "message": "Visitor converted to lead successfully"
    }


@router.websocket("/ws/operators")
async def websocket_operators(websocket: WebSocket, session: Session = Depends(get_session)):
    """WebSocket para operadores receberem atualizações em tempo real"""
    # Autenticação básica via query params (em produção, usar JWT)
    tenant_id = int(websocket.query_params.get("tenant_id", 0))
    user_id = int(websocket.query_params.get("user_id", 0))
    
    if not tenant_id or not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    await manager.connect_operator(websocket, tenant_id)
    
    try:
        while True:
            # Operadores apenas recebem mensagens, não enviam via este endpoint
            data = await websocket.receive_json()
            # Processar comandos se necessário
    except WebSocketDisconnect:
        manager.disconnect_operator(websocket, tenant_id)


@router.websocket("/ws/visitors/{visitor_id}")
async def websocket_visitor(
    websocket: WebSocket,
    visitor_id: str,
    session: Session = Depends(get_session)
):
    """WebSocket para chat com visitante"""
    # Obter tenant_id dos query params
    tenant_id = int(websocket.query_params.get("tenant_id", 0))
    
    if not tenant_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    await manager.connect_visitor(websocket, visitor_id)
    
    # Buscar visitante
    visitor = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == tenant_id
        )
    ).first()
    
    if not visitor:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "message":
                # Salvar mensagem do visitante
                message = ChatMessage(
                    tenant_id=visitor.tenant_id,
                    visitor_id=visitor_id,
                    sender_type=ChatMessageSenderType.VISITOR,
                    message=data.get("message", ""),
                )
                session.add(message)
                
                # Atualizar status do visitante
                visitor.status = VisitorStatus.IN_CHAT
                visitor.last_activity_at = datetime.utcnow()
                session.add(visitor)
                session.commit()
                
                # Broadcast para operadores
                await manager.broadcast_to_operators(
                    visitor.tenant_id,
                    {
                        "type": "chat_message",
                        "visitor_id": visitor_id,
                        "message": {
                            "id": message.id,
                            "sender_type": "visitor",
                            "message": message.message,
                            "created_at": message.created_at.isoformat()
                        }
                    }
                )
                
                # Confirmar recebimento
                await websocket.send_json({
                    "type": "message_sent",
                    "message_id": message.id
                })
            
            elif data.get("type") == "operator_message":
                # Mensagem de operador para visitante
                user_id = data.get("user_id")
                message_text = data.get("message", "")
                
                message = ChatMessage(
                    tenant_id=visitor.tenant_id,
                    visitor_id=visitor_id,
                    sender_type=ChatMessageSenderType.OPERATOR,
                    user_id=user_id,
                    message=message_text,
                )
                session.add(message)
                session.commit()
                session.refresh(message)
                
                # Enviar para visitante
                await websocket.send_json({
                    "type": "message",
                    "sender_type": "operator",
                    "message": message_text,
                    "created_at": message.created_at.isoformat()
                })
    
    except WebSocketDisconnect:
        manager.disconnect_visitor(websocket, visitor_id)
        # Atualizar status se visitante sair
        if visitor:
            visitor.status = VisitorStatus.NAVIGATING
            session.add(visitor)
            session.commit()


# ==================== VISIT REPORTS ====================

@router.post("/visitors/{visitor_id}/report", response_model=VisitReportResponse)
async def create_visit_report(
    visitor_id: str,
    report_data: VisitReportCreate,
    tenant_id: int = Query(..., description="Tenant ID (obrigatório)"),
    session: Session = Depends(get_session)
):
    """Criar relatório de visita quando o visitante sai do site - Endpoint público"""
    # Buscar visitante
    visitor = session.exec(
        select(Visitor).where(
            Visitor.visitor_id == visitor_id,
            Visitor.tenant_id == tenant_id
        )
    ).first()
    
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor not found"
        )
    
    # Contar mensagens do chat
    messages_count = session.exec(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.visitor_id == visitor_id,
            ChatMessage.tenant_id == tenant_id
        )
    ).one() or 0
    
    # Criar relatório
    report = VisitReport(
        tenant_id=tenant_id,
        visitor_id=visitor_id,
        ip=visitor.ip,
        latitude=visitor.latitude,
        longitude=visitor.longitude,
        city=visitor.city,
        country=visitor.country,
        name=visitor.name,
        email=visitor.email,
        pages_visited=report_data.pages_visited,
        total_duration=report_data.total_duration,
        chat_initiated=report_data.chat_initiated or (messages_count > 0),
        messages_count=messages_count,
        converted_to_lead=report_data.converted_to_lead,
        lead_id=report_data.lead_id,
        started_at=visitor.created_at,
        ended_at=datetime.utcnow()
    )
    
    session.add(report)
    session.commit()
    session.refresh(report)
    
    return VisitReportResponse(
        id=report.id,
        tenant_id=report.tenant_id,
        visitor_id=report.visitor_id,
        ip=report.ip,
        latitude=report.latitude,
        longitude=report.longitude,
        city=report.city,
        country=report.country,
        name=report.name,
        email=report.email,
        pages_visited=report.pages_visited,
        total_duration=report.total_duration,
        chat_initiated=report.chat_initiated,
        messages_count=report.messages_count,
        converted_to_lead=report.converted_to_lead,
        lead_id=report.lead_id,
        started_at=report.started_at,
        ended_at=report.ended_at,
        created_at=report.created_at
    )


@router.get("/visit-reports", response_model=List[VisitReportResponse])
async def get_visit_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Listar relatórios de visitas do tenant"""
    reports = session.exec(
        select(VisitReport).where(
            VisitReport.tenant_id == current_user.tenant_id
        ).order_by(VisitReport.ended_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    
    return [
        VisitReportResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            visitor_id=r.visitor_id,
            ip=r.ip,
            latitude=r.latitude,
            longitude=r.longitude,
            city=r.city,
            country=r.country,
            name=r.name,
            email=r.email,
            pages_visited=r.pages_visited,
            total_duration=r.total_duration,
            chat_initiated=r.chat_initiated,
            messages_count=r.messages_count,
            converted_to_lead=r.converted_to_lead,
            lead_id=r.lead_id,
            started_at=r.started_at,
            ended_at=r.ended_at,
            created_at=r.created_at
        )
        for r in reports
    ]


@router.get("/visit-reports/{report_id}", response_model=VisitReportResponse)
async def get_visit_report(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Detalhes de um relatório de visita específico"""
    report = session.exec(
        select(VisitReport).where(
            VisitReport.id == report_id,
            VisitReport.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit report not found"
        )
    
    return VisitReportResponse(
        id=report.id,
        tenant_id=report.tenant_id,
        visitor_id=report.visitor_id,
        ip=report.ip,
        latitude=report.latitude,
        longitude=report.longitude,
        city=report.city,
        country=report.country,
        name=report.name,
        email=report.email,
        pages_visited=report.pages_visited,
        total_duration=report.total_duration,
        chat_initiated=report.chat_initiated,
        messages_count=report.messages_count,
        converted_to_lead=report.converted_to_lead,
        lead_id=report.lead_id,
        started_at=report.started_at,
        ended_at=report.ended_at,
        created_at=report.created_at
    )

