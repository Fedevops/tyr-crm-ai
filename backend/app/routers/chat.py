"""
Rotas para chat com assistente virtual
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List
from app.database import get_session
from app.models import AssistantChatMessage, AssistantChatMessageCreate, AssistantChatMessageResponse, User
from app.dependencies import get_current_active_user
from app.services.chat_service import generate_chat_response

router = APIRouter()


def chat_message_to_response(chat_message: AssistantChatMessage) -> AssistantChatMessageResponse:
    """Converte AssistantChatMessage para AssistantChatMessageResponse"""
    return AssistantChatMessageResponse(
        id=chat_message.id,
        message=chat_message.message,
        response=chat_message.response,
        context_used_json=chat_message.context_used_json,
        created_at=chat_message.created_at
    )


@router.post("", response_model=AssistantChatMessageResponse)
async def send_message(
    message_data: AssistantChatMessageCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Envia mensagem ao assistente e recebe resposta"""
    if not message_data.message or not message_data.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mensagem não pode estar vazia"
        )
    
    # Gerar resposta usando LLM + RAG
    language = "pt-BR"  # Pode ser obtido do usuário ou header
    response_text = generate_chat_response(
        session=session,
        user=current_user,
        message=message_data.message,
        language=language
    )
    
    # Buscar a mensagem salva
    chat_message = session.exec(
        select(AssistantChatMessage).where(
            AssistantChatMessage.tenant_id == current_user.tenant_id,
            AssistantChatMessage.user_id == current_user.id
        ).order_by(AssistantChatMessage.created_at.desc())
    ).first()
    
    if not chat_message:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao salvar mensagem"
        )
    
    return chat_message_to_response(chat_message)


@router.get("/history", response_model=List[AssistantChatMessageResponse])
async def get_chat_history(
    limit: int = 50,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Busca histórico de conversas"""
    messages = session.exec(
        select(AssistantChatMessage).where(
            AssistantChatMessage.tenant_id == current_user.tenant_id,
            AssistantChatMessage.user_id == current_user.id
        ).order_by(AssistantChatMessage.created_at.desc()).limit(limit)
    ).all()
    
    return [chat_message_to_response(msg) for msg in reversed(messages)]

