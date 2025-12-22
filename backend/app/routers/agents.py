from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models import User, Playbook, AgentSuggestion
from app.agents.sdr_agent import process_lead_with_agent
from app.dependencies import get_current_active_user
from pydantic import BaseModel

router = APIRouter()


class LeadProcessRequest(BaseModel):
    lead_name: str
    lead_email: str
    lead_company: str
    lead_position: str = None


class AgentSuggestionResponse(BaseModel):
    suggestion_id: int
    suggested_approach: str
    research_data: dict
    playbook_used: str = None


@router.post("/process-lead", response_model=AgentSuggestionResponse)
async def process_lead(
    lead_data: LeadProcessRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Process a lead through the SDR agent"""
    # Get active playbooks for the tenant
    playbooks = session.exec(
        select(Playbook).where(
            Playbook.tenant_id == current_user.tenant_id,
            Playbook.is_active == True
        )
    ).all()
    
    if not playbooks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active playbooks found. Please create a playbook first."
        )
    
    # Use the first active playbook (in production, you might want to select based on criteria)
    playbook = playbooks[0]
    
    # Process lead with agent
    result = await process_lead_with_agent(
        lead_name=lead_data.lead_name,
        lead_email=lead_data.lead_email,
        lead_company=lead_data.lead_company,
        lead_position=lead_data.lead_position,
        playbook_content=playbook.content
    )
    
    # Save suggestion
    suggestion = AgentSuggestion(
        tenant_id=current_user.tenant_id,
        suggested_approach=result["suggested_approach"],
        research_data=result.get("research_data", "{}"),
        playbook_used=playbook.id
    )
    session.add(suggestion)
    session.commit()
    session.refresh(suggestion)
    
    return AgentSuggestionResponse(
        suggestion_id=suggestion.id,
        suggested_approach=suggestion.suggested_approach,
        research_data=result.get("research_data", {}),
        playbook_used=playbook.name
    )





