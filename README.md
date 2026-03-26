# ZORBYO

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
- NativeWind (TailwindCSS)
- React Navigation
- Socket.IO Client

### Backend
- FastAPI (Python 3.12+)
- SQLAlchemy (Async ORM)
- PostgreSQL (Neon)
- Redis (Caching)
- MinIO (File Storage)
- Socket.IO (Real-time)
- Jitsi (Video Calls)

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
│   └── docker-compose.yml
├── courses/            # Course content (MIT 6.0002)
├── docs/               # Documentation
│   └── superpowers/    # Plans & user stories
└── requirements/       # Project requirements
```

## Quick Start

### 1. Start Backend Infrastructure

```bash
cd backend
docker-compose up -d
```

### 2. Setup Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
python main.py
```

### 3. Setup Frontend

```bash
cd frontend
npm install
npm start
```

### 4. Open the App

- **Web**: http://localhost:19006
- **Mobile**: Scan QR code with Expo Go

## User Types

1. **Student/Freelancer**: Learn, practice, apply to projects (3% platform fee)
2. **Client**: Post projects, hire freelancers, manage teams
3. **Investor**: View pitch decks, fund startups (future feature)

## Key Features

### 72-Hour Lockout
New accounts cannot apply/post projects for 72 hours after creation.

### KYC Verification
- Students must use .edu.in or .ac.in email
- ID card verification via AI (Gemini Vision)

### AI-Powered Learning
- Video content analysis
- Automatic quiz generation
- Code review for practice tasks

### Escrow Payments
- Client pays → Zorbyo holds → Work approved → Freelancer paid
- 5% fee for freelancers, 3% for students
- Milestone-based payments for projects > ₹10,000

### Team Building
- Lead freelancer can add team members
- Budget allocation by lead
- Sub-order tracking

## Configuration

See `.env.example` files in both frontend and backend for required environment variables:

- Database credentials
- OAuth keys (GitHub, Google)
- AI API keys (OpenRouter)
- Payment gateway (Razorpay)
- Storage (MinIO)

## Documentation

- [Implementation Plan](docs/superpowers/plans/zorbyo-implementation-plan.md)
- [Requirements](requirments/rawprompt.md)
- [Wireframe](requirments/Wireframe_and_working_zorbyo.svg)

## Development Phases

1. **Phase 1**: Foundation (Auth, Database, Basic UI)
2. **Phase 2**: Core Features (Courses, Projects)
3. **Phase 3**: Advanced (Chat, Video, Calendar)
4. **Phase 4**: Payments & Verification
5. **Phase 5**: Polish & Deploy

## License

Proprietary - All rights reserved
