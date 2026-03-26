from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.models.models import (
    User,
    Profile,
    Certificate,
    QuizResult,
    PracticeDomainLevel,
)

router = APIRouter()


# Schemas
class ProfileResponse(BaseModel):
    user_id: str
    name: Optional[str]
    email: str
    user_type: Optional[str]
    bio: Optional[str]
    skills: Optional[List[str]]
    college_name: Optional[str]
    kyc_verified: bool
    verified: bool
    level: int
    xp: int
    avatar_url: Optional[str]
    github_url: Optional[str]
    portfolio_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    skills: Optional[List[str]] = None
    college_name: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None


class CertificateResponse(BaseModel):
    id: str
    course_id: str
    course_title: str
    issued_at: datetime
    certificate_url: str
    certificate_number: str

    class Config:
        from_attributes = True


class StatsResponse(BaseModel):
    user_id: str
    level: int
    xp: int
    xp_for_next_level: int
    certificates_count: int
    projects_completed: int
    bugs_found: int
    tests_completed: int
    total_earnings: float


@router.get("/{user_id}", response_model=ProfileResponse)
async def get_profile(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get user profile"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile_result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = profile_result.scalar_one_or_none()

    return {
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "user_type": user.user_type,
        "bio": profile.bio if profile else None,
        "skills": profile.skills if profile else [],
        "college_name": profile.college_name if profile else None,
        "kyc_verified": profile.kyc_verified if profile else False,
        "verified": user.verified,
        "level": user.level or 1,
        "xp": user.xp or 0,
        "avatar_url": profile.avatar_url if profile else None,
        "github_url": profile.github_url if profile else None,
        "portfolio_url": profile.portfolio_url if profile else None,
        "created_at": user.created_at,
    }


@router.put("/{user_id}")
async def update_profile(
    user_id: str, profile: ProfileUpdate, db: AsyncSession = Depends(get_db)
):
    """Update user profile"""
    # TODO: Implement with actual database update
    return {"message": "Profile updated", "user_id": user_id}


@router.get("/{user_id}/certificates", response_model=List[CertificateResponse])
async def get_certificates(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get certificates earned by user"""
    # TODO: Implement with actual database query
    return [
        {
            "id": "cert_1",
            "course_id": "course_1",
            "course_title": "Introduction to Data Science",
            "issued_at": datetime(2026, 3, 1),
            "certificate_url": "https://storage.zorbyo.com/certificates/cert_1.pdf",
            "certificate_number": "ZORBYO-ABC12345",
        }
    ]


@router.get("/{user_id}/stats", response_model=StatsResponse)
async def get_stats(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get user statistics"""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cert_count_result = await db.execute(
        select(func.count(Certificate.id)).where(Certificate.user_id == user_id)
    )
    cert_count = cert_count_result.scalar() or 0

    tests_count_result = await db.execute(
        select(func.count(QuizResult.id)).where(QuizResult.user_id == user_id)
    )
    tests_count = tests_count_result.scalar() or 0

    level = user.level or 1
    xp = user.xp or 0
    xp_for_next = level * 500

    return {
        "user_id": user_id,
        "level": level,
        "xp": xp,
        "xp_for_next_level": xp_for_next,
        "certificates_count": cert_count,
        "projects_completed": 0,
        "bugs_found": 0,
        "tests_completed": tests_count,
        "total_earnings": 0.0,
    }


@router.get("/{user_id}/projects")
async def get_user_projects(
    user_id: str,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Get projects associated with user"""
    # TODO: Implement with actual database query
    # For freelancers: projects they applied to or worked on
    # For clients: projects they created
    return {"projects": [], "total": 0}


@router.post("/{user_id}/avatar")
async def upload_avatar(
    user_id: str, avatar_url: str, db: AsyncSession = Depends(get_db)
):
    """Upload user avatar"""
    # TODO: Implement file upload to MinIO
    # 1. Validate file type and size
    # 2. Upload to MinIO
    # 3. Update profile with new URL

    return {"message": "Avatar uploaded", "avatar_url": avatar_url}


@router.get("/{user_id}/activity")
async def get_activity(
    user_id: str, skip: int = 0, limit: int = 20, db: AsyncSession = Depends(get_db)
):
    """Get user activity feed"""
    # TODO: Implement activity feed
    # Include: project completions, certificates earned, bug reports, etc.
    return {"activities": [], "total": 0}
