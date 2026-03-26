from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
import hmac
import hashlib

from app.core.database import get_db
from app.core.config import settings
from app.models.models import Payment, PaymentStatus, User

router = APIRouter()


# Schemas
class PaymentCreate(BaseModel):
    project_id: str
    amount: float
    milestone_index: int = 1


class PaymentResponse(BaseModel):
    id: str
    project_id: str
    payer_id: str
    payee_id: str
    amount: float
    platform_fee: float
    razorpay_fee: float
    status: str
    razorpay_order_id: Optional[str]
    milestone_index: int
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PayoutRequest(BaseModel):
    payment_id: str
    amount: float
    upi_id: str


def calculate_fees(amount: float, is_student: bool = False):
    """Calculate platform and Razorpay fees"""
    # Platform fee: 3% for students, 5% for freelancers
    platform_fee_percentage = (
        settings.STUDENT_FEE_PERCENTAGE
        if is_student
        else settings.FREELANCER_FEE_PERCENTAGE
    )
    platform_fee = amount * (platform_fee_percentage / 100)

    # Razorpay fee: ~2% (simplified)
    razorpay_fee = amount * 0.02

    # Net amount to freelancer
    net_amount = amount - platform_fee - razorpay_fee

    return {
        "gross_amount": amount,
        "platform_fee": round(platform_fee, 2),
        "razorpay_fee": round(razorpay_fee, 2),
        "net_amount": round(net_amount, 2),
    }


@router.post("/create-order")
async def create_payment_order(
    payment: PaymentCreate, payer_id: str, db: AsyncSession = Depends(get_db)
):
    """Create Razorpay order for payment"""
    # TODO: Implement Razorpay order creation
    # 1. Validate project and amount
    # 2. Create order in Razorpay
    # 3. Save order in database

    # Calculate fees
    fees = calculate_fees(payment.amount)

    return {
        "order_id": f"order_{uuid.uuid4().hex[:16]}",
        "amount": payment.amount,
        "currency": "INR",
        "fees": fees,
    }


@router.post("/verify")
async def verify_payment(
    verification: PaymentVerify, db: AsyncSession = Depends(get_db)
):
    """Verify Razorpay payment signature"""
    # TODO: Implement signature verification
    # 1. Generate signature using key_secret
    # 2. Compare with received signature
    # 3. Update payment status

    # Signature verification logic
    # generated_signature = hmac.new(
    #     settings.RAZORPAY_KEY_SECRET.encode(),
    #     f"{verification.razorpay_order_id}|{verification.razorpay_payment_id}".encode(),
    #     hashlib.sha256
    # ).hexdigest()

    # if generated_signature != verification.razorpay_signature:
    #     raise HTTPException(status_code=400, detail="Invalid signature")

    return {
        "verified": True,
        "payment_id": verification.razorpay_payment_id,
        "status": "captured",
    }


@router.post("/release-milestone")
async def release_milestone(payment_id: str, db: AsyncSession = Depends(get_db)):
    """Release milestone payment to freelancer"""
    # TODO: Implement payout release
    # 1. Verify payment is in escrow
    # 2. Calculate net amount after fees
    # 3. Initiate Razorpay payout
    # 4. Update payment status

    return {
        "message": "Milestone payment released",
        "payment_id": payment_id,
        "status": "released",
    }


@router.get("/history")
async def get_payment_history(
    user_id: str, skip: int = 0, limit: int = 20, db: AsyncSession = Depends(get_db)
):
    """Get payment history for a user"""
    # TODO: Implement with actual database query
    return {"payments": [], "total": 0}


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(payment_id: str, db: AsyncSession = Depends(get_db)):
    """Get payment details"""
    # TODO: Implement with actual database query
    return {
        "id": payment_id,
        "project_id": "project_1",
        "payer_id": "payer_1",
        "payee_id": "payee_1",
        "amount": 10000,
        "platform_fee": 500,
        "razorpay_fee": 200,
        "status": "escrow",
        "razorpay_order_id": "order_123",
        "milestone_index": 1,
        "created_at": datetime.utcnow(),
    }


@router.post("/webhook")
async def razorpay_webhook(payload: dict, db: AsyncSession = Depends(get_db)):
    """Handle Razorpay webhooks"""
    # TODO: Implement webhook handling
    # 1. Verify webhook signature
    # 2. Process different event types
    # 3. Update payment status

    event = payload.get("event")

    if event == "payment.captured":
        # Payment successful
        pass
    elif event == "payment.failed":
        # Payment failed
        pass
    elif event == "refund.created":
        # Refund initiated
        pass

    return {"status": "ok"}


@router.get("/invoice/{payment_id}")
async def generate_invoice(payment_id: str, db: AsyncSession = Depends(get_db)):
    """Generate invoice for a payment"""
    # TODO: Implement invoice generation
    # 1. Get payment details
    # 2. Get project details
    # 3. Generate PDF invoice
    # 4. Upload to MinIO
    # 5. Return download URL

    return {
        "invoice_url": f"https://storage.zorbyo.com/invoices/{payment_id}.pdf",
        "invoice_number": f"INV-{uuid.uuid4().hex[:8].upper()}",
    }
