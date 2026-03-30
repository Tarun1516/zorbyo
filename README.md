# ZORBYO

![ZORBYO Logo](assets/Logo-Zorbyo.png)

A multi-sided platform combining Fiverr, LinkedIn, HackerOne, Unstop, Coursera/Udemy, and Internshala.

## Overview

ZORBYO is a comprehensive freelancing and learning platform designed for college students, freelancers, clients, and investors. It provides:

- **Learning Platform**: AI-powered courses with restricted video player and quizzes
- **Freelancing Marketplace**: Project posting, bidding, and team building
- **Bug Bounty**: Security testing marketplace
- **Practice Arena**: Skill development with AI verification
- **Real-time Chat**: Discord/Slack-style communication
- **Video Calls**: Jitsi integration for meetings

## Tech Stack

### Frontend
- React Native + Expo (Cross-platform: iOS, Android, Web)
- TypeScript
- React Navigation
- Socket.IO Client

### Backend
- FastAPI (Python 3.12+)
- SQLAlchemy (Async ORM) with SQLite for local dev
- PostgreSQL (Production via Supabase)
- Redis (Caching)
- MinIO (File Storage for course videos)
- Socket.IO (Real-time)

### AI & Payments
- OpenRouter (arcee-ai/trinity-large-preview:free)
- Razorpay (Payments)

## Project Structure

```
zorbyo/
├── frontend/           # React Native + Expo app
│   ├── src/
│   │   ├── screens/    # App screens
│   │   ├── components/ # UI components
│   │   ├── context/    # State management
│   │   └── services/   # API integration
│   └── assets/         # Images, fonts
├── backend/            # FastAPI server
│   ├── app/
│   │   ├── core/       # Config & database
│   │   ├── models/     # SQLAlchemy models
│   │   ├── schemas/    # Pydantic schemas
│   │   ├── routers/    # API endpoints
│   │   └── services/   # Business logic
│   ├── seed_courses.py # Seed courses from MinIO to DB
│   ├── upload_courses.py # Upload course videos to MinIO
│   └── docker-compose.yml
├── courses/            # Local course video files
├── assets/             # Logo and branding
└── requirments/        # Project requirements & wireframes
```

---

## Local Setup Guide

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **Docker Desktop** (for MinIO, Redis, PostgreSQL)
- **Expo Go** app on your phone (or Android/iOS emulator)

### Step 1: Clone the Repository

```bash
git clone https://github.com/Tarun1516/zorbyo.git
cd zorbyo
```

### Step 2: Install Backend Dependencies

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### Step 3: Install Frontend Dependencies

```bash
cd frontend
npm install
```

### Step 4: Configure Environment

```bash
cd backend

# Windows
copy .env.example .env

# Mac/Linux
cp .env.example .env
```

Edit `.env` with the minimum required settings for local development:

```env
# Database - SQLite works out of the box, no setup needed
DATABASE_URL=sqlite+aiosqlite:///./zorbyo.db

# MinIO - matches docker-compose.yml defaults
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=zorbyo
MINIO_SECURE=False

# Optional: Leave these empty for local testing
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
# OPENROUTER_API_KEY=
# RAZORPAY_KEY_ID=
```

### Step 5: Start Infrastructure (Docker)

```bash
cd backend
docker-compose up -d
```

This starts three containers:

| Service    | Port  | Purpose              | Console/Login           |
|------------|-------|----------------------|-------------------------|
| MinIO      | 9000  | Video file storage   | http://localhost:9001   |
| Redis      | 6379  | Caching & pub/sub    | -                       |
| PostgreSQL | 5432  | Production database   | -                       |

**MinIO Console Login**: `minioadmin` / `minioadmin`

A `zorbyo` bucket is auto-created on first startup.

### Step 6: Upload Course Videos to MinIO

Place your `.mp4` course video files in a local folder, then upload:

```bash
cd backend
venv\Scripts\activate

# Upload a specific course folder
python upload_courses.py --course "intro-to-data-science" --path "C:\path\to\your\videos"

# List all courses currently in MinIO
python upload_courses.py --list
```

The videos will be stored in MinIO under:
```
zorbyo/
  courses/
    intro-to-data-science/
      lecture01.mp4
      lecture02.mp4
      ...
```

### Step 7: Seed Courses into Database

After uploading videos to MinIO, register them in the database:

```bash
cd backend
python seed_courses.py
```

This reads all course folders from MinIO and creates Course + Chapter records in SQLite.

Verify the seeded courses:

```bash
python seed_courses.py --db
```

### Step 8: Start the Backend Server

```bash
cd backend
python main.py
```

The API runs on `http://localhost:4000`

- API documentation: `http://localhost:4000/docs`

### Step 9: Start the Frontend

```bash
cd frontend
npx expo start
```

Options:
- Scan the QR code with **Expo Go** app on your phone
- Press `a` for Android emulator
- Press `w` for web browser (`http://localhost:19006`)

---

## Quick Start (All Terminals)

```bash
# Terminal 1 - Infrastructure
cd backend
docker-compose up -d

# Terminal 2 - Backend API
cd backend
venv\Scripts\activate
python main.py

# Terminal 3 - Upload & Seed Courses (run once)
cd backend
python upload_courses.py --course "my-course" --path "C:\videos\my-course"
python seed_courses.py

# Terminal 4 - Frontend
cd frontend
npx expo start
```

---

## Feature Availability (Local Dev)

| Feature | Works Locally? | Extra Setup Required |
|---------|---------------|---------------------|
| Course videos | Yes | Upload to MinIO first |
| Project posting & applying | Yes | No extra setup |
| Chat & Connections | Yes | No extra setup |
| Profile & Level tracking | Yes | No extra setup |
| Practice quizzes (AI) | Partial | Needs `OPENROUTER_API_KEY` |
| OAuth login (Google/GitHub) | No | Needs Supabase project |
| Payments (Razorpay) | No | Needs Razorpay test keys |
| Video calls (Jitsi) | Yes | Uses meet.jit.si by default |

---

## User Types

1. **Student/Freelancer**: Learn, practice, apply to projects (3% platform fee)
2. **Client**: Post projects, hire freelancers, manage teams
3. **Investor**: View pitch decks, fund startups (future feature)

## Key Features

### 72-Hour Lockout
New accounts cannot apply/post projects for 72 hours after creation.

### Practice Arena
- Choose from 25+ domains
- 25 AI-generated questions per session
- 70% passing criteria (18/25 correct)
- Level progression with XP rewards

### Escrow Payments
- Client pays to Zorbyo, work approved, freelancer gets paid
- 5% fee for freelancers, 3% for students
- Milestone-based payments for projects > Rs 10,000

### Team Building
- Lead freelancer can add team members
- Budget allocation by lead
- Sub-order tracking

## Configuration

See `backend/.env.example` for all available environment variables:

- **Database**: SQLite (local) or Supabase PostgreSQL (production)
- **MinIO**: Local object storage for course videos
- **OAuth**: GitHub, Google via Supabase
- **AI**: OpenRouter for quiz generation
- **Payments**: Razorpay test/live keys
- **Redis**: Socket.IO pub/sub and caching

## License

Proprietary - All rights reserved
