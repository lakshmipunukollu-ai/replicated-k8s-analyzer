import os
import json
import asyncio
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bundle, Finding, AnalysisEvent, generate_uuid
from app.schemas import (
    BundleResponse, BundleListResponse, ReportResponse,
    ReportSummary, FindingResponse, AnalyzeResponse
)
from app.services.analyzer import BundleAnalyzer
from app.config import settings

router = APIRouter(prefix="/bundles", tags=["bundles"])


@router.post("/upload", status_code=201)
def upload_bundle(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a support bundle .tar.gz file."""
    # Validate file type
    if not file.filename or not (
        file.filename.endswith(".tar.gz") or
        file.filename.endswith(".tgz") or
        file.filename.endswith(".gz")
    ):
        raise HTTPException(
            status_code=400,
            detail="Only .tar.gz files are accepted"
        )

    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Save file
    bundle_id = generate_uuid()
    file_path = os.path.join(settings.UPLOAD_DIR, f"{bundle_id}_{file.filename}")

    try:
        content = file.file.read()
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Create bundle record
    bundle = Bundle(
        id=bundle_id,
        filename=file.filename,
        file_size=len(content),
        file_path=file_path,
        status="uploaded",
        upload_time=datetime.utcnow()
    )
    db.add(bundle)
    db.commit()
    db.refresh(bundle)

    return {
        "id": bundle.id,
        "filename": bundle.filename,
        "file_size": bundle.file_size,
        "status": bundle.status,
        "upload_time": bundle.upload_time.isoformat()
    }


@router.get("", response_model=BundleListResponse)
def list_bundles(db: Session = Depends(get_db)):
    """List all uploaded bundles."""
    bundles = db.query(Bundle).order_by(Bundle.upload_time.desc()).all()

    bundle_list = []
    for b in bundles:
        finding_count = db.query(Finding).filter(Finding.bundle_id == b.id).count()
        bundle_list.append(BundleResponse(
            id=b.id,
            filename=b.filename,
            file_size=b.file_size or 0,
            status=b.status,
            upload_time=b.upload_time,
            analysis_start=b.analysis_start,
            analysis_end=b.analysis_end,
            error_message=b.error_message,
            finding_count=finding_count
        ))

    return BundleListResponse(bundles=bundle_list)


@router.get("/{bundle_id}")
def get_bundle(bundle_id: str, db: Session = Depends(get_db)):
    """Get bundle details."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    finding_count = db.query(Finding).filter(Finding.bundle_id == bundle_id).count()

    return {
        "id": bundle.id,
        "filename": bundle.filename,
        "file_size": bundle.file_size,
        "status": bundle.status,
        "upload_time": bundle.upload_time.isoformat() if bundle.upload_time else None,
        "analysis_start": bundle.analysis_start.isoformat() if bundle.analysis_start else None,
        "analysis_end": bundle.analysis_end.isoformat() if bundle.analysis_end else None,
        "error_message": bundle.error_message,
        "finding_count": finding_count
    }


@router.post("/{bundle_id}/analyze", response_model=AnalyzeResponse)
async def analyze_bundle(
    bundle_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Trigger analysis for an uploaded bundle."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    if bundle.status not in ("uploaded", "failed"):
        raise HTTPException(
            status_code=400,
            detail=f"Bundle is already {bundle.status}"
        )

    # Start analysis in background
    background_tasks.add_task(_run_analysis, bundle_id, bundle.file_path)

    bundle.status = "analyzing"
    db.commit()

    return AnalyzeResponse(
        bundle_id=bundle_id,
        status="analyzing",
        message="Analysis started"
    )


async def _run_analysis(bundle_id: str, file_path: str):
    """Run analysis in background."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        analyzer = BundleAnalyzer()
        await analyzer.analyze(bundle_id, file_path, db)
    except Exception as e:
        bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
        if bundle:
            bundle.status = "failed"
            bundle.error_message = str(e)
            db.commit()
    finally:
        db.close()


@router.get("/{bundle_id}/status")
async def stream_status(bundle_id: str, db: Session = Depends(get_db)):
    """Stream analysis progress via Server-Sent Events."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    async def event_generator():
        last_sequence = 0

        while True:
            # Get new events since last check
            from app.database import SessionLocal
            session = SessionLocal()
            try:
                events = session.query(AnalysisEvent).filter(
                    AnalysisEvent.bundle_id == bundle_id,
                    AnalysisEvent.sequence > last_sequence
                ).order_by(AnalysisEvent.sequence.asc()).all()

                for event in events:
                    data = json.dumps(event.data)
                    yield f"event: {event.event_type}\ndata: {data}\n\n"
                    last_sequence = event.sequence

                    if event.event_type == "complete":
                        return

                # Check if bundle is already completed/failed
                current_bundle = session.query(Bundle).filter(
                    Bundle.id == bundle_id
                ).first()

                if current_bundle and current_bundle.status in ("completed", "failed"):
                    if not events:  # No new events but bundle is done
                        if current_bundle.status == "failed":
                            yield f"event: error\ndata: {json.dumps({'message': current_bundle.error_message or 'Analysis failed'})}\n\n"
                        else:
                            findings_count = session.query(Finding).filter(
                                Finding.bundle_id == bundle_id
                            ).count()
                            yield f"event: complete\ndata: {json.dumps({'total_findings': findings_count})}\n\n"
                        return
            finally:
                session.close()

            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/{bundle_id}/report", response_model=ReportResponse)
def get_report(bundle_id: str, db: Session = Depends(get_db)):
    """Get full analysis report for a bundle."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    findings = db.query(Finding).filter(
        Finding.bundle_id == bundle_id
    ).all()

    # Calculate duration
    duration = None
    if bundle.analysis_start and bundle.analysis_end:
        duration = (bundle.analysis_end - bundle.analysis_start).total_seconds()

    # Build severity and category counts
    severity_counts = {}
    category_counts = {}
    for f in findings:
        severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1
        category_counts[f.category] = category_counts.get(f.category, 0) + 1

    finding_responses = [
        FindingResponse(
            id=f.id,
            bundle_id=f.bundle_id,
            severity=f.severity,
            category=f.category,
            title=f.title,
            summary=f.summary,
            root_cause=f.root_cause,
            impact=f.impact,
            confidence=f.confidence,
            source=f.source,
            recommended_actions=f.recommended_actions or [],
            related_findings=f.related_findings or [],
            evidence=f.evidence or []
        )
        for f in findings
    ]

    # Sort by severity
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    finding_responses.sort(key=lambda f: severity_order.get(f.severity, 4))

    return ReportResponse(
        bundle_id=bundle_id,
        status=bundle.status,
        summary=ReportSummary(
            total_findings=len(findings),
            by_severity=severity_counts,
            by_category=category_counts,
            analysis_duration_seconds=duration
        ),
        findings=finding_responses
    )
