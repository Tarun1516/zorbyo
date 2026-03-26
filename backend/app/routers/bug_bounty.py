from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import uuid

from app.core.database import get_db
from app.models.models import BugBounty, BugReport, BugReportStatus

router = APIRouter()


# Schemas
class BountyCreate(BaseModel):
    application_name: str
    description: str
    scope: str
    reward_amount: float
    deadline: datetime


class BountyResponse(BaseModel):
    id: str
    client_id: str
    application_name: str
    description: str
    scope: str
    reward_amount: float
    deadline: datetime
    status: str
    reports_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class BugReportCreate(BaseModel):
    vulnerability_type: str
    severity: str  # low, medium, high, critical
    steps_to_reproduce: str


class BugReportResponse(BaseModel):
    id: str
    bounty_id: str
    reporter_id: str
    vulnerability_type: str
    severity: str
    steps_to_reproduce: str
    proof_urls: List[str]
    status: str
    submitted_at: datetime

    class Config:
        from_attributes = True


class ReportVerification(BaseModel):
    status: str  # verified, rejected
    feedback: Optional[str] = None


@router.get("/", response_model=List[BountyResponse])
async def list_bounties(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """List bug bounties"""
    # TODO: Implement with actual database query
    return [
        {
            "id": "1",
            "client_id": "client_1",
            "application_name": "SecureBank App",
            "description": "Web application security testing",
            "scope": "Web Application",
            "reward_amount": 15000,
            "deadline": datetime.utcnow() + timedelta(days=30),
            "status": "active",
            "reports_count": 5,
            "created_at": datetime.utcnow(),
        }
    ]


@router.post("/", response_model=BountyResponse)
async def create_bounty(
    bounty: BountyCreate, client_id: str, db: AsyncSession = Depends(get_db)
):
    """Create a new bug bounty"""
    # TODO: Implement with actual database insert
    return {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "application_name": bounty.application_name,
        "description": bounty.description,
        "scope": bounty.scope,
        "reward_amount": bounty.reward_amount,
        "deadline": bounty.deadline,
        "status": "active",
        "reports_count": 0,
        "created_at": datetime.utcnow(),
    }


@router.get("/{bounty_id}", response_model=BountyResponse)
async def get_bounty(bounty_id: str, db: AsyncSession = Depends(get_db)):
    """Get bounty details"""
    # TODO: Implement with actual database query
    return {
        "id": bounty_id,
        "client_id": "client_1",
        "application_name": "SecureBank App",
        "description": "Web application security testing",
        "scope": "Web Application",
        "reward_amount": 15000,
        "deadline": datetime.utcnow() + timedelta(days=30),
        "status": "active",
        "reports_count": 5,
        "created_at": datetime.utcnow(),
    }


@router.post("/{bounty_id}/report", response_model=BugReportResponse)
async def submit_bug_report(
    bounty_id: str,
    report: BugReportCreate,
    reporter_id: str,
    proof_files: List[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    """Submit a bug report"""
    # TODO: Implement with actual database insert
    # 1. Upload proof files to MinIO
    # 2. Save report to database
    # 3. Notify bounty owner

    proof_urls = []
    if proof_files:
        # TODO: Upload to MinIO and get URLs
        pass

    return {
        "id": str(uuid.uuid4()),
        "bounty_id": bounty_id,
        "reporter_id": reporter_id,
        "vulnerability_type": report.vulnerability_type,
        "severity": report.severity,
        "steps_to_reproduce": report.steps_to_reproduce,
        "proof_urls": proof_urls,
        "status": "pending",
        "submitted_at": datetime.utcnow(),
    }


@router.get("/{bounty_id}/reports", response_model=List[BugReportResponse])
async def get_bounty_reports(
    bounty_id: str, status: Optional[str] = None, db: AsyncSession = Depends(get_db)
):
    """Get all reports for a bounty"""
    # TODO: Implement with actual database query
    return []


@router.get("/reports/{report_id}", response_model=BugReportResponse)
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    """Get report details"""
    # TODO: Implement with actual database query
    return {
        "id": report_id,
        "bounty_id": "bounty_1",
        "reporter_id": "reporter_1",
        "vulnerability_type": "SQL Injection",
        "severity": "high",
        "steps_to_reproduce": "Steps...",
        "proof_urls": [],
        "status": "pending",
        "submitted_at": datetime.utcnow(),
    }


@router.put("/reports/{report_id}/verify")
async def verify_report(
    report_id: str,
    verification: ReportVerification,
    verifier_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Verify or reject a bug report"""
    # TODO: Implement verification logic
    # 1. Update report status
    # 2. If verified, trigger payment
    # 3. Notify reporter

    return {
        "message": f"Report {verification.status}",
        "report_id": report_id,
        "status": verification.status,
    }


@router.post("/reports/{report_id}/pay")
async def pay_for_report(report_id: str, db: AsyncSession = Depends(get_db)):
    """Pay reward for verified bug report"""
    # TODO: Implement payment logic
    # 1. Verify report is verified
    # 2. Calculate reward amount
    # 3. Process payment to reporter
    # 4. Update report status to paid

    return {"message": "Payment processed", "report_id": report_id, "status": "paid"}
