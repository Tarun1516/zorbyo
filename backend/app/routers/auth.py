from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.models.models import User

router = APIRouter()

SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_SERVICE_KEY = settings.SUPABASE_SERVICE_ROLE_KEY


# Schemas
class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    user_type: Optional[str]
    verified: bool
    level: int
    xp: int
    created_at: datetime

    class Config:
        from_attributes = True


class UserTypeUpdate(BaseModel):
    user_type: str


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


async def get_supabase_user(access_token: str) -> dict:
    """Verify token with Supabase and return user data."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "apikey": settings.SUPABASE_ANON_KEY,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        return resp.json()


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency: verify Supabase JWT and return DB user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )

    token = authorization.split(" ", 1)[1]
    supabase_user = await get_supabase_user(token)
    supabase_id = supabase_user["id"]

    # Find or create user in our database
    result = await db.execute(select(User).where(User.id == supabase_id))
    db_user = result.scalar_one_or_none()

    if not db_user:
        # Auto-create user on first login
        db_user = User(
            id=supabase_id,
            email=supabase_user.get("email", ""),
            name=supabase_user.get("user_metadata", {}).get("full_name")
            or supabase_user.get("user_metadata", {}).get("name")
            or supabase_user.get("email", "").split("@")[0],
            user_type="student",
            verified=supabase_user.get("email_confirmed_at") is not None,
            level=1,
            xp=0,
            created_at=datetime.utcnow(),
        )
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)

    return db_user


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user."""
    return current_user


@router.post("/select-type")
async def select_user_type(
    user_type: UserTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Select user type after authentication."""
    if user_type.user_type not in ("student", "freelancer", "client", "investor"):
        raise HTTPException(status_code=400, detail="Invalid user type")

    current_user.user_type = user_type.user_type
    await db.commit()
    return {"message": "User type updated", "user_type": user_type.user_type}


@router.post("/verify-student")
async def verify_student(
    email: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify student with educational email."""
    if not (email.endswith(".edu.in") or email.endswith(".ac.in")):
        raise HTTPException(
            status_code=400, detail="Students must use .edu.in or .ac.in email"
        )

    current_user.verified = True
    await db.commit()
    return {"message": "Verification submitted", "status": "verified"}


@router.post("/refresh")
async def refresh_token(refresh_token: str):
    """Refresh access token via Supabase."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
            json={"refresh_token": refresh_token},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )
        data = resp.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
        }


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout (Supabase handles token invalidation on client side)."""
    return {"message": "Logged out successfully"}
