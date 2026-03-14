"""Tests for bundle API endpoints."""
import io
from app.models import Bundle, Finding, generate_uuid
from datetime import datetime


def test_list_bundles_empty(client):
    """GET /bundles returns empty list when no bundles exist."""
    response = client.get("/bundles")
    assert response.status_code == 200
    data = response.json()
    assert data["bundles"] == []


def test_list_bundles_with_data(client, db_session):
    """GET /bundles returns bundles when they exist."""
    bundle = Bundle(
        id=generate_uuid(),
        filename="test-bundle.tar.gz",
        file_size=1024,
        status="completed",
        upload_time=datetime.utcnow(),
    )
    db_session.add(bundle)
    db_session.commit()

    response = client.get("/bundles")
    assert response.status_code == 200
    data = response.json()
    assert len(data["bundles"]) == 1
    assert data["bundles"][0]["filename"] == "test-bundle.tar.gz"
    assert data["bundles"][0]["status"] == "completed"


def test_get_bundle(client, db_session):
    """GET /bundles/{id} returns bundle details."""
    bundle_id = generate_uuid()
    bundle = Bundle(
        id=bundle_id,
        filename="test.tar.gz",
        file_size=2048,
        status="uploaded",
        upload_time=datetime.utcnow(),
    )
    db_session.add(bundle)
    db_session.commit()

    response = client.get(f"/bundles/{bundle_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == bundle_id
    assert data["filename"] == "test.tar.gz"
    assert data["file_size"] == 2048


def test_get_bundle_not_found(client):
    """GET /bundles/{id} returns 404 for non-existent bundle."""
    response = client.get("/bundles/non-existent-id")
    assert response.status_code == 404


def test_upload_bundle(client, sample_bundle_file):
    """POST /bundles/upload accepts .tar.gz files."""
    with open(sample_bundle_file, "rb") as f:
        response = client.post(
            "/bundles/upload",
            files={"file": ("test-bundle.tar.gz", f, "application/gzip")}
        )

    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "test-bundle.tar.gz"
    assert data["status"] == "uploaded"
    assert "id" in data


def test_upload_invalid_file_type(client):
    """POST /bundles/upload rejects non-.tar.gz files."""
    response = client.post(
        "/bundles/upload",
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")}
    )
    assert response.status_code == 400


def test_get_report(client, db_session):
    """GET /bundles/{id}/report returns report with findings."""
    bundle_id = generate_uuid()
    bundle = Bundle(
        id=bundle_id,
        filename="test.tar.gz",
        file_size=1024,
        status="completed",
        upload_time=datetime.utcnow(),
        analysis_start=datetime.utcnow(),
        analysis_end=datetime.utcnow(),
    )
    db_session.add(bundle)

    finding = Finding(
        id=generate_uuid(),
        bundle_id=bundle_id,
        severity="critical",
        category="resource",
        title="OOMKill Detected",
        summary="Container was OOM killed",
        root_cause="Memory limit too low",
        impact="Service down",
        confidence=0.95,
        source="pattern_match",
        recommended_actions=["Increase memory"],
        evidence=[{"type": "log", "source": "test.log", "content": "OOMKilled"}],
    )
    db_session.add(finding)
    db_session.commit()

    response = client.get(f"/bundles/{bundle_id}/report")
    assert response.status_code == 200
    data = response.json()
    assert data["bundle_id"] == bundle_id
    assert data["summary"]["total_findings"] == 1
    assert data["summary"]["by_severity"]["critical"] == 1
    assert len(data["findings"]) == 1
    assert data["findings"][0]["title"] == "OOMKill Detected"


def test_get_report_not_found(client):
    """GET /bundles/{id}/report returns 404 for non-existent bundle."""
    response = client.get("/bundles/non-existent-id/report")
    assert response.status_code == 404


def test_bundle_finding_count(client, db_session):
    """Bundle list includes finding count."""
    bundle_id = generate_uuid()
    bundle = Bundle(
        id=bundle_id,
        filename="test.tar.gz",
        file_size=1024,
        status="completed",
        upload_time=datetime.utcnow(),
    )
    db_session.add(bundle)

    for i in range(3):
        finding = Finding(
            id=generate_uuid(),
            bundle_id=bundle_id,
            severity="high",
            category="resource",
            title=f"Finding {i}",
            confidence=0.8,
            source="pattern_match",
        )
        db_session.add(finding)
    db_session.commit()

    response = client.get("/bundles")
    assert response.status_code == 200
    data = response.json()
    assert data["bundles"][0]["finding_count"] == 3
