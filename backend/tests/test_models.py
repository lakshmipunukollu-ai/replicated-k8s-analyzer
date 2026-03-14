"""Tests for database models."""
from datetime import datetime
from app.models import Bundle, Finding, AnalysisEvent, generate_uuid


def test_create_bundle(db_session):
    """Can create a bundle record."""
    bundle = Bundle(
        id=generate_uuid(),
        filename="test.tar.gz",
        file_size=1024,
        status="uploaded",
        upload_time=datetime.utcnow(),
    )
    db_session.add(bundle)
    db_session.commit()

    result = db_session.query(Bundle).first()
    assert result is not None
    assert result.filename == "test.tar.gz"
    assert result.status == "uploaded"


def test_create_finding(db_session):
    """Can create a finding linked to a bundle."""
    bundle_id = generate_uuid()
    bundle = Bundle(
        id=bundle_id,
        filename="test.tar.gz",
        file_size=1024,
        status="completed",
        upload_time=datetime.utcnow(),
    )
    db_session.add(bundle)
    db_session.commit()

    finding = Finding(
        id=generate_uuid(),
        bundle_id=bundle_id,
        severity="critical",
        category="resource",
        title="Test Finding",
        confidence=0.9,
        source="pattern_match",
    )
    db_session.add(finding)
    db_session.commit()

    result = db_session.query(Finding).first()
    assert result is not None
    assert result.bundle_id == bundle_id
    assert result.severity == "critical"


def test_create_analysis_event(db_session):
    """Can create an analysis event."""
    bundle_id = generate_uuid()
    bundle = Bundle(
        id=bundle_id,
        filename="test.tar.gz",
        file_size=1024,
        status="analyzing",
        upload_time=datetime.utcnow(),
    )
    db_session.add(bundle)
    db_session.commit()

    event = AnalysisEvent(
        id=generate_uuid(),
        bundle_id=bundle_id,
        event_type="progress",
        data={"step": "extracting", "progress": 10},
        sequence=1,
    )
    db_session.add(event)
    db_session.commit()

    result = db_session.query(AnalysisEvent).first()
    assert result is not None
    assert result.event_type == "progress"
    assert result.data["step"] == "extracting"


def test_bundle_findings_relationship(db_session):
    """Bundle has findings relationship."""
    bundle_id = generate_uuid()
    bundle = Bundle(
        id=bundle_id,
        filename="test.tar.gz",
        file_size=1024,
        status="completed",
        upload_time=datetime.utcnow(),
    )
    db_session.add(bundle)
    db_session.commit()

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

    db_session.refresh(bundle)
    assert len(bundle.findings) == 3


def test_generate_uuid():
    """generate_uuid produces valid UUIDs."""
    uuid1 = generate_uuid()
    uuid2 = generate_uuid()
    assert len(uuid1) == 36
    assert uuid1 != uuid2
