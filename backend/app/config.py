import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root first, then backend dir
project_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(project_root / ".env")
load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/k8s_analyzer")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    TESTING: bool = os.getenv("TESTING", "false").lower() == "true"
    # S3 (Railway / production)
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_S3_BUCKET: str = os.getenv("AWS_S3_BUCKET", "")
    AWS_S3_REGION: str = os.getenv("AWS_S3_REGION", "us-east-1")
    USE_S3: bool = os.getenv("USE_S3", "false").lower() == "true"


settings = Settings()
