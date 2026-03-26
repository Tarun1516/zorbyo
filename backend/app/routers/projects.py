from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Any, List, Optional
from datetime import datetime, timedelta
import uuid

from ..core.database import get_db
from ..core.config import settings
from ..models.models import (
    Project,
    Application,
    ProjectTeam,
    TeamMember,
    User,
    ProjectStatus,
    ApplicationStatus,
)

router = APIRouter()


# Schemas
class ProjectCreate(BaseModel):
    title: str
    description: str
    domain: str
    budget: float
    company_info: Optional[str] = None
    deadline: Optional[datetime] = None


class ProjectResponse(BaseModel):
    id: str
    client_id: str
    client_name: Optional[str] = None
    title: str
    description: str
    domain: str
    budget: float
    status: str
    company_info: Optional[str] = None
    deadline: Optional[datetime] = None
    created_at: datetime
    proposals_count: int = 0

    class Config:
        from_attributes = True


class ApplicationCreate(BaseModel):
    bid_amount: float
    proposal: str


class ApplicationResponse(BaseModel):
    id: str
    project_id: str
    freelancer_id: str
    bid_amount: float
    proposal: str
    status: str
    applied_at: datetime

    class Config:
        from_attributes = True


class TeamMemberCreate(BaseModel):
    user_id: str
    allocated_budget: float
    role: str


# Middleware to check account lockout
def check_account_lockout(user_created_at: datetime):
    """Check if user account is within 72-hour lockout period"""
    if datetime.utcnow() - user_created_at < timedelta(hours=settings.LOCKOUT_HOURS):
        raise HTTPException(
            status_code=403,
            detail=f"Account under review. Please wait {settings.LOCKOUT_HOURS} hours.",
        )


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    domain: Optional[str] = None,
    min_budget: Optional[float] = None,
    max_budget: Optional[float] = None,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """List available projects with filters. Pass client_id to filter by client."""
    query = select(Project, User).outerjoin(User, User.id == Project.client_id)

    if domain:
        query = query.where(Project.domain == domain)
    if min_budget is not None:
        query = query.where(Project.budget >= min_budget)
    if max_budget is not None:
        query = query.where(Project.budget <= max_budget)
    if status:
        query = query.where(Project.status == status)
    if client_id:
        query = query.where(Project.client_id == client_id)

    query = query.order_by(Project.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    response = []
    for project, client_user in rows:
        # Count applications for this project
        app_count_result = await db.execute(
            select(func.count(Application.id)).where(
                Application.project_id == project.id
            )
        )
        app_count = app_count_result.scalar() or 0

        response.append(
            {
                "id": project.id,
                "client_id": project.client_id,
                "client_name": client_user.name if client_user else "Client",
                "title": project.title,
                "description": project.description or "",
                "domain": project.domain or "General",
                "budget": project.budget or 0,
                "status": project.status or "open",
                "company_info": project.company_info,
                "deadline": project.deadline,
                "created_at": project.created_at,
                "proposals_count": app_count,
            }
        )

    return response


@router.post("/", response_model=ProjectResponse)
async def create_project(
    project: ProjectCreate,
    client_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Create a new project (client only)"""
    # Ensure user exists
    user_result = await db.execute(select(User).where(User.id == client_id))
    user = user_result.scalar_one_or_none()
    if not user:
        user = User(
            id=client_id,
            email=f"{client_id}@zorbyo.local",
            name="Client",
        )
        db.add(user)
        await db.flush()

    new_project = Project(
        id=str(uuid.uuid4()),
        client_id=client_id,
        title=project.title,
        description=project.description,
        domain=project.domain,
        budget=project.budget,
        status="open",
        deadline=project.deadline,
    )
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)

    return {
        "id": new_project.id,
        "client_id": new_project.client_id,
        "client_name": user.name or "Client",
        "title": new_project.title,
        "description": new_project.description or "",
        "domain": new_project.domain or "General",
        "budget": new_project.budget or 0,
        "status": new_project.status or "open",
        "company_info": project.company_info,
        "deadline": new_project.deadline,
        "created_at": new_project.created_at,
        "proposals_count": 0,
    }


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Get project details"""
    result = await db.execute(
        select(Project, User)
        .outerjoin(User, User.id == Project.client_id)
        .where(Project.id == project_id)
    )
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    project, client_user = row

    app_count_result = await db.execute(
        select(func.count(Application.id)).where(Application.project_id == project.id)
    )
    app_count = app_count_result.scalar() or 0

    return {
        "id": project.id,
        "client_id": project.client_id,
        "client_name": client_user.name if client_user else "Client",
        "title": project.title,
        "description": project.description or "",
        "domain": project.domain or "General",
        "budget": project.budget or 0,
        "status": project.status or "open",
        "deadline": project.deadline,
        "created_at": project.created_at,
        "proposals_count": app_count,
    }


@router.post("/{project_id}/apply", response_model=ApplicationResponse)
async def apply_to_project(
    project_id: str,
    application: ApplicationCreate,
    freelancer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Apply to a project (freelancer only)"""
    # Verify project exists and is open
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.status != "open":
        raise HTTPException(
            status_code=400, detail="Project is not accepting applications"
        )

    # Check if already applied
    existing_app = await db.execute(
        select(Application).where(
            Application.project_id == project_id,
            Application.freelancer_id == freelancer_id,
        )
    )
    if existing_app.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="You have already applied to this project"
        )

    # Ensure user exists
    user_result = await db.execute(select(User).where(User.id == freelancer_id))
    user = user_result.scalar_one_or_none()
    if not user:
        user = User(
            id=freelancer_id,
            email=f"{freelancer_id}@zorbyo.local",
            name="Freelancer",
        )
        db.add(user)
        await db.flush()

    new_application = Application(
        id=str(uuid.uuid4()),
        project_id=project_id,
        freelancer_id=freelancer_id,
        bid_amount=application.bid_amount,
        proposal=application.proposal,
        status="pending",
    )
    db.add(new_application)
    await db.commit()
    await db.refresh(new_application)

    return {
        "id": new_application.id,
        "project_id": new_application.project_id,
        "freelancer_id": new_application.freelancer_id,
        "bid_amount": new_application.bid_amount,
        "proposal": new_application.proposal,
        "status": new_application.status,
        "applied_at": new_application.applied_at,
    }


@router.get("/my/applications", response_model=List[dict[str, Any]])
async def get_my_applications(freelancer_id: str, db: AsyncSession = Depends(get_db)):
    """Get all projects the freelancer has applied to"""
    result = await db.execute(
        select(Application, Project)
        .join(Project, Project.id == Application.project_id)
        .where(Application.freelancer_id == freelancer_id)
        .order_by(Application.applied_at.desc())
    )
    application_rows = result.all()

    if not application_rows:
        return []

    response = []
    for app, project in application_rows:
        response.append(
            {
                "application_id": app.id,
                "project_id": project.id,
                "client_id": project.client_id,
                "title": project.title,
                "description": project.description,
                "domain": project.domain,
                "budget": project.budget,
                "project_status": project.status,
                "deadline": project.deadline.isoformat() if project.deadline else None,
                "application_status": app.status,
                "bid_amount": app.bid_amount,
                "proposal": app.proposal,
                "applied_at": app.applied_at.isoformat() if app.applied_at else None,
            }
        )

    return response


@router.get("/{project_id}/applications", response_model=List[ApplicationResponse])
async def get_project_applications(project_id: str, db: AsyncSession = Depends(get_db)):
    """Get all applications for a project"""
    result = await db.execute(
        select(Application)
        .where(Application.project_id == project_id)
        .order_by(Application.applied_at.desc())
    )
    applications = result.scalars().all()

    return [
        {
            "id": app.id,
            "project_id": app.project_id,
            "freelancer_id": app.freelancer_id,
            "bid_amount": app.bid_amount,
            "proposal": app.proposal,
            "status": app.status,
            "applied_at": app.applied_at,
        }
        for app in applications
    ]


@router.put("/{project_id}/hire/{application_id}")
async def hire_freelancer(
    project_id: str, application_id: str, db: AsyncSession = Depends(get_db)
):
    """Hire a freelancer for a project"""
    return {
        "message": "Freelancer hired",
        "project_id": project_id,
        "application_id": application_id,
    }


@router.post("/{project_id}/team")
async def add_team_member(
    project_id: str,
    member: TeamMemberCreate,
    lead_freelancer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Add team member to project (lead freelancer only)"""
    return {
        "message": "Team member added",
        "project_id": project_id,
        "member_id": member.user_id,
    }


@router.put("/{project_id}/submit")
async def submit_project(
    project_id: str,
    submission_url: str,
    submission_type: str,
    freelancer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Submit project work"""
    return {
        "message": "Project submitted",
        "project_id": project_id,
        "submission_url": submission_url,
    }


@router.put("/{project_id}/approve")
async def approve_project(
    project_id: str, client_id: str, db: AsyncSession = Depends(get_db)
):
    """Approve project completion and release payment"""
    return {"message": "Project approved", "project_id": project_id}


@router.get("/{project_id}/applicants", response_model=List[dict[str, Any]])
async def get_project_applicants(
    project_id: str, client_id: str, db: AsyncSession = Depends(get_db)
):
    """Get all applicants for a project (client view)"""
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.client_id == client_id,
        )
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    result = await db.execute(
        select(Application, User)
        .outerjoin(User, User.id == Application.freelancer_id)
        .where(Application.project_id == project_id)
        .order_by(Application.applied_at.desc())
    )
    applicant_rows = result.all()

    response = []
    for app, freelancer in applicant_rows:
        response.append(
            {
                "id": app.id,
                "project_id": app.project_id,
                "freelancer_id": app.freelancer_id,
                "freelancer_name": freelancer.name if freelancer else None,
                "freelancer_email": freelancer.email if freelancer else None,
                "bid_amount": app.bid_amount,
                "proposal": app.proposal,
                "status": app.status,
                "applied_at": app.applied_at.isoformat(),
            }
        )

    return response


@router.put("/{project_id}/approve/{application_id}")
async def approve_applicant(
    project_id: str,
    application_id: str,
    client_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Approve an applicant for a project (client only)"""
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.client_id == client_id,
        )
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    project_status = getattr(project, "status", None)
    if project_status == ProjectStatus.IN_PROGRESS.value:
        raise HTTPException(
            status_code=400,
            detail="Project already has an approved applicant",
        )

    app_result = await db.execute(
        select(Application).where(
            Application.id == application_id,
            Application.project_id == project_id,
        )
    )
    application = app_result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    application_status = getattr(application, "status", None)
    if application_status == ApplicationStatus.REJECTED.value:
        raise HTTPException(
            status_code=400,
            detail="Rejected application cannot be approved",
        )

    setattr(application, "status", ApplicationStatus.ACCEPTED.value)

    other_apps = await db.execute(
        select(Application).where(
            Application.project_id == project_id,
            Application.id != application_id,
            Application.status != ApplicationStatus.REJECTED.value,
        )
    )
    for other_app in other_apps.scalars().all():
        setattr(other_app, "status", ApplicationStatus.REJECTED.value)

    setattr(project, "status", ProjectStatus.IN_PROGRESS.value)

    existing_team_result = await db.execute(
        select(ProjectTeam).where(ProjectTeam.project_id == project_id)
    )
    existing_team = existing_team_result.scalar_one_or_none()
    if not existing_team:
        team = ProjectTeam(
            id=str(uuid.uuid4()),
            project_id=project_id,
            lead_freelancer_id=application.freelancer_id,
            created_at=datetime.utcnow(),
        )
        db.add(team)
    elif getattr(existing_team, "lead_freelancer_id", None) != getattr(
        application, "freelancer_id", None
    ):
        raise HTTPException(
            status_code=400,
            detail="Project team already exists with a different lead freelancer",
        )

    await db.commit()

    return {
        "message": "Applicant approved",
        "project_id": project_id,
        "application_id": application_id,
        "freelancer_id": application.freelancer_id,
        "project_status": ProjectStatus.IN_PROGRESS.value,
    }
