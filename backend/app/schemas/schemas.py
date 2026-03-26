# ZORBYO Schemas - Pydantic Models for API Request/Response

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

# ==================== Auth Schemas ====================


class TokenType(str, Enum):
    BEARER = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: TokenType = TokenType.BEARER
    expires_in: int


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class OAuthCallback(BaseModel):
    code: str
    state: Optional[str] = None


class UserTypeSelection(BaseModel):
    user_type: str = Field(..., pattern="^(student|freelancer|client|investor)$")


# ==================== User Schemas ====================


class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None


class UserCreate(UserBase):
    provider: str
    provider_id: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    skills: Optional[List[str]] = None


class UserResponse(UserBase):
    id: str
    user_type: Optional[str] = None
    verified: bool = False
    level: int = 1
    xp: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Profile Schemas ====================


class ProfileBase(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    skills: Optional[List[str]] = None


class ProfileUpdate(ProfileBase):
    college_name: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None


class ProfileResponse(ProfileBase):
    user_id: str
    college_name: Optional[str] = None
    kyc_verified: bool = False
    avatar_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None

    class Config:
        from_attributes = True


class StudentVerification(BaseModel):
    email: EmailStr
    id_card_image: str  # Base64 encoded


# ==================== Course Schemas ====================


class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None
    domain: Optional[str] = None


class CourseCreate(CourseBase):
    pass


class CourseResponse(CourseBase):
    id: str
    thumbnail_url: Optional[str] = None
    chapters: int = 0
    duration_hours: float = 0
    created_at: datetime

    class Config:
        from_attributes = True


class ChapterBase(BaseModel):
    title: str
    chapter_index: int
    duration_seconds: int


class ChapterResponse(ChapterBase):
    id: str
    course_id: str
    video_url: str

    class Config:
        from_attributes = True


class ProgressUpdate(BaseModel):
    chapter_index: int
    video_timestamp: float = Field(..., ge=0)


class ProgressResponse(BaseModel):
    user_id: str
    course_id: str
    chapter_index: int
    video_timestamp: float
    completed: bool = False
    last_updated: datetime

    class Config:
        from_attributes = True


# ==================== Quiz Schemas ====================


class QuizQuestion(BaseModel):
    question: str
    options: List[str] = Field(..., min_length=4, max_length=4)
    correct_answer: int = Field(..., ge=0, le=3)


class QuizGenerate(BaseModel):
    course_id: str
    chapter_index: int


class QuizResponse(BaseModel):
    id: str
    course_id: str
    chapter_index: int
    questions: List[QuizQuestion]

    class Config:
        from_attributes = True


class QuizSubmission(BaseModel):
    quiz_id: str
    answers: List[int]


class QuizResultResponse(BaseModel):
    id: str
    quiz_id: str
    user_id: str
    score: int
    total_questions: int
    passed: bool
    completed_at: datetime

    class Config:
        from_attributes = True


# ==================== Certificate Schemas ====================


class CertificateResponse(BaseModel):
    id: str
    user_id: str
    course_id: str
    course_title: str
    issued_at: datetime
    certificate_url: str
    certificate_number: str

    class Config:
        from_attributes = True


# ==================== Project Schemas ====================


class ProjectBase(BaseModel):
    title: str
    description: str
    domain: str
    budget: float = Field(..., gt=0)
    deadline: datetime


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    deadline: Optional[datetime] = None


class ProjectResponse(ProjectBase):
    id: str
    client_id: str
    status: str = "open"
    created_at: datetime
    proposals_count: int = 0

    class Config:
        from_attributes = True


# ==================== Application Schemas ====================


class ApplicationBase(BaseModel):
    bid_amount: float = Field(..., ge=0)
    proposal: str


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationResponse(ApplicationBase):
    id: str
    project_id: str
    freelancer_id: str
    status: str = "pending"
    applied_at: datetime

    class Config:
        from_attributes = True


# ==================== Team Schemas ====================


class TeamMemberCreate(BaseModel):
    user_id: str
    allocated_budget: float = Field(..., gt=0)
    role: str


class TeamMemberResponse(BaseModel):
    id: str
    team_id: str
    user_id: str
    user_name: str
    allocated_budget: float
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class TeamResponse(BaseModel):
    id: str
    project_id: str
    lead_freelancer_id: str
    members: List[TeamMemberResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Payment Schemas ====================


class PaymentCreate(BaseModel):
    project_id: str
    amount: float = Field(..., gt=0)
    milestone_index: int = 1


class PaymentResponse(BaseModel):
    id: str
    project_id: str
    payer_id: str
    payee_id: str
    amount: float
    platform_fee: float
    razorpay_fee: float
    net_amount: float
    status: str
    milestone_index: int
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class InvoiceResponse(BaseModel):
    invoice_number: str
    invoice_url: str
    project_title: str
    amount: float
    platform_fee: float
    razorpay_fee: float
    net_amount: float
    issued_at: datetime


# ==================== Bug Bounty Schemas ====================


class BountyBase(BaseModel):
    application_name: str
    description: str
    scope: str
    reward_amount: float = Field(..., gt=0)
    deadline: datetime


class BountyCreate(BountyBase):
    pass


class BountyResponse(BountyBase):
    id: str
    client_id: str
    status: str = "active"
    reports_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class BugReportBase(BaseModel):
    vulnerability_type: str
    severity: str = Field(..., pattern="^(low|medium|high|critical)$")
    steps_to_reproduce: str


class BugReportCreate(BugReportBase):
    proof_urls: List[str] = []


class BugReportResponse(BugReportBase):
    id: str
    bounty_id: str
    reporter_id: str
    proof_urls: List[str] = []
    status: str = "pending"
    submitted_at: datetime

    class Config:
        from_attributes = True


class ReportVerification(BaseModel):
    status: str = Field(..., pattern="^(verified|rejected)$")
    feedback: Optional[str] = None


# ==================== Chat Schemas ====================


class ChannelCreate(BaseModel):
    name: str
    type: str = Field(..., pattern="^(direct|team|project)$")
    project_id: Optional[str] = None
    members: List[str] = []


class ChannelResponse(BaseModel):
    id: str
    name: str
    type: str
    project_id: Optional[str] = None
    created_at: datetime
    last_message: Optional[str] = None

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"


class MessageResponse(BaseModel):
    id: str
    channel_id: str
    sender_id: str
    sender_name: str
    content: str
    message_type: str
    sent_at: datetime

    class Config:
        from_attributes = True


# ==================== Calendar Schemas ====================


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: str = Field(..., pattern="^(deadline|meeting|reminder)$")
    start_time: datetime
    end_time: datetime
    project_id: Optional[str] = None


class CalendarEventResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    event_type: str
    start_time: datetime
    end_time: datetime
    project_id: Optional[str] = None
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Notification Schemas ====================


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    content: str
    type: str
    read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Stats Schemas ====================


class UserStatsResponse(BaseModel):
    user_id: str
    level: int
    xp: int
    xp_for_next_level: int
    certificates_count: int
    projects_completed: int
    bugs_found: int
    tests_completed: int
    total_earnings: float


class PlatformStatsResponse(BaseModel):
    total_users: int
    total_projects: int
    total_transactions: float
    active_bounties: int


# ==================== Connection Schemas ====================


class ConnectionRequestCreate(BaseModel):
    receiver_id: str
    message: Optional[str] = None


class ConnectionRequestResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: Optional[str] = None
    receiver_id: str
    receiver_name: Optional[str] = None
    message: Optional[str] = None
    status: str
    created_at: datetime
    responded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ConnectionResponse(BaseModel):
    id: str
    user1_id: str
    user1_name: Optional[str] = None
    user2_id: str
    user2_name: Optional[str] = None
    connected_at: datetime

    class Config:
        from_attributes = True


class MessageDeliveryResponse(BaseModel):
    message_id: str
    delivered: bool = False
    delivered_at: Optional[datetime] = None
    read: bool = False
    read_at: Optional[datetime] = None


class ApplicationWithFreelancer(BaseModel):
    id: str
    project_id: str
    freelancer_id: str
    freelancer_name: Optional[str] = None
    freelancer_email: Optional[str] = None
    bid_amount: float
    proposal: str
    status: str
    applied_at: datetime

    class Config:
        from_attributes = True
