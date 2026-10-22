from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/assessment_db"
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str = "change-me-to-a-random-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    GEMINI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    SARVAM_API_KEY: str = ""

    CONTENT_STORAGE_PATH: str = "./data"
    OTP_EXPIRY_SECONDS: int = 300

    # SMTP Email Configuration
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""

    CORS_ORIGINS: List[str] = Field(default=["http://localhost:5173"])

    FIXED_ROOT_FOLDERS: List[str] = Field(
        default=[
            "Subjectwise Content",
            "Examination Content",
            "Job Description-Based",
        ]
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
