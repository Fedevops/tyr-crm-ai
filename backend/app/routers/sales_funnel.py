from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, and_, func
from app.database import get_session
from app.models import (
    SalesFunnel, SalesFunnelCreate, SalesFunnelResponse,
    SalesStage, SalesStageCreate, SalesStageResponse,
    Opportunity, User
)
from app.dependencies import get_current_active_user, apply_ownership_filter

router = APIRouter()


@router.post("", response_model=SalesFunnelResponse)
async def create_sales_funnel(
    funnel_data: SalesFunnelCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new sales funnel"""
    # Se este funil for marcado como default, desmarcar outros
    if funnel_data.is_default:
        existing_defaults = session.exec(
            select(SalesFunnel).where(
                and_(
                    SalesFunnel.tenant_id == current_user.tenant_id,
                    SalesFunnel.is_default == True
                )
            )
        ).all()
        for funnel in existing_defaults:
            funnel.is_default = False
            session.add(funnel)
    
    funnel = SalesFunnel(
        **funnel_data.dict(),
        tenant_id=current_user.tenant_id
    )
    session.add(funnel)
    session.commit()
    session.refresh(funnel)
    return funnel


@router.get("", response_model=List[SalesFunnelResponse])
async def get_sales_funnels(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all sales funnels for the current tenant"""
    funnels = session.exec(
        select(SalesFunnel).where(SalesFunnel.tenant_id == current_user.tenant_id)
    ).all()
    return funnels


@router.get("/{funnel_id}", response_model=SalesFunnelResponse)
async def get_sales_funnel(
    funnel_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific sales funnel with its stages"""
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    return funnel


@router.get("/{funnel_id}/stats", response_model=Dict)
async def get_funnel_stats(
    funnel_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get detailed statistics for a sales funnel"""
    # Verificar se o funil existe e pertence ao tenant
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    # Buscar estágios do funil
    stages = session.exec(
        select(SalesStage).where(SalesStage.funnel_id == funnel_id).order_by(SalesStage.order)
    ).all()
    
    # Buscar oportunidades com filtro de ownership
    opps_query = select(Opportunity)
    opps_query = apply_ownership_filter(opps_query, Opportunity, current_user)
    all_opportunities = session.exec(opps_query).all()
    
    # Estatísticas por estágio
    stage_stats = []
    total_value = 0
    total_opportunities = 0
    
    for stage in stages:
        # Oportunidades neste estágio
        stage_opps = [opp for opp in all_opportunities if opp.stage_id == stage.id]
        stage_value = sum(opp.amount or 0 for opp in stage_opps)
        total_value += stage_value
        total_opportunities += len(stage_opps)
        
        # Calcular valor médio
        avg_value = stage_value / len(stage_opps) if stage_opps else 0
        
        # Calcular valor ponderado (valor * probabilidade)
        weighted_value = sum((opp.amount or 0) * (stage.probability / 100) for opp in stage_opps)
        
        stage_stats.append({
            "stage_id": stage.id,
            "stage_name": stage.name,
            "order": stage.order,
            "probability": stage.probability,
            "opportunity_count": len(stage_opps),
            "total_value": stage_value,
            "average_value": avg_value,
            "weighted_value": weighted_value,
            "opportunities": [
                {
                    "id": opp.id,
                    "name": opp.name,
                    "amount": opp.amount,
                    "currency": opp.currency,
                    "expected_close_date": opp.expected_close_date.isoformat() if opp.expected_close_date else None,
                    "account_id": opp.account_id,
                    "contact_id": opp.contact_id,
                    "owner_id": opp.owner_id
                }
                for opp in stage_opps
            ]
        })
    
    # Calcular taxa de conversão entre estágios
    conversion_rates = []
    for i in range(len(stage_stats) - 1):
        current_stage = stage_stats[i]
        next_stage = stage_stats[i + 1]
        
        if current_stage["opportunity_count"] > 0:
            conversion_rate = (next_stage["opportunity_count"] / current_stage["opportunity_count"]) * 100
        else:
            conversion_rate = 0
        
        conversion_rates.append({
            "from_stage": current_stage["stage_name"],
            "to_stage": next_stage["stage_name"],
            "rate": round(conversion_rate, 2)
        })
    
    return {
        "funnel": {
            "id": funnel.id,
            "name": funnel.name,
            "is_default": funnel.is_default
        },
        "stages": stage_stats,
        "summary": {
            "total_opportunities": total_opportunities,
            "total_value": total_value,
            "weighted_value": sum(s["weighted_value"] for s in stage_stats),
            "conversion_rates": conversion_rates
        }
    }


@router.put("/{funnel_id}", response_model=SalesFunnelResponse)
async def update_sales_funnel(
    funnel_id: int,
    funnel_data: SalesFunnelCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a sales funnel"""
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    # Se este funil for marcado como default, desmarcar outros
    if funnel_data.is_default and not funnel.is_default:
        existing_defaults = session.exec(
            select(SalesFunnel).where(
                and_(
                    SalesFunnel.tenant_id == current_user.tenant_id,
                    SalesFunnel.is_default == True,
                    SalesFunnel.id != funnel_id
                )
            )
        ).all()
        for f in existing_defaults:
            f.is_default = False
            session.add(f)
    
    # Atualizar campos
    for key, value in funnel_data.dict().items():
        setattr(funnel, key, value)
    
    session.add(funnel)
    session.commit()
    session.refresh(funnel)
    return funnel


@router.delete("/{funnel_id}")
async def delete_sales_funnel(
    funnel_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a sales funnel"""
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    # Verificar se há oportunidades usando este funil
    opportunities = session.exec(
        select(Opportunity).join(SalesStage).where(
            and_(
                SalesStage.funnel_id == funnel_id,
                Opportunity.tenant_id == current_user.tenant_id
            )
        )
    ).all()
    
    if opportunities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete funnel with associated opportunities. Please reassign or delete opportunities first."
        )
    
    # Deletar estágios primeiro
    stages = session.exec(
        select(SalesStage).where(SalesStage.funnel_id == funnel_id)
    ).all()
    for stage in stages:
        session.delete(stage)
    
    session.delete(funnel)
    session.commit()
    return {"message": "Sales funnel deleted successfully"}


@router.post("/{funnel_id}/stages", response_model=SalesStageResponse)
async def create_sales_stage(
    funnel_id: int,
    stage_data: SalesStageCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new stage in a sales funnel"""
    # Verificar se o funil existe e pertence ao tenant
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    # Verificar se já existe um estágio com a mesma ordem
    existing_stage = session.exec(
        select(SalesStage).where(
            and_(
                SalesStage.funnel_id == funnel_id,
                SalesStage.order == stage_data.order
            )
        )
    ).first()
    
    if existing_stage:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stage with order {stage_data.order} already exists in this funnel"
        )
    
    # Remover funnel_id do dict se estiver presente (vem do path parameter)
    stage_dict = stage_data.dict()
    stage_dict.pop('funnel_id', None)  # Remove se existir
    
    stage = SalesStage(
        **stage_dict,
        funnel_id=funnel_id  # Usar o funnel_id do path parameter
    )
    session.add(stage)
    session.commit()
    session.refresh(stage)
    return stage


@router.get("/{funnel_id}/stages", response_model=List[SalesStageResponse])
async def get_sales_stages(
    funnel_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get all stages for a sales funnel"""
    # Verificar se o funil existe e pertence ao tenant
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    stages = session.exec(
        select(SalesStage).where(SalesStage.funnel_id == funnel_id).order_by(SalesStage.order)
    ).all()
    return stages


@router.put("/{funnel_id}/stages/{stage_id}", response_model=SalesStageResponse)
async def update_sales_stage(
    funnel_id: int,
    stage_id: int,
    stage_data: SalesStageCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Update a sales stage"""
    # Verificar se o funil existe e pertence ao tenant
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    stage = session.get(SalesStage, stage_id)
    if not stage or stage.funnel_id != funnel_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales stage not found"
        )
    
    # Se a ordem mudou, verificar se não conflita com outro estágio
    if stage_data.order != stage.order:
        existing_stage = session.exec(
            select(SalesStage).where(
                and_(
                    SalesStage.funnel_id == funnel_id,
                    SalesStage.order == stage_data.order,
                    SalesStage.id != stage_id
                )
            )
        ).first()
        
        if existing_stage:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stage with order {stage_data.order} already exists in this funnel"
            )
    
    # Atualizar campos
    for key, value in stage_data.dict().items():
        if key != "funnel_id":  # Não permitir mudar o funil
            setattr(stage, key, value)
    
    session.add(stage)
    session.commit()
    session.refresh(stage)
    return stage


@router.delete("/{funnel_id}/stages/{stage_id}")
async def delete_sales_stage(
    funnel_id: int,
    stage_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a sales stage"""
    # Verificar se o funil existe e pertence ao tenant
    funnel = session.get(SalesFunnel, funnel_id)
    if not funnel or funnel.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales funnel not found"
        )
    
    stage = session.get(SalesStage, stage_id)
    if not stage or stage.funnel_id != funnel_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sales stage not found"
        )
    
    # Verificar se há oportunidades neste estágio
    opportunities = session.exec(
        select(Opportunity).where(
            and_(
                Opportunity.stage_id == stage_id,
                Opportunity.tenant_id == current_user.tenant_id
            )
        )
    ).all()
    
    if opportunities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete stage with associated opportunities. Please reassign or delete opportunities first."
        )
    
    session.delete(stage)
    session.commit()
    return {"message": "Sales stage deleted successfully"}


@router.get("/default/funnel", response_model=Optional[SalesFunnelResponse])
async def get_default_funnel(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get the default sales funnel for the tenant"""
    funnel = session.exec(
        select(SalesFunnel).where(
            and_(
                SalesFunnel.tenant_id == current_user.tenant_id,
                SalesFunnel.is_default == True
            )
        )
    ).first()
    return funnel
