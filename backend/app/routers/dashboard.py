from typing import Dict, List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func, and_, or_
from app.database import get_session
from app.models import (
    Lead, LeadStatus, Task, TaskStatus, Opportunity,
    Account, Contact, SalesStage, SalesFunnel, User
)
from app.dependencies import get_current_active_user, apply_ownership_filter

router = APIRouter()


@router.get("/stats", response_model=Dict)
async def get_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get comprehensive dashboard statistics"""
    try:
        # Leads statistics
        leads_query = select(Lead)
        leads_query = apply_ownership_filter(leads_query, Lead, current_user)
        all_leads = session.exec(leads_query).all()
        
        leads_by_status = {}
        leads_by_source = {}
        total_score = 0
        leads_with_score = 0
        
        for lead in all_leads:
            status_key = lead.status.value if isinstance(lead.status, LeadStatus) else str(lead.status)
            leads_by_status[status_key] = leads_by_status.get(status_key, 0) + 1
            
            if lead.source:
                leads_by_source[lead.source] = leads_by_source.get(lead.source, 0) + 1
            
            if lead.score is not None:
                total_score += lead.score
                leads_with_score += 1
        
        avg_score = round(total_score / leads_with_score, 2) if leads_with_score > 0 else 0
        
        # Tasks statistics
        tasks_query = select(Task)
        tasks_query = apply_ownership_filter(tasks_query, Task, current_user)
        all_tasks = session.exec(tasks_query).all()
        
        tasks_by_status = {}
        overdue_tasks = 0
        upcoming_tasks = 0
        now = datetime.utcnow()
        next_7_days = now + timedelta(days=7)
        
        for task in all_tasks:
            status_key = task.status.value if isinstance(task.status, TaskStatus) else str(task.status)
            tasks_by_status[status_key] = tasks_by_status.get(status_key, 0) + 1
            
            if task.due_date:
                if task.due_date < now and task.status not in [TaskStatus.COMPLETED, TaskStatus.CANCELLED]:
                    overdue_tasks += 1
                elif task.due_date <= next_7_days and task.status not in [TaskStatus.COMPLETED, TaskStatus.CANCELLED]:
                    upcoming_tasks += 1
        
        # Opportunities statistics
        opps_query = select(Opportunity)
        opps_query = apply_ownership_filter(opps_query, Opportunity, current_user)
        all_opportunities = session.exec(opps_query).all()
        
        opportunities_by_stage = {}
        total_opportunity_value = 0
        won_opportunities = 0
        lost_opportunities = 0
        
        for opp in all_opportunities:
            if opp.stage_id:
                stage = session.get(SalesStage, opp.stage_id)
                if stage:
                    stage_name = stage.name
                    opportunities_by_stage[stage_name] = opportunities_by_stage.get(stage_name, 0) + 1
            
            if opp.amount:
                total_opportunity_value += opp.amount
            
            # Considerar como "won" se estiver em estágio final com alta probabilidade
            # ou se tiver status específico (se houver)
            if opp.stage_id:
                stage = session.get(SalesStage, opp.stage_id)
                if stage and stage.probability >= 90:
                    won_opportunities += 1
                elif stage and stage.probability <= 10:
                    lost_opportunities += 1
        
        # Accounts and Contacts statistics
        accounts_query = select(Account)
        accounts_query = apply_ownership_filter(accounts_query, Account, current_user)
        all_accounts = session.exec(accounts_query).all()
        
        contacts_query = select(Contact)
        contacts_query = apply_ownership_filter(contacts_query, Contact, current_user)
        all_contacts = session.exec(contacts_query).all()
        
        return {
            "leads": {
                "total": len(all_leads),
                "by_status": leads_by_status,
                "by_source": leads_by_source,
                "average_score": avg_score,
                "assigned": sum(1 for l in all_leads if l.owner_id),
                "unassigned": sum(1 for l in all_leads if not l.owner_id)
            },
            "tasks": {
                "total": len(all_tasks),
                "by_status": tasks_by_status,
                "overdue": overdue_tasks,
                "upcoming": upcoming_tasks,
                "completed": tasks_by_status.get(TaskStatus.COMPLETED.value, 0),
                "pending": tasks_by_status.get(TaskStatus.PENDING.value, 0)
            },
            "opportunities": {
                "total": len(all_opportunities),
                "by_stage": opportunities_by_stage,
                "total_value": total_opportunity_value,
                "won": won_opportunities,
                "lost": lost_opportunities
            },
            "accounts": {
                "total": len(all_accounts)
            },
            "contacts": {
                "total": len(all_contacts)
            }
        }
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching dashboard stats: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching dashboard stats: {str(e)}"
        )


@router.get("/funnel", response_model=Dict)
async def get_sales_funnel(
    funnel_id: Optional[int] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get sales funnel data"""
    try:
        # Se não especificar funnel_id, usar o funil padrão
        if funnel_id is None:
            funnel_query = select(SalesFunnel).where(
                and_(
                    SalesFunnel.tenant_id == current_user.tenant_id,
                    SalesFunnel.is_default == True
                )
            )
            funnel = session.exec(funnel_query).first()
            
            if not funnel:
                # Se não houver funil padrão, pegar o primeiro funil do tenant
                funnel_query = select(SalesFunnel).where(
                    SalesFunnel.tenant_id == current_user.tenant_id
                )
                funnel = session.exec(funnel_query).first()
        else:
            funnel = session.get(SalesFunnel, funnel_id)
            if funnel and funnel.tenant_id != current_user.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this funnel"
                )
        
        if not funnel:
            return {
                "funnel": None,
                "stages": [],
                "opportunities": []
            }
        
        # Buscar estágios do funil ordenados por order
        stages_query = select(SalesStage).where(
            SalesStage.funnel_id == funnel.id
        ).order_by(SalesStage.order)
        stages = session.exec(stages_query).all()
        
        # Buscar oportunidades por estágio
        opps_query = select(Opportunity)
        opps_query = apply_ownership_filter(opps_query, Opportunity, current_user)
        all_opportunities = session.exec(opps_query).all()
        
        funnel_data = {
            "funnel": {
                "id": funnel.id,
                "name": funnel.name,
                "is_default": funnel.is_default
            },
            "stages": []
        }
        
        for stage in stages:
            # Contar oportunidades neste estágio
            stage_opps = [opp for opp in all_opportunities if opp.stage_id == stage.id]
            stage_value = sum(opp.amount or 0 for opp in stage_opps)
            
            funnel_data["stages"].append({
                "id": stage.id,
                "name": stage.name,
                "order": stage.order,
                "probability": stage.probability,
                "opportunity_count": len(stage_opps),
                "total_value": stage_value,
                "opportunities": [
                    {
                        "id": opp.id,
                        "name": opp.name,
                        "amount": opp.amount,
                        "currency": opp.currency,
                        "expected_close_date": opp.expected_close_date.isoformat() if opp.expected_close_date else None,
                        "account_id": opp.account_id,
                        "contact_id": opp.contact_id
                    }
                    for opp in stage_opps
                ]
            })
        
        return funnel_data
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching sales funnel: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching sales funnel: {str(e)}"
        )

