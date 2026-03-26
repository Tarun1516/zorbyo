from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.models.models import User, Profile

router = APIRouter()


# Schemas
class UserBase(BaseModel):
    email: str
    name: Optional[str] = None
    user_type: Optional[str] = None


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    skills: Optional[List[str]] = None


class UserResponse(UserBase):
    id: str
    verified: bool
    level: int
    xp: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileResponse(BaseModel):
    user_id: str
    name: Optional[str]
    bio: Optional[str]
    skills: Optional[List[str]]
    college_name: Optional[str]
    kyc_verified: bool
    avatar_url: Optional[str]
    github_url: Optional[str]
    portfolio_url: Optional[str]

    class Config:
        from_attributes = True


@router.get("/", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 20,
    user_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List users with optional filters"""
    query = select(User)

    if user_type:
        query = query.where(User.user_type == user_type)

    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            user_type=user.user_type,
            verified=user.verified,
            level=user.level,
            xp=user.xp,
            created_at=user.created_at,
        )
        for user in users
    ]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get user by ID"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "user_type": user.user_type,
        "verified": user.verified,
        "level": user.level or 1,
        "xp": user.xp or 0,
        "created_at": user.created_at,
    }


@router.put("/{user_id}")
async def update_user(
    user_id: str, user_update: UserUpdate, db: AsyncSession = Depends(get_db)
):
    """Update user profile"""
    # TODO: Implement with actual database update
    return {"message": "User updated", "user_id": user_id}


@router.get("/{user_id}/profile", response_model=ProfileResponse)
async def get_user_profile(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get user profile"""
    profile_result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = profile_result.scalar_one_or_none()

    if not profile:
        return {
            "user_id": user_id,
            "name": None,
            "bio": None,
            "skills": [],
            "college_name": None,
            "kyc_verified": False,
            "avatar_url": None,
            "github_url": None,
            "portfolio_url": None,
        }

    return {
        "user_id": user_id,
        "name": profile.name,
        "bio": profile.bio,
        "skills": profile.skills or [],
        "college_name": profile.college_name,
        "kyc_verified": profile.kyc_verified,
        "avatar_url": profile.avatar_url,
        "github_url": profile.github_url,
        "portfolio_url": profile.portfolio_url,
    }


@router.get("/{user_id}/stats")
async def get_user_stats(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get user statistics"""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_id": user_id,
        "certificates_count": 0,
        "projects_completed": 0,
        "bugs_found": 0,
        "tests_completed": 0,
        "total_xp": user.xp or 0,
        "level": user.level or 1,
    }
