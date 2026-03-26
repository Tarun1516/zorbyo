# pyright: reportImplicitRelativeImport=false
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    Enum,
    JSON,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.core.database import Base


class UserType(enum.Enum):
    STUDENT = "student"
    FREELANCER = "freelancer"
    CLIENT = "client"
    INVESTOR = "investor"


class ProjectStatus(enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ApplicationStatus(enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class PaymentStatus(enum.Enum):
    PENDING = "pending"
    ESCROW = "escrow"
    RELEASED = "released"
    FAILED = "failed"


class BugReportStatus(enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"
    PAID = "paid"


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255))
    user_type = Column(
        String(20), nullable=True
    )  # student, freelancer, client, investor
    created_at = Column(DateTime, default=datetime.utcnow)
    verified = Column(Boolean, default=False)
    level = Column(Integer, default=1)
    xp = Column(Integer, default=0)

    # Relationships
    profile = relationship("Profile", back_populates="user", uselist=False)
    course_progress = relationship("CourseProgress", back_populates="user")
    quiz_results = relationship("QuizResult", back_populates="user")
    quiz_attempts = relationship("QuizAttempt", back_populates="user")
    certificates = relationship("Certificate", back_populates="user")
    projects_created = relationship("Project", back_populates="client")
    applications = relationship("Application", back_populates="freelancer")
    payments_made = relationship(
        "Payment", foreign_keys="Payment.payer_id", back_populates="payer"
    )
    payments_received = relationship(
        "Payment", foreign_keys="Payment.payee_id", back_populates="payee"
    )
    bug_reports = relationship("BugReport", back_populates="reporter")
    messages = relationship("ChatMessage", back_populates="sender")
    notifications = relationship("Notification", back_populates="user")


class Profile(Base):
    __tablename__ = "profiles"

    user_id = Column(String(36), ForeignKey("users.id"), primary_key=True)
    name = Column(String(255))
    bio = Column(Text)
    skills = Column(JSON)  # Store as JSON array
    college_name = Column(String(255))
    kyc_verified = Column(Boolean, default=False)
    avatar_url = Column(String(500))
    github_url = Column(String(500))
    portfolio_url = Column(String(500))

    # Relationships
    user = relationship("User", back_populates="profile")


class Course(Base):
    __tablename__ = "courses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    domain = Column(String(100))
    thumbnail_url = Column(String(500))
    chapters = Column(Integer, default=0)
    duration_hours = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    progress = relationship("CourseProgress", back_populates="course")
    quizzes = relationship("Quiz", back_populates="course")
    certificates = relationship("Certificate", back_populates="course")


class CourseChapter(Base):
    __tablename__ = "course_chapters"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    course_id = Column(String(36), ForeignKey("courses.id"))
    chapter_index = Column(Integer)
    title = Column(String(255))
    video_url = Column(String(500))
    duration_seconds = Column(Integer)

    # Relationships
    course = relationship("Course")


class CourseProgress(Base):
    __tablename__ = "course_progress"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"))
    course_id = Column(String(36), ForeignKey("courses.id"))
    chapter_index = Column(Integer)
    video_timestamp = Column(Float, default=0)
    completed = Column(Boolean, default=False)
    last_updated = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="course_progress")
    course = relationship("Course", back_populates="progress")


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=True)
    chapter_index = Column(Integer)
    questions = Column(JSON)  # Store questions as JSON
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    course = relationship("Course", back_populates="quizzes")
    results = relationship("QuizResult", back_populates="quiz")
    attempts = relationship("QuizAttempt", back_populates="quiz")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    quiz_id = Column(String(36), ForeignKey("quizzes.id"), nullable=False)
    attempt_number = Column(Integer, nullable=False)
    score = Column(Integer, nullable=False)
    passed = Column(Boolean, default=False, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    attempted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="quiz_attempts")
    quiz = relationship("Quiz", back_populates="attempts")


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"))
    quiz_id = Column(String(36), ForeignKey("quizzes.id"))
    score = Column(Integer)
    total_questions = Column(Integer)
    answers = Column(JSON)  # Store answers as JSON
    completed_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="quiz_results")
    quiz = relationship("Quiz", back_populates="results")


class Certificate(Base):
    __tablename__ = "certificates"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"))
    course_id = Column(String(36), ForeignKey("courses.id"))
    issued_at = Column(DateTime, default=datetime.utcnow)
    certificate_url = Column(String(500))
    certificate_number = Column(String(100), unique=True)

    # Relationships
    user = relationship("User", back_populates="certificates")
    course = relationship("Course", back_populates="certificates")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    client_id = Column(String(36), ForeignKey("users.id"))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    domain = Column(String(100))
    budget = Column(Float)
    company_info = Column(Text, nullable=True)
    status = Column(
        String(20), default="open"
    )  # open, in_progress, completed, cancelled
    deadline = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    client = relationship("User", back_populates="projects_created")
    applications = relationship("Application", back_populates="project")
    team = relationship("ProjectTeam", back_populates="project", uselist=False)
    payments = relationship("Payment", back_populates="project")


class Application(Base):
    __tablename__ = "applications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"))
    freelancer_id = Column(String(36), ForeignKey("users.id"))
    bid_amount = Column(Float)
    proposal = Column(Text)
    status = Column(String(20), default="pending")  # pending, accepted, rejected
    applied_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="applications")
    freelancer = relationship("User", back_populates="applications")


class ProjectTeam(Base):
    __tablename__ = "project_teams"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"))
    lead_freelancer_id = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="team")
    members = relationship("TeamMember", back_populates="team")


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    team_id = Column(String(36), ForeignKey("project_teams.id"))
    user_id = Column(String(36), ForeignKey("users.id"))
    allocated_budget = Column(Float)
    role = Column(String(100))
    joined_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    team = relationship("ProjectTeam", back_populates="members")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"))
    payer_id = Column(String(36), ForeignKey("users.id"))
    payee_id = Column(String(36), ForeignKey("users.id"))
    amount = Column(Float)
    platform_fee = Column(Float)
    razorpay_fee = Column(Float)
    status = Column(String(20), default="pending")  # pending, escrow, released, failed
    razorpay_order_id = Column(String(255))
    razorpay_payment_id = Column(String(255))
    milestone_index = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="payments")
    payer = relationship(
        "User", foreign_keys=[payer_id], back_populates="payments_made"
    )
    payee = relationship(
        "User", foreign_keys=[payee_id], back_populates="payments_received"
    )


class BugBounty(Base):
    __tablename__ = "bug_bounties"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    client_id = Column(String(36), ForeignKey("users.id"))
    application_name = Column(String(255))
    description = Column(Text)
    scope = Column(Text)
    reward_amount = Column(Float)
    deadline = Column(DateTime)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    reports = relationship("BugReport", back_populates="bounty")


class BugReport(Base):
    __tablename__ = "bug_reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bounty_id = Column(String(36), ForeignKey("bug_bounties.id"))
    reporter_id = Column(String(36), ForeignKey("users.id"))
    vulnerability_type = Column(String(100))
    severity = Column(String(20))  # low, medium, high, critical
    steps_to_reproduce = Column(Text)
    proof_urls = Column(JSON)  # Store as JSON array
    status = Column(String(20), default="pending")  # pending, verified, rejected, paid
    submitted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    bounty = relationship("BugBounty", back_populates="reports")
    reporter = relationship("User", back_populates="bug_reports")


class ChatChannel(Base):
    __tablename__ = "chat_channels"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    name = Column(String(255))
    type = Column(String(20))  # direct, group, community
    description = Column(Text, nullable=True)
    members = Column(JSON, default=list)  # List of user IDs
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    messages = relationship("ChatMessage", back_populates="channel")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    channel_id = Column(String(36), ForeignKey("chat_channels.id"))
    sender_id = Column(String(36), ForeignKey("users.id"))
    content = Column(Text)
    message_type = Column(String(20), default="text")
    sent_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    channel = relationship("ChatChannel", back_populates="messages")
    sender = relationship("User", back_populates="messages")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    title = Column(String(255))
    description = Column(Text)
    event_type = Column(String(20))  # deadline, meeting, reminder
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"))
    title = Column(String(255))
    content = Column(Text)
    type = Column(String(20))  # project, payment, chat, system, calendar
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="notifications")


class ConnectionRequest(Base):
    """Connection request between users (LinkedIn-style)"""

    __tablename__ = "connection_requests"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    sender_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    receiver_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    responded_at = Column(DateTime, nullable=True)

    # Relationships
    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])


class Connection(Base):
    """Established connection between users"""

    __tablename__ = "connections"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user1_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    user2_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    connected_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])


class MessageDeliveryStatus(Base):
    """Track message delivery and read status (WhatsApp-style ticks)"""

    __tablename__ = "message_delivery_status"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    message_id = Column(String(36), ForeignKey("chat_messages.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    delivered = Column(Boolean, default=False)
    delivered_at = Column(DateTime, nullable=True)
    read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)

    # Relationships
    message = relationship("ChatMessage")
    user = relationship("User")


class PracticeDomainLevel(Base):
    """Track user's practice level per domain"""

    __tablename__ = "practice_domain_levels"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    domain = Column(String(100), nullable=False)
    current_level = Column(Integer, default=1)
    passed = Column(Boolean, default=False)
    best_score = Column(Integer, default=0)
    attempts = Column(Integer, default=0)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User")
