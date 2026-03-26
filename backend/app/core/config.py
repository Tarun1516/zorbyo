from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "ZORBYO"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 4000

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Database (Supabase PostgreSQL)
    DATABASE_URL: str = "sqlite+aiosqlite:///./zorbyo.db"

    # Redis (optional for development)
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    SECRET_KEY: str = "your-supabase-jwt-secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI (OpenRouter)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "arcee-ai/trinity-large-preview:free"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET_NAME: str = "zorbyo"
    MINIO_SECURE: bool = False

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:19006",
        "http://localhost:3000",
        "http://localhost:8081",
    ]

    # Platform Fees
    STUDENT_FEE_PERCENTAGE: float = 3.0
    FREELANCER_FEE_PERCENTAGE: float = 5.0

    # Account Lockout
    LOCKOUT_HOURS: int = 72

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
