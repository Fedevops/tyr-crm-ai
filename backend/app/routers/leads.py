from typing import List, Optional
import csv
import io
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import Response, JSONResponse
from sqlmodel import Session, select, or_, and_, func
from app.database import get_session
from app.models import (
    Lead, LeadCreate, LeadResponse, LeadStatus, User,
    LeadComment, LeadCommentCreate, LeadCommentResponse
)
from app.dependencies import get_current_active_user

router = APIRouter()


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
    """Get all leads for the current tenant with filters"""
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


@router.post("/import-csv")
async def import_leads_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Import leads from CSV file"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV file"
        )
    
    try:
        # Read file content
        contents = await file.read()
        csv_content = contents.decode('utf-8-sig')  # Handle BOM if present
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        
        imported = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 (row 1 is header)
            try:
                # Map CSV columns to Lead fields
                # Handle different possible column names
                name = row.get('Nome') or row.get('nome') or row.get('Name') or row.get('name') or ''
                company_raw = row.get('Empresa') or row.get('empresa') or row.get('Company') or row.get('company') or ''
                position_raw = row.get('Cargo') or row.get('cargo') or row.get('Position') or row.get('position') or row.get('Role') or row.get('role') or ''
                linkedin = row.get('Linkedin') or row.get('linkedin') or row.get('LinkedIn') or row.get('linkedin_url') or None
                first_contact = row.get('Data 1o contato') or row.get('Data 1º contato') or row.get('data_1o_contato') or row.get('First Contact') or row.get('first_contact') or None
                status_str = row.get('Status') or row.get('status') or 'new'
                next_action = row.get('Próxima ação') or row.get('Próxima acao') or row.get('proxima_acao') or row.get('Next Action') or row.get('next_action') or None
                notes = row.get('Observação') or row.get('Observacao') or row.get('observacao') or row.get('Observation') or row.get('observation') or row.get('Notes') or row.get('notes') or None
                
                # Smart detection: if Empresa looks like a role (CEO, CTO, etc) and Cargo looks like a company, swap them
                role_keywords = ['ceo', 'cto', 'cfo', 'founder', 'co-founder', 'director', 'manager', 'head', 'lead', 'senior', 'junior', 'analyst', 'specialist']
                company_raw_clean = company_raw.strip() if company_raw else ''
                position_raw_clean = position_raw.strip() if position_raw else ''
                
                company = company_raw_clean if company_raw_clean else None
                position = position_raw_clean if position_raw_clean else None
                
                # Check if they might be swapped
                if company and position:
                    company_lower = company.lower()
                    position_lower = position.lower()
                    
                    # If "Empresa" contains role keywords and "Cargo" doesn't, they're likely swapped
                    company_has_role = any(keyword in company_lower for keyword in role_keywords)
                    position_has_role = any(keyword in position_lower for keyword in role_keywords)
                    
                    if company_has_role and not position_has_role:
                        # Swap them
                        company, position = position, company
                
                # Skip empty rows
                if not name.strip():
                    continue
                
                # Parse status
                status_map = {
                    'lead novo': LeadStatus.NEW,
                    'novo': LeadStatus.NEW,
                    'new': LeadStatus.NEW,
                    'contatado': LeadStatus.CONTACTED,
                    'contacted': LeadStatus.CONTACTED,
                    'qualificado': LeadStatus.QUALIFIED,
                    'qualified': LeadStatus.QUALIFIED,
                    'reunião agendada': LeadStatus.MEETING_SCHEDULED,
                    'meeting scheduled': LeadStatus.MEETING_SCHEDULED,
                    'proposta enviada': LeadStatus.PROPOSAL_SENT,
                    'proposal sent': LeadStatus.PROPOSAL_SENT,
                    'negociação': LeadStatus.NEGOTIATION,
                    'negotiation': LeadStatus.NEGOTIATION,
                    'ganho': LeadStatus.WON,
                    'won': LeadStatus.WON,
                    'perdido': LeadStatus.LOST,
                    'lost': LeadStatus.LOST,
                    'nutrição': LeadStatus.NURTURING,
                    'nurturing': LeadStatus.NURTURING,
                }
                lead_status = status_map.get(status_str.lower(), LeadStatus.NEW)
                
                # Parse first contact date
                last_contact = None
                if first_contact:
                    try:
                        # Try different date formats
                        for date_format in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d']:
                            try:
                                last_contact = datetime.strptime(first_contact.strip(), date_format)
                                break
                            except ValueError:
                                continue
                    except Exception:
                        pass
                
                # Add next action to notes if provided
                full_notes = notes or ''
                if next_action:
                    if full_notes:
                        full_notes += f'\n\nPróxima ação: {next_action}'
                    else:
                        full_notes = f'Próxima ação: {next_action}'
                
                # Check if lead already exists (by email or name+company)
                existing_lead = None
                if company:
                    existing_query = select(Lead).where(
                        and_(
                            Lead.tenant_id == current_user.tenant_id,
                            Lead.name == name,
                            Lead.company == company
                        )
                    )
                    existing_lead = session.exec(existing_query).first()
                
                if existing_lead:
                    # Update existing lead
                    existing_lead.position = position or existing_lead.position
                    existing_lead.linkedin_url = linkedin or existing_lead.linkedin_url
                    existing_lead.status = lead_status
                    existing_lead.notes = full_notes or existing_lead.notes
                    if last_contact:
                        existing_lead.last_contact = last_contact
                    existing_lead.updated_at = datetime.utcnow()
                    session.add(existing_lead)
                else:
                    # Create new lead
                    lead = Lead(
                        tenant_id=current_user.tenant_id,
                        name=name,
                        company=company,
                        position=position,
                        linkedin_url=linkedin,
                        status=lead_status,
                        notes=full_notes,
                        last_contact=last_contact,
                        source='CSV Import'
                    )
                    session.add(lead)
                
                imported += 1
                
            except Exception as e:
                errors.append(f"Linha {row_num}: {str(e)}")
                continue
        
        session.commit()
        
        return {
            "message": f"Importação concluída",
            "imported": imported,
            "errors": errors if errors else None
        }
        
    except Exception as e:
        session.rollback()
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

