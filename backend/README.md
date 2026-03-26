# ZORBYO Backend

FastAPI backend for the ZORBYO freelancing and learning platform.

## Tech Stack

- **Framework**: FastAPI
- **Database**: PostgreSQL with SQLAlchemy (async)
- **Cache**: Redis
- **File Storage**: MinIO
- **Real-time**: Socket.IO
- **Video Calls**: Jitsi (Docker)
- **AI**: OpenRouter (arcee-ai/trinity-large-preview:free)
- **Payments**: Razorpay

## Setup

### Prerequisites

- Python 3.12+
- Docker & Docker Compose
- PostgreSQL (or use Docker)
- Redis (or use Docker)
- MinIO (or use Docker)

### Quick Start

1. **Start infrastructure services:**
   ```bash
   docker-compose up -d
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or
   venv\Scripts\activate  # Windows
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

5. **Run the server:**
   ```bash
   python main.py
   ```

   The API will be available at: http://localhost:8000
   API docs: http://localhost:8000/docs

## Project Structure

```
backend/
├── app/
│   ├── core/           # Core configurations
│   │   ├── config.py   # Settings & environment
│   │   └── database.py # Database connection
│   ├── models/         # SQLAlchemy models
│   │   └── models.py   # All database models
│   ├── schemas/        # Pydantic schemas
│   │   └── schemas.py  # Request/Response models
│   ├── routers/        # API routes
│   │   ├── auth.py     # Authentication
│   │   ├── users.py    # User management
│   │   ├── courses.py  # Learning platform
│   │   ├── projects.py # Freelancing projects
│   │   ├── payments.py # Razorpay integration
│   │   ├── chat.py     # Chat & video calls
│   │   ├── bug_bounty.py # Bug bounty system
│   │   └── profile.py  # User profiles
│   └── services/       # Business logic
│       ├── ai_service.py    # OpenRouter AI
│       └── minio_service.py # File storage
├── main.py             # Application entry
├── requirements.txt    # Python dependencies
├── docker-compose.yml  # Infrastructure
└── .env.example        # Environment template
```

## API Endpoints

### Authentication
- `POST /api/auth/github` - GitHub OAuth
- `POST /api/auth/google` - Google OAuth
- `POST /api/auth/select-type` - Select user type
- `POST /api/auth/verify-student` - Student verification
- `GET /api/auth/me` - Get current user

### Courses
- `GET /api/courses` - List courses
- `GET /api/courses/{id}` - Get course details
- `GET /api/courses/{id}/chapters` - Get chapters
- `POST /api/courses/{id}/progress` - Update progress
- `POST /api/courses/{id}/quiz/generate` - Generate AI quiz
- `POST /api/courses/{id}/quiz/submit` - Submit quiz

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `POST /api/projects/{id}/apply` - Apply to project
- `PUT /api/projects/{id}/hire/{app_id}` - Hire freelancer

### Payments
- `POST /api/payments/create-order` - Create Razorpay order
- `POST /api/payments/verify` - Verify payment
- `POST /api/payments/release-milestone` - Release payment

### Chat
- `GET /api/chat/channels` - List channels
- `POST /api/chat/channels` - Create channel
- `GET /api/chat/channels/{id}/messages` - Get messages
- `POST /api/chat/channels/{id}/video-call` - Start video call

### Bug Bounty
- `GET /api/bounties` - List bounties
- `POST /api/bounties` - Create bounty
- `POST /api/bounties/{id}/report` - Submit bug report
- `PUT /api/bounties/reports/{id}/verify` - Verify report

## Environment Variables

See `.env.example` for all required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `MINIO_*` - MinIO configuration
- `SECRET_KEY` - JWT secret key
- `GITHUB_*` - GitHub OAuth credentials
- `GOOGLE_*` - Google OAuth credentials
- `OPENROUTER_*` - AI API credentials
- `RAZORPAY_*` - Payment gateway credentials

## Docker Services

The `docker-compose.yml` includes:

- **PostgreSQL** - Database (port 5432)
- **Redis** - Cache (port 6379)
- **MinIO** - File storage (port 9000, console 9001)
- **Jitsi** - Video calls (port 8443)

## Development

### Running Tests
```bash
pytest
```

### Database Migrations
```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Code Formatting
```bash
black .
isort .
```
