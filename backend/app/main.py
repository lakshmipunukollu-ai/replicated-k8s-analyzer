import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
from app.routers import health, bundles, companies, annotations, alerts, patterns_api


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    # Create tables
    Base.metadata.create_all(bind=engine)

    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    yield

    # Cleanup on shutdown (if needed)


app = FastAPI(
    title="Replicated K8s Bundle Analyzer",
    description="AI-powered Kubernetes support bundle analysis tool",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS else ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(bundles.router)
app.include_router(companies.router)
app.include_router(annotations.router)
app.include_router(alerts.router)
app.include_router(patterns_api.router)
