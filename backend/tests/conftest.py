"""Test configuration and fixtures."""
import os
import sys
import pytest
import tempfile
import tarfile
import json

# Ensure we're in test mode
os.environ["TESTING"] = "true"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app


SQLALCHEMY_TEST_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_database():
    """Create tables before each test and drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    """Test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def db_session():
    """Database session for direct DB operations in tests."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def sample_bundle_file():
    """Create a sample .tar.gz file for upload tests."""
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        tmpdir = tempfile.mkdtemp()

        # Create sample log files
        logs_dir = os.path.join(tmpdir, "logs")
        os.makedirs(logs_dir)
        with open(os.path.join(logs_dir, "api-server.log"), "w") as f:
            f.write("2024-01-15T10:00:00Z INFO Starting API server\n")
            f.write("2024-01-15T10:02:00Z ERROR OOMKilled: container api-server exceeded memory limit\n")
            f.write("2024-01-15T10:02:02Z WARN CrashLoopBackOff for container api-server\n")

        # Create sample manifests
        manifests_dir = os.path.join(tmpdir, "manifests")
        os.makedirs(manifests_dir)
        with open(os.path.join(manifests_dir, "pods.yaml"), "w") as f:
            f.write("apiVersion: v1\nkind: Pod\nmetadata:\n  name: api-server\nstatus:\n  phase: Failed\n  reason: CrashLoopBackOff\n")

        # Create sample events
        status_dir = os.path.join(tmpdir, "status")
        os.makedirs(status_dir)
        with open(os.path.join(status_dir, "events.json"), "w") as f:
            json.dump({
                "kind": "EventList",
                "items": [
                    {"kind": "Event", "type": "Warning", "reason": "OOMKilling", "message": "Memory cgroup out of memory"}
                ]
            }, f)

        with tarfile.open(tmp.name, "w:gz") as tar:
            for root, dirs, files in os.walk(tmpdir):
                for file in files:
                    full_path = os.path.join(root, file)
                    arcname = os.path.relpath(full_path, tmpdir)
                    tar.add(full_path, arcname=arcname)

        yield tmp.name

    os.unlink(tmp.name)
