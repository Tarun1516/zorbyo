# ZORBYO Implementation Plan

## Executive Summary

**ZORBYO** is a multi-sided platform combining Fiverr, LinkedIn, HackerOne, Unstop, Coursera/Udemy, and Internshala. It serves freelancers, college students, clients, and investors with learning, freelancing, bug bounty, and investment features.

---

## 1. Architecture Overview

### Tech Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React Native + Expo | Cross-platform (iOS/Android/Web) |
| Styling | Tailwind CSS v4 + Shadcn/Radix UI | Custom themes, components |
| Backend | FastAPI + Python-SocketIO | APIs, real-time features |
| Database | Neon PostgreSQL + SQLAlchemy | Data persistence |
| File Storage | MinIO | Course videos, certificates |
| Cache | Redis | Sessions, caching |
| Auth | Neon Auth | GitHub/Google OAuth |
| AI | OpenRouter (arcee-ai/trinity-large-preview:free) | Quizzes, verification |
| Chat/Video | Jitsi (Docker) | Video calls |
| Payments | Razorpay | Escrow, milestones |
| Notifications | Expo Notifications | Push notifications |

### Data Flow
```
Expo Frontend → FastAPI (REST + WebSocket) 
                ↓
        PostgreSQL (Neon) + MinIO + Redis
                ↓
        Docker/K8s → Cloud Deployment
```

---

## 2. User Types & Permissions

### 2.1 Student/Freelancer
- Access Learn, Practice, Projects, Bug Bounty, Profile
- Apply to projects after 72-hour lockout
- 3% platform fee (vs 5% for regular freelancers)
- Must verify with .edu.in/.ac.in email + DigiLocker KYC

### 2.2 Client
- Post projects, bug bounties
- Browse freelancer profiles
- Manage ongoing projects
- Pay through Razorpay escrow

### 2.3 Investor
- View pitch decks
- Limited access (future feature)

---

## 3. Page-by-Page Specifications

### 3.1 Welcome Page
- Brand introduction
- Get Started CTA
- Animated hero section

### 3.2 Authentication Page
- GitHub OAuth button
- Google OAuth button
- Neon Auth integration
- Post-auth: User type selection

### 3.3 User Type Selection
- Three cards: Student/Freelancer | Client | Investor
- One-time selection (stored in DB)
- KYC flow initiation for students

### 3.4 Learn (Courses) Page
**Sections:**
1. **Domains to Learn** - List of available courses
2. **Ongoing Courses** - Resume from last position
3. **Completed Courses** - Certificates earned
4. **Downloads** - Offline accessible content

**Video Player Requirements:**
- NO seeking/scrubbing (timeline disabled)
- NO playback speed control
- NO skip forward/backward
- Only Play/Pause enabled
- Progress saved to backend on pause/exit

**Quiz System:**
- 10 MCQ questions per chapter
- AI-generated based on video content
- Overall exam at course completion
- Certificate issued on pass

**Initial Course:**
- "Intro to Data Science" (MIT 6.0002 lectures 01-10)
- Videos stored in MinIO
- Content understanding for AI quiz generation

**Footer Message:**
"The courses displayed are opensource and publicly available courses, Zorbyo doesn't own any copyright for them."

### 3.5 Practice Page
**Features:**
- Domain selection (Software Dev, Design, Marketing, etc.)
- Practice tasks/quizzes per domain
- AI verification of submissions
- XP/level progression
- Digital certificates

**Domains Supported:**
Video editing, photo editing, logo design, web/mobile dev, game design, UI/UX, software testing, sales, management, entrepreneurship, crypto, banking, trading, finance, network security, hardware, OS, SAP, Google/Microsoft works, graphic/3D design, digital/social media marketing, SEO, automation, AI agents, branding, music production, IT/GST filing

### 3.6 Projects Page
**For Freelancers:**
- Browse available projects
- Filter by domain, budget, deadline
- Apply with custom bid amount (0 to above estimated)
- View application status

**For Clients:**
- Post new projects with budget
- Browse freelancer profiles
- Review applications
- Hire freelancers

**Ongoing Projects Section:**
- Project dashboard
- Chat interface (Discord/Slack style)
- Channels: 1-to-1, team channels
- Video call integration (Jitsi)
- Calendar for deadlines/meetings
- Milestone tracking

**Team Building Logic:**
- Lead freelancer can add team members
- System enforces level-based hierarchy
- Budget splitting (lead decides allocation)
- Sub-order tracking

### 3.7 Bug Bounty Page
- List of applications for testing
- Submission form:
  - Vulnerability type (SQLi, XSS, CSRF, etc.)
  - Severity (Low/Medium/High/Critical)
  - Steps to reproduce
  - Proof of concept (video/screenshot)
- Manual verification by client

### 3.8 Profile Page
- User details (email hidden from others)
- Certificates earned
- Tests completed
- Level/experience tracking
- Work history
- Skills/portfolio

---

## 4. Core Business Logic

### 4.1 72-Hour Lockout
```python
if (current_time - user_created_at) < timedelta(hours=72):
    raise HTTPException(403, "Account under review. Please wait 72 hours.")
```

### 4.2 KYC Verification
1. Student uploads ID card photo
2. Gemini Vision extracts: Name, College, Valid Thru
3. Compare with account data
4. Fallback: Manual review

### 4.3 Email Domain Enforcement
- Students: Must use .edu.in or .ac.in
- Verification via OTP to educational email

### 4.4 Payment & Commission
**Fee Structure:**
- Regular freelancer: 5%
- Student: 3%

**Payment Flow:**
```
Client → Razorpay → Zorbyo Account → Freelancer (minus fee)
```

**Milestone Logic:**
- Budget < ₹10,000: Single payment
- Budget > ₹10,000: Split into milestones
  - 50% work done → 40-50% payment released
  - Fee distributed across milestones

### 4.5 Project Submission Categories
- **Category A (Code):** GitHub repo link, AI code review
- **Category B (Design):** View-only Figma/Drive link
- **Category C (Bug Bounty):** Structured report form
- **Category D (Team):** Sub-order with budget allocation

---

## 5. User Stories

### Epic 1: Authentication & Onboarding

**US-1.1:** As a new user, I want to sign up with GitHub/Google so I can quickly create an account.
- Acceptance Criteria:
  - OAuth buttons visible on auth page
  - Redirect to provider and back
  - Account created with basic profile

**US-1.2:** As an authenticated user, I want to select my account type (Student/Client/Investor) so I see relevant features.
- Acceptance Criteria:
  - Three clear options displayed
  - Selection stored permanently
  - UI adapts to user type

**US-1.3:** As a student, I want to verify my identity via DigiLocker and educational email so I can access all features.
- Acceptance Criteria:
  - .edu.in/.ac.in email required
  - ID card upload and AI verification
  - Verified badge on profile

**US-1.4:** As a new user, I want a 72-hour cooling period before I can apply/post projects.
- Acceptance Criteria:
  - Clear message showing time remaining
  - Actions blocked until period ends
  - Notification when unlocked

### Epic 2: Learning Platform

**US-2.1:** As a student, I want to browse available courses by domain.
- Acceptance Criteria:
  - Course cards with thumbnails
  - Domain filtering
  - Progress indicators

**US-2.2:** As a student, I want to watch course videos with controls disabled (no seeking, no speed change).
- Acceptance Criteria:
  - Video plays only play/pause
  - Timeline not draggable
  - No speed controls
  - No skip buttons

**US-2.3:** As a student, I want my video progress saved so I can resume later.
- Acceptance Criteria:
  - Timestamp saved on pause/exit
  - Resumes from last position
  - Works offline with sync

**US-2.4:** As a student, I want to take AI-generated quizzes after each chapter.
- Acceptance Criteria:
  - 10 MCQ questions per chapter
  - Questions relevant to video content
  - Score displayed
  - Progress tracked

**US-2.5:** As a student, I want to earn certificates upon course completion.
- Acceptance Criteria:
  - Final exam after all chapters
  - Certificate generated on pass
  - Visible on profile
  - Downloadable

**US-2.6:** As a student, I want to download courses for offline viewing.
- Acceptance Criteria:
  - Download button on course page
  - Progress indicator
  - Offline playback works
  - Downloads section shows all downloaded content

### Epic 3: Practice & Skill Building

**US-3.1:** As a user, I want to select my practice domain.
- Acceptance Criteria:
  - Domain list with icons
  - Selection persists
  - Domain-specific content loads

**US-3.2:** As a user, I want AI-verified practice tasks.
- Acceptance Criteria:
  - Task instructions clear
  - Submission via link/upload
  - AI provides feedback
  - XP awarded on completion

**US-3.3:** As a user, I want to track my level and XP progression.
- Acceptance Criteria:
  - Level displayed on profile
  - XP bar visible
  - Level-up notifications
  - Badges for milestones

### Epic 4: Freelancing Marketplace

**US-4.1:** As a client, I want to post a project with budget and requirements.
- Acceptance Criteria:
  - Project form with all fields
  - Budget specification
  - Domain/category selection
  - Deadline setting

**US-4.2:** As a freelancer, I want to browse and filter available projects.
- Acceptance Criteria:
  - Project cards with key info
  - Filter by domain, budget, deadline
  - Search functionality
  - Pagination

**US-4.3:** As a freelancer, I want to apply to projects with my bid.
- Acceptance Criteria:
  - Application form
  - Custom bid amount (can be 0 or above estimate)
  - Cover letter/proposal
  - Portfolio attachment

**US-4.4:** As a client, I want to review applications and hire freelancers.
- Acceptance Criteria:
  - Application list with details
  - Freelancer profile preview
  - Accept/reject actions
  - Notification to freelancer

**US-4.5:** As a lead freelancer, I want to build a team for complex projects.
- Acceptance Criteria:
  - Search lower-level freelancers
  - Allocate budget portions
  - Team member approval
  - Sub-order creation

**US-4.6:** As a user, I want to communicate via chat (1-to-1 and channels).
- Acceptance Criteria:
  - Real-time messaging
  - Channel creation
  - Team member management
  - Message history

**US-4.7:** As a user, I want video calls for project discussions.
- Acceptance Criteria:
  - Jitsi integration
  - In-app video player
  - Screen sharing
  - Recording (optional)

**US-4.8:** As a user, I want a calendar for deadlines and meetings.
- Acceptance Criteria:
  - Calendar view
  - Event creation
  - Deadline markers
  - Sync with notifications

### Epic 5: Payments & Escrow

**US-5.1:** As a client, I want to pay through Razorpay with escrow protection.
- Acceptance Criteria:
  - Razorpay checkout
  - Escrow hold
  - Payment confirmation
  - Receipt generation

**US-5.2:** As a platform, I want to calculate and deduct platform fees.
- Acceptance Criteria:
  - 5% for freelancers, 3% for students
  - Fee shown in billing
  - Milestone fee distribution

**US-5.3:** As a freelancer, I want to receive payments after milestone approval.
- Acceptance Criteria:
  - Client approval triggers payout
  - Automatic calculation
  - Payout to UPI/bank
  - Transaction history

**US-5.4:** As a user, I want detailed invoices with all fees shown.
- Acceptance Criteria:
  - Platform fee listed
  - Razorpay fee listed
  - Net amount to freelancer
  - Downloadable PDF

### Epic 6: Bug Bounty

**US-6.1:** As a client, I want to list my application for bug bounty testing.
- Acceptance Criteria:
  - Application details form
  - Scope definition
  - Reward structure
  - Duration setting

**US-6.2:** As a tester, I want to submit bug reports with evidence.
- Acceptance Criteria:
  - Structured form (type, severity, steps, PoC)
  - Screenshot/video upload
  - Submission tracking
  - Status updates

**US-6.3:** As a client, I want to verify and reward bug submissions.
- Acceptance Criteria:
  - Review interface
  - Accept/reject with feedback
  - Payment on acceptance
  - Dispute resolution

### Epic 7: Profile & Progress

**US-7.1:** As a user, I want a comprehensive profile showing my achievements.
- Acceptance Criteria:
  - Basic info (email hidden)
  - Certificates displayed
  - Level/XP visible
  - Work history
  - Skills list

**US-7.2:** As a user, I want my contact information hidden from other users.
- Acceptance Criteria:
  - Email not visible
  - No phone number shown
  - Communication only through platform

---

## 6. Task Breakdown

### Phase 1: Foundation (Week 1-2)

**T-1.1: Project Setup**
- Initialize Expo project with TypeScript
- Configure Tailwind CSS v4 with provided theme
- Set up FastAPI backend
- Configure Neon PostgreSQL connection
- Set up MinIO for file storage
- Configure Redis for caching

**T-1.2: Authentication System**
- Implement Supabase Auth integration
- GitHub OAuth flow
- Google OAuth flow
- User type selection UI
- JWT token management

**T-1.3: Database Schema**
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    user_type ENUM('student', 'freelancer', 'client', 'investor'),
    created_at TIMESTAMP,
    verified BOOLEAN DEFAULT FALSE,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0
);

-- Profiles table
CREATE TABLE profiles (
    user_id UUID REFERENCES users(id),
    name VARCHAR(255),
    bio TEXT,
    skills TEXT[],
    college_name VARCHAR(255),
    kyc_verified BOOLEAN DEFAULT FALSE
);

-- Courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    domain VARCHAR(100),
    video_urls TEXT[],
    minio_path VARCHAR(500)
);

-- Course Progress table
CREATE TABLE course_progress (
    user_id UUID REFERENCES users(id),
    course_id UUID REFERENCES courses(id),
    chapter_index INTEGER,
    video_timestamp FLOAT,
    completed BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP
);

-- Quizzes table
CREATE TABLE quizzes (
    id UUID PRIMARY KEY,
    course_id UUID REFERENCES courses(id),
    chapter_index INTEGER,
    questions JSONB
);

-- Quiz Results table
CREATE TABLE quiz_results (
    user_id UUID REFERENCES users(id),
    quiz_id UUID REFERENCES quizzes(id),
    score INTEGER,
    answers JSONB,
    completed_at TIMESTAMP
);

-- Certificates table
CREATE TABLE certificates (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    course_id UUID REFERENCES courses(id),
    issued_at TIMESTAMP,
    certificate_url VARCHAR(500)
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    client_id UUID REFERENCES users(id),
    title VARCHAR(255),
    description TEXT,
    domain VARCHAR(100),
    budget DECIMAL(10,2),
    status ENUM('open', 'in_progress', 'completed', 'cancelled'),
    deadline DATE,
    created_at TIMESTAMP
);

-- Applications table
CREATE TABLE applications (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    freelancer_id UUID REFERENCES users(id),
    bid_amount DECIMAL(10,2),
    proposal TEXT,
    status ENUM('pending', 'accepted', 'rejected'),
    applied_at TIMESTAMP
);

-- Project Teams table
CREATE TABLE project_teams (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    lead_freelancer_id UUID REFERENCES users(id),
    budget_allocation JSONB,
    created_at TIMESTAMP
);

-- Team Members table
CREATE TABLE team_members (
    team_id UUID REFERENCES project_teams(id),
    user_id UUID REFERENCES users(id),
    allocated_budget DECIMAL(10,2),
    role VARCHAR(100),
    joined_at TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    payer_id UUID REFERENCES users(id),
    payee_id UUID REFERENCES users(id),
    amount DECIMAL(10,2),
    platform_fee DECIMAL(10,2),
    razorpay_fee DECIMAL(10,2),
    status ENUM('pending', 'escrow', 'released', 'failed'),
    razorpay_order_id VARCHAR(255),
    milestone_index INTEGER,
    created_at TIMESTAMP
);

-- Bug Bounties table
CREATE TABLE bug_bounties (
    id UUID PRIMARY KEY,
    client_id UUID REFERENCES users(id),
    application_name VARCHAR(255),
    description TEXT,
    scope TEXT,
    reward_amount DECIMAL(10,2),
    deadline DATE,
    status ENUM('active', 'completed', 'expired')
);

-- Bug Reports table
CREATE TABLE bug_reports (
    id UUID PRIMARY KEY,
    bounty_id UUID REFERENCES bug_bounties(id),
    reporter_id UUID REFERENCES users(id),
    vulnerability_type VARCHAR(100),
    severity ENUM('low', 'medium', 'high', 'critical'),
    steps_to_reproduce TEXT,
    proof_urls TEXT[],
    status ENUM('pending', 'verified', 'rejected', 'paid'),
    submitted_at TIMESTAMP
);

-- Chat Channels table
CREATE TABLE chat_channels (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    name VARCHAR(255),
    type ENUM('direct', 'team', 'project'),
    created_at TIMESTAMP
);

-- Chat Messages table
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY,
    channel_id UUID REFERENCES chat_channels(id),
    sender_id UUID REFERENCES users(id),
    content TEXT,
    message_type ENUM('text', 'file', 'system'),
    sent_at TIMESTAMP
);

-- Calendar Events table
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    title VARCHAR(255),
    description TEXT,
    event_type ENUM('deadline', 'meeting', 'reminder'),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    title VARCHAR(255),
    content TEXT,
    type ENUM('project', 'payment', 'chat', 'system', 'calendar'),
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP
);
```

### Phase 2: Core Features (Week 3-4)

**T-2.1: Course System**
- Video player with restricted controls
- Progress tracking (online/offline)
- Download functionality
- MinIO integration for video storage

**T-2.2: AI Quiz Generation**
- OpenRouter integration
- Video content analysis
- MCQ generation
- Scoring system

**T-2.3: Project Marketplace**
- Project listing/filtering
- Application system
- Bid mechanism
- 72-hour lockout middleware

### Phase 3: Advanced Features (Week 5-6)

**T-3.1: Chat System**
- Socket.IO integration
- Channel management
- Real-time messaging
- File sharing

**T-3.2: Video Calls**
- Jitsi Docker deployment
- In-app integration
- Call management

**T-3.3: Calendar & Notifications**
- Event management
- Push notifications (Expo)
- Email notifications
- 30-minute meeting reminders

### Phase 4: Payments & Verification (Week 7-8)

**T-4.1: Razorpay Integration**
- Payment flow
- Escrow system
- Payout automation
- Fee calculation

**T-4.2: KYC System**
- DigiLocker integration
- ID card upload
- Gemini Vision verification
- Manual fallback

**T-4.3: Bug Bounty Module**
- Bounty listing
- Report submission
- Verification workflow
- Reward distribution

### Phase 5: Polish & Deploy (Week 9-10)

**T-5.1: UI/UX Polish**
- Theme implementation
- Responsive design
- Animations
- Accessibility

**T-5.2: Testing**
- Unit tests
- Integration tests
- E2E tests
- Performance testing

**T-5.3: Deployment**
- Docker containerization
- CI/CD setup (GitHub Actions)
- Cloud deployment
- Monitoring setup

---

## 7. CSS Theme Configuration

### Light Theme Variables
```css
:root {
  --background: oklch(1.00 0 0);
  --foreground: oklch(0.14 0 0);
  --card: oklch(1.00 0 0);
  --card-foreground: oklch(0.14 0 0);
  --popover: oklch(1.00 0 0);
  --popover-foreground: oklch(0.14 0 0);
  --primary: oklch(0.62 0.19 28.39);        /* #E5493D - Orange/Red */
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.20 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.56 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.20 0 0);
  --destructive: oklch(0.58 0.24 28.48);
  --border: oklch(0.92 0 0);
  --input: oklch(0.92 0 0);
  --ring: oklch(0.71 0 0);
  --font-sans: Geist, Geist Fallback, sans-serif;
  --font-mono: Geist Mono, Geist Mono Fallback, monospace;
  --radius: 0.625rem;
}
```

### Dark Theme Variables
```css
.dark {
  --background: oklch(0.14 0 0);
  --foreground: oklch(0.99 0 0);
  --card: oklch(0.20 0 0);
  --card-foreground: oklch(0.99 0 0);
  --primary: oklch(0.92 0 0);
  --primary-foreground: oklch(0.20 0 0);
  --secondary: oklch(0.27 0 0);
  --secondary-foreground: oklch(0.99 0 0);
  --border: oklch(1.00 0 0 / 10%);
}
```

---

## 8. API Endpoints

### Authentication
- `POST /auth/github` - GitHub OAuth
- `POST /auth/google` - Google OAuth
- `POST /auth/select-type` - User type selection
- `POST /auth/verify-student` - Student verification

### Courses
- `GET /courses` - List all courses
- `GET /courses/:id` - Get course details
- `POST /courses/:id/progress` - Update progress
- `GET /courses/:id/progress` - Get user progress
- `POST /courses/:id/quiz/generate` - Generate AI quiz
- `POST /courses/:id/quiz/submit` - Submit quiz answers
- `POST /courses/:id/download` - Download for offline

### Projects
- `GET /projects` - List projects (with filters)
- `POST /projects` - Create project (client only)
- `GET /projects/:id` - Get project details
- `POST /projects/:id/apply` - Apply to project
- `PUT /projects/:id/hire/:freelancerId` - Hire freelancer
- `POST /projects/:id/team` - Add team member

### Payments
- `POST /payments/create-order` - Create Razorpay order
- `POST /payments/verify` - Verify payment
- `POST /payments/release-milestone` - Release milestone payment
- `GET /payments/history` - Payment history

### Chat
- `GET /channels` - List user channels
- `POST /channels` - Create channel
- `GET /channels/:id/messages` - Get messages
- `WebSocket /ws/chat/:channelId` - Real-time chat

### Bug Bounty
- `GET /bounties` - List bounties
- `POST /bounties` - Create bounty (client only)
- `POST /bounties/:id/report` - Submit bug report
- `PUT /bounties/:id/reports/:reportId/verify` - Verify report

### Profile
- `GET /profile/:userId` - Get profile
- `PUT /profile` - Update profile
- `GET /profile/:userId/certificates` - Get certificates
- `GET /profile/:userId/stats` - Get stats

---

## 9. Security Considerations

1. **Input Validation** - All inputs sanitized
2. **Rate Limiting** - API throttling
3. **CORS** - Restricted origins
4. **JWT** - Short-lived tokens with refresh
5. **File Upload** - Size limits, type validation
6. **Payment** - Razorpay webhook verification
7. **PII** - Contact info encrypted/hidden

---

## 10. Monitoring & Analytics

1. **Error Tracking** - Sentry integration
2. **Performance** - APM monitoring
3. **User Analytics** - Event tracking
4. **Payment Analytics** - Transaction monitoring
5. **AI Usage** - Token consumption tracking

---

## 11. Future Enhancements

1. **Investor Module** - Pitch deck viewing, funding
2. **Mobile Apps** - iOS/Android native features
3. **AI Chatbot** - User assistance
4. **Advanced Matching** - AI job-freelancer matching
5. **Reputation System** - Reviews and ratings
6. **Marketplace** - Digital products
7. **API Marketplace** - Third-party integrations

---

Document Version: 1.0
Last Updated: 2026-03-20
Status: Ready for Implementation
