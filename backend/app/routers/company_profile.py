from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models import CompanyProfile, CompanyProfileCreate, CompanyProfileResponse, User
from app.dependencies import get_current_active_user

router = APIRouter()


@router.post("", response_model=CompanyProfileResponse)
async def create_or_update_profile(
    profile_data: CompanyProfileCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Create or update company profile for the current tenant"""
    existing_profile = session.exec(
        select(CompanyProfile).where(CompanyProfile.tenant_id == current_user.tenant_id)
    ).first()
    
    if existing_profile:
        # Update existing profile
        for key, value in profile_data.dict(exclude_unset=True).items():
            setattr(existing_profile, key, value)
        session.add(existing_profile)
        session.commit()
        session.refresh(existing_profile)
        return CompanyProfileResponse(
            id=existing_profile.id,
            tenant_id=existing_profile.tenant_id,
            industry=existing_profile.industry,
            company_size=existing_profile.company_size,
            icp_description=existing_profile.icp_description,
            target_market=existing_profile.target_market,
        )
    else:
        # Create new profile
        profile = CompanyProfile(
            **profile_data.dict(),
            tenant_id=current_user.tenant_id
        )
        session.add(profile)
        session.commit()
        session.refresh(profile)
        return CompanyProfileResponse(
            id=profile.id,
            tenant_id=profile.tenant_id,
            industry=profile.industry,
            company_size=profile.company_size,
            icp_description=profile.icp_description,
            target_market=profile.target_market,
        )


@router.get("", response_model=CompanyProfileResponse)
async def get_profile(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Get company profile for the current tenant"""
    profile = session.exec(
        select(CompanyProfile).where(CompanyProfile.tenant_id == current_user.tenant_id)
    ).first()
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company profile not found"
        )
    
    return CompanyProfileResponse(
        id=profile.id,
        tenant_id=profile.tenant_id,
        industry=profile.industry,
        company_size=profile.company_size,
        icp_description=profile.icp_description,
        target_market=profile.target_market,
    )







