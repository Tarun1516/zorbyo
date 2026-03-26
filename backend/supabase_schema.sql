-- ZORBYO Database Schema for Supabase PostgreSQL
-- Run this SQL in the Supabase SQL Editor to create all required tables.
-- Dashboard > SQL Editor > New Query > Paste this > Run

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    user_type VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    verified BOOLEAN DEFAULT false,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    bio TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    college_name VARCHAR(255),
    kyc_verified BOOLEAN DEFAULT false,
    avatar_url VARCHAR(500),
    github_url VARCHAR(500),
    portfolio_url VARCHAR(500)
);

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.courses (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    domain VARCHAR(100),
    thumbnail_url VARCHAR(500),
    chapters INTEGER DEFAULT 0,
    duration_hours DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- COURSE CHAPTERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_chapters (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    course_id VARCHAR(36) REFERENCES public.courses(id) ON DELETE CASCADE,
    chapter_index INTEGER,
    title VARCHAR(255),
    video_url VARCHAR(500),
    duration_seconds INTEGER
);
CREATE INDEX IF NOT EXISTS idx_course_chapters_course_id ON public.course_chapters(course_id);

-- ============================================================
-- COURSE PROGRESS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_progress (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) REFERENCES public.users(id) ON DELETE CASCADE,
    course_id VARCHAR(36) REFERENCES public.courses(id) ON DELETE CASCADE,
    chapter_index INTEGER,
    video_timestamp DOUBLE PRECISION DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_course_progress_user ON public.course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course ON public.course_progress(course_id);

-- ============================================================
-- QUIZZES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    course_id VARCHAR(36) REFERENCES public.courses(id) ON DELETE CASCADE,
    chapter_index INTEGER,
    questions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quizzes_course ON public.quizzes(course_id);

-- ============================================================
-- QUIZ ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    quiz_id VARCHAR(36) NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    score INTEGER NOT NULL,
    passed BOOLEAN NOT NULL DEFAULT false,
    locked_until TIMESTAMP WITH TIME ZONE,
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON public.quiz_attempts(quiz_id);

-- ============================================================
-- QUIZ RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) REFERENCES public.users(id) ON DELETE CASCADE,
    quiz_id VARCHAR(36) REFERENCES public.quizzes(id) ON DELETE CASCADE,
    score INTEGER,
    total_questions INTEGER,
    answers JSONB DEFAULT '[]'::jsonb,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON public.quiz_results(user_id);

-- ============================================================
-- CERTIFICATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificates (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) REFERENCES public.users(id) ON DELETE CASCADE,
    course_id VARCHAR(36) REFERENCES public.courses(id) ON DELETE CASCADE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    certificate_url VARCHAR(500),
    certificate_number VARCHAR(100) UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON public.certificates(user_id);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    client_id VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    domain VARCHAR(100),
    budget DOUBLE PRECISION,
    status VARCHAR(20) DEFAULT 'open',
    deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON public.projects(client_id);

-- ============================================================
-- APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.applications (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    project_id VARCHAR(36) REFERENCES public.projects(id) ON DELETE CASCADE,
    freelancer_id VARCHAR(36) REFERENCES public.users(id) ON DELETE CASCADE,
    bid_amount DOUBLE PRECISION,
    proposal TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_project ON public.applications(project_id);
CREATE INDEX IF NOT EXISTS idx_applications_freelancer ON public.applications(freelancer_id);

-- ============================================================
-- PROJECT TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_teams (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    project_id VARCHAR(36) REFERENCES public.projects(id) ON DELETE CASCADE,
    lead_freelancer_id VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_members (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    team_id VARCHAR(36) REFERENCES public.project_teams(id) ON DELETE CASCADE,
    user_id VARCHAR(36) REFERENCES public.users(id) ON DELETE CASCADE,
    allocated_budget DOUBLE PRECISION,
    role VARCHAR(100),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    project_id VARCHAR(36) REFERENCES public.projects(id) ON DELETE SET NULL,
    payer_id VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    payee_id VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    amount DOUBLE PRECISION,
    platform_fee DOUBLE PRECISION,
    razorpay_fee DOUBLE PRECISION,
    status VARCHAR(20) DEFAULT 'pending',
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    milestone_index INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- BUG BOUNTIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bug_bounties (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    client_id VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    application_name VARCHAR(255),
    description TEXT,
    scope TEXT,
    reward_amount DOUBLE PRECISION,
    deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- BUG REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    bounty_id VARCHAR(36) REFERENCES public.bug_bounties(id) ON DELETE CASCADE,
    reporter_id VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    vulnerability_type VARCHAR(100),
    severity VARCHAR(20),
    steps_to_reproduce TEXT,
    proof_urls JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'pending',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- CHAT CHANNELS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_channels (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    project_id VARCHAR(36) REFERENCES public.projects(id) ON DELETE SET NULL,
    name VARCHAR(255),
    type VARCHAR(20),
    description TEXT,
    members JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON public.chat_channels(type);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    channel_id VARCHAR(36) REFERENCES public.chat_channels(id) ON DELETE CASCADE,
    sender_id VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON public.chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at ON public.chat_messages(sent_at);

-- ============================================================
-- MESSAGE DELIVERY STATUS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_delivery_status (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    message_id VARCHAR(36) NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    delivered BOOLEAN DEFAULT false,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_msg_delivery_message ON public.message_delivery_status(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_delivery_user ON public.message_delivery_status(user_id);

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    project_id VARCHAR(36) REFERENCES public.projects(id) ON DELETE SET NULL,
    title VARCHAR(255),
    description TEXT,
    event_type VARCHAR(20),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT,
    type VARCHAR(20),
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);

-- ============================================================
-- CONNECTION REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.connection_requests (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    sender_id VARCHAR(36) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    receiver_id VARCHAR(36) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    responded_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_conn_req_sender ON public.connection_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_conn_req_receiver ON public.connection_requests(receiver_id);

-- ============================================================
-- CONNECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.connections (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user1_id VARCHAR(36) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user2_id VARCHAR(36) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connections_user1 ON public.connections(user1_id);
CREATE INDEX IF NOT EXISTS idx_connections_user2 ON public.connections(user2_id);

-- ============================================================
-- ALEMBIC VERSION (for migration tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alembic_version (
    version_num VARCHAR NOT NULL,
    CONSTRAINT alembic_version_pkey PRIMARY KEY (version_num)
);

-- Insert initial version
INSERT INTO public.alembic_version (version_num) VALUES ('initial') ON CONFLICT DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Optional but recommended
-- ============================================================
-- Enable RLS on sensitive tables
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- Grant usage to authenticated users
-- CREATE POLICY "Users can view own data" ON public.users FOR SELECT USING (auth.uid()::text = id);
-- CREATE POLICY "Users can update own data" ON public.users FOR UPDATE USING (auth.uid()::text = id);
