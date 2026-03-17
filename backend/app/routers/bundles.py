import os
import re
import json
import asyncio
import requests as http_requests
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bundle, Finding, AnalysisEvent, AnalysisVersion, SearchIndex, Company, Project, SuppressionRule, generate_uuid
from app.schemas import (
    BundleResponse, BundleListResponse, ReportResponse,
    ReportSummary, FindingResponse, AnalyzeResponse, TriageUpdate
)
from app.services.chat_service import BundleChatService
from app.services.timeline_service import TimelineService
from app.services.playbook_service import PlaybookService
from app.services.comparison_service import BundleComparisonService
from app.config import settings
import anthropic

router = APIRouter(prefix="/bundles", tags=["bundles"])


def _evidence_str(evidence) -> str:
    if not evidence:
        return ""
    if isinstance(evidence, list):
        parts = []
        for x in evidence[:5]:
            if isinstance(x, dict):
                parts.append(str(x.get("content") or x.get("source") or x))
            else:
                parts.append(str(x))
        return " ".join(parts)
    return str(evidence)


@router.post("/upload", status_code=201)
def upload_bundle(
    file: UploadFile = File(...),
    company_id: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    app_version: Optional[str] = Form(None),
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
        upload_time=datetime.utcnow(),
        company_id=company_id,
        project_id=project_id,
        app_version=app_version,
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


@router.post("/intake-url", status_code=201)
def intake_bundle_from_url(
    body: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Import a bundle from a URL (e.g. presigned S3). Downloads file, creates bundle, triggers analysis."""
    url = (body.get("url") or "").strip()
    if not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="URL must start with https://")

    filename = (body.get("filename") or "").strip()
    if not filename:
        parsed = urlparse(url)
        filename = os.path.basename(parsed.path) or "bundle.tar.gz"
    if not (filename.endswith(".tar.gz") or filename.endswith(".tgz") or filename.endswith(".gz")):
        filename = filename + ".tar.gz" if not filename.endswith(".gz") else filename

    company_id = body.get("company_id")
    project_id = body.get("project_id")
    app_version = body.get("app_version")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    bundle_id = generate_uuid()
    file_path = os.path.join(settings.UPLOAD_DIR, f"{bundle_id}_{filename}")

    try:
        resp = http_requests.get(url, stream=True, timeout=30)
        resp.raise_for_status()
        with open(file_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        file_size = os.path.getsize(file_path)
    except Exception as e:
        if os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=f"Failed to download file: {str(e)}")

    bundle = Bundle(
        id=bundle_id,
        filename=filename,
        file_size=file_size,
        file_path=file_path,
        status="uploaded",
        upload_time=datetime.utcnow(),
        company_id=company_id,
        project_id=project_id,
        app_version=app_version,
    )
    db.add(bundle)
    db.commit()
    db.refresh(bundle)

    background_tasks.add_task(run_analysis, bundle_id)

    return {
        "id": bundle.id,
        "filename": bundle.filename,
        "file_size": bundle.file_size,
        "status": bundle.status,
        "upload_time": bundle.upload_time.isoformat()
    }


@router.get("", response_model=BundleListResponse)
def list_bundles(
    company_id: Optional[str] = None,
    project_id: Optional[str] = None,
    include_archived: bool = False,
    db: Session = Depends(get_db)
):
    """List bundles, optionally filtered by company_id, project_id. By default excludes archived; use include_archived=true to list only archived."""
    q = db.query(Bundle).order_by(Bundle.upload_time.desc())
    if company_id:
        q = q.filter(Bundle.company_id == company_id)
    if project_id:
        q = q.filter(Bundle.project_id == project_id)
    if include_archived:
        q = q.filter(Bundle.status == "archived")
    else:
        q = q.filter(Bundle.status != "archived")
    bundles = q.all()

    bundle_list = []
    for b in bundles:
        finding_count = db.query(Finding).filter(Finding.bundle_id == b.id).count()
        company_name = None
        project_name = None
        if b.company_id:
            company = db.query(Company).filter(Company.id == b.company_id).first()
            company_name = company.name if company else None
        if b.project_id:
            project = db.query(Project).filter(Project.id == b.project_id).first()
            project_name = project.name if project else None
        bundle_list.append(BundleResponse(
            id=b.id,
            filename=b.filename,
            file_size=b.file_size or 0,
            status=b.status,
            upload_time=b.upload_time,
            analysis_start=b.analysis_start,
            analysis_end=b.analysis_end,
            error_message=b.error_message,
            finding_count=finding_count,
            company_id=b.company_id,
            project_id=b.project_id,
            company_name=company_name,
            project_name=project_name,
            triage_status=b.triage_status,
            assigned_to=b.assigned_to,
            assigned_at=b.assigned_at,
            resolved_at=b.resolved_at,
        ))

    return BundleListResponse(bundles=bundle_list)


@router.patch("/{bundle_id}/archive")
def archive_bundle(bundle_id: str, db: Session = Depends(get_db)):
    """Set bundle status to archived and store previous status for restore."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    bundle.previous_status = bundle.status
    bundle.status = "archived"
    db.commit()
    db.refresh(bundle)
    return {"id": bundle.id, "status": bundle.status, "previous_status": bundle.previous_status}


@router.patch("/{bundle_id}/restore")
def restore_bundle(bundle_id: str, db: Session = Depends(get_db)):
    """Restore bundle status from previous_status (e.g. after unarchiving)."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if bundle.status != "archived":
        raise HTTPException(status_code=400, detail="Bundle is not archived")
    bundle.status = bundle.previous_status or "uploaded"
    bundle.previous_status = None
    db.commit()
    db.refresh(bundle)
    return {"id": bundle.id, "status": bundle.status}


@router.delete("/{bundle_id}")
def delete_bundle(bundle_id: str, db: Session = Depends(get_db)):
    """Permanently delete a bundle and its findings."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    db.delete(bundle)
    db.commit()
    return {"deleted": True, "id": bundle_id}


@router.get("/search")
def search_findings(q: str, db: Session = Depends(get_db)):
    """Search across all bundle findings."""
    if not q or len(q) < 2:
        return {"query": q, "results": [], "total": 0}

    query_lower = q.lower()
    terms = query_lower.split()

    all_findings = db.query(Finding).all()
    results = []

    for finding in all_findings:
        bundle = db.query(Bundle).filter(Bundle.id == finding.bundle_id).first()
        if not bundle or bundle.status != "completed":
            continue

        searchable = f"{finding.title} {finding.summary or ''} {finding.root_cause or ''}".lower()

        matched_terms = [t for t in terms if t in searchable]
        if not matched_terms:
            continue

        score = len(matched_terms) / len(terms)

        def highlight(text: str) -> str:
            if not text:
                return ""
            for term in terms:
                text = re.sub(r"(" + re.escape(term) + r")", r"**\1**", text, flags=re.IGNORECASE)
            return text

        desc = (finding.summary or "")[:150]
        if len(finding.summary or "") > 150:
            desc += "..."

        results.append({
            "finding_id": finding.id,
            "bundle_id": finding.bundle_id,
            "bundle_name": bundle.ai_name or bundle.filename,
            "filename": bundle.filename,
            "title": finding.title,
            "title_highlighted": highlight(finding.title),
            "description_highlighted": highlight(desc),
            "severity": finding.severity,
            "score": score,
            "upload_time": bundle.upload_time.isoformat() if bundle.upload_time else None,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"query": q, "results": results[:20], "total": len(results)}


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


VALID_TRIAGE_STATUSES = ("unassigned", "open", "in_progress", "resolved")


@router.patch("/{bundle_id}/triage")
def update_bundle_triage(
    bundle_id: str,
    body: TriageUpdate,
    db: Session = Depends(get_db)
):
    """Update bundle triage status and/or assigned_to. Valid statuses: unassigned, open, in_progress, resolved."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    triage_status = body.triage_status
    assigned_to = body.assigned_to
    if triage_status is not None:
        if triage_status not in VALID_TRIAGE_STATUSES:
            raise HTTPException(status_code=400, detail=f"triage_status must be one of {VALID_TRIAGE_STATUSES}")
        prev = bundle.triage_status or "unassigned"
        bundle.triage_status = triage_status
        if prev == "unassigned" and triage_status in ("open", "in_progress"):
            bundle.assigned_at = datetime.utcnow()
        if triage_status == "resolved":
            bundle.resolved_at = datetime.utcnow()
    if assigned_to is not None:
        bundle.assigned_to = assigned_to
    db.commit()
    db.refresh(bundle)
    return {
        "id": bundle.id,
        "triage_status": bundle.triage_status,
        "assigned_to": bundle.assigned_to,
        "assigned_at": bundle.assigned_at.isoformat() if bundle.assigned_at else None,
        "resolved_at": bundle.resolved_at.isoformat() if bundle.resolved_at else None,
    }


@router.post("/{bundle_id}/analyze", response_model=AnalyzeResponse)
def analyze_bundle(
    bundle_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Trigger AI analysis of a support bundle."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if bundle.status not in ("uploaded", "failed"):
        raise HTTPException(status_code=400, detail=f"Bundle is already {bundle.status}")

    bundle.status = "analyzing"
    bundle.analysis_start = datetime.utcnow()
    db.commit()

    background_tasks.add_task(run_analysis, bundle_id)

    return AnalyzeResponse(bundle_id=bundle_id, status="analyzing", message="Analysis started")


def run_analysis(bundle_id: str):
    """Background task that actually runs the analysis."""
    from app.database import SessionLocal
    from app.services.analyzer import BundleAnalyzer

    db = SessionLocal()
    try:
        bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
        if not bundle:
            return
        analyzer = BundleAnalyzer()
        asyncio.run(analyzer.analyze(bundle_id, bundle.file_path, db))
        bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
        if bundle and bundle.status == "completed":
            bundle.summary = None  # clear any stale cached value
            db.commit()
            from app.services.alert_evaluator import AlertEvaluator
            AlertEvaluator().evaluate_bundle(bundle_id, db)
        # The next GET /summary call will regenerate fresh
    except Exception as e:
        bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
        if bundle:
            bundle.status = "failed"
            bundle.error_message = str(e)
            db.commit()
    finally:
        db.close()


@router.get("/{bundle_id}/analyze/stream")
def stream_analysis(bundle_id: str, db: Session = Depends(get_db)):
    """Stream analysis findings as SSE events as they are discovered."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    def generate():
        from app.services.extractor import BundleExtractor
        from app.services.signal_extractor import SignalExtractor

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        extractor = BundleExtractor()
        signal_extractor = SignalExtractor()

        bundle.status = "analyzing"
        bundle.analysis_start = datetime.utcnow()
        db.commit()

        yield f"data: {json.dumps({'type': 'status', 'message': 'Extracting bundle contents...'})}\n\n"

        bundle_data = extractor.extract(bundle.file_path)
        signals = signal_extractor.extract(bundle_data)
        total_files = bundle_data["total_files"]
        yield f"data: {json.dumps({'type': 'status', 'message': f'Found {total_files} files — scanning for failure patterns...'})}\n\n"

        log_content = ""
        for log_path in bundle_data["files"]["logs"][:5]:
            content = extractor.read_file(log_path, max_lines=200)
            if content:
                log_content += f"\n--- {log_path} ---\n{content}"

        status_content = ""
        for status_path in bundle_data["files"]["status"][:3]:
            content = extractor.read_file(status_path, max_lines=100)
            if content:
                status_content += f"\n--- {status_path} ---\n{content}"

        yield f"data: {json.dumps({'type': 'status', 'message': 'Running AI analysis — findings will appear as discovered...'})}\n\n"

        prompt = f"""You are an expert Kubernetes SRE analyzing a support bundle. Analyze this data and identify issues.

SIGNALS DETECTED:
{json.dumps(signals, indent=2)}

LOG EXCERPTS:
{log_content[:3000]}

STATUS DATA:
{status_content[:2000]}

Output EXACTLY this JSON format for each finding, one per line, with NO other text:
{{"title":"...","severity":"critical|high|medium|low","description":"...","root_cause":"...","impact":"...","recommended_actions":["..."],"evidence":"...","confidence":0.95,"categories":["resource"]}}

Output 3-6 findings. Each finding on its own line. Nothing else."""

        try:
            with client.messages.stream(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            ) as stream:
                buffer = ""
                for text in stream.text_stream:
                    buffer += text
                    lines = buffer.split("\n")
                    buffer = lines[-1]
                    for line in lines[:-1]:
                        line = line.strip()
                        if line.startswith("{") and line.endswith("}"):
                            try:
                                finding_data = json.loads(line)
                                categories = finding_data.get("categories")
                                category = (categories[0] if isinstance(categories, list) and categories else "other")
                                evidence_val = finding_data.get("evidence", "")
                                evidence_list = [evidence_val] if isinstance(evidence_val, str) else (evidence_val if isinstance(evidence_val, list) else [])

                                finding = Finding(
                                    id=generate_uuid(),
                                    bundle_id=bundle_id,
                                    title=finding_data.get("title", "Unknown"),
                                    severity=finding_data.get("severity", "medium"),
                                    category=category,
                                    summary=finding_data.get("description") or finding_data.get("summary", ""),
                                    root_cause=finding_data.get("root_cause", ""),
                                    impact=finding_data.get("impact", ""),
                                    recommended_actions=finding_data.get("recommended_actions", []),
                                    evidence=evidence_list,
                                    confidence=float(finding_data.get("confidence", 0.8)),
                                    source="llm",
                                )
                                db.add(finding)
                                db.commit()
                                yield f"data: {json.dumps({'type': 'finding', 'finding': finding_data})}\n\n"
                            except (json.JSONDecodeError, TypeError, ValueError):
                                pass

            bundle.status = "completed"
            bundle.analysis_end = datetime.utcnow()
            db.commit()
        except Exception as e:
            bundle.status = "failed"
            bundle.error_message = str(e)
            db.commit()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
        yield f"data: {json.dumps({'type': 'complete', 'bundle_id': bundle_id, 'total': len(findings)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


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


def _get_active_suppression_patterns(company_id: Optional[str], db: Session) -> list:
    """Load active suppression patterns for a company (company-specific + global)."""
    q = db.query(SuppressionRule).filter(SuppressionRule.is_active == True)
    q = q.filter((SuppressionRule.company_id == company_id) | (SuppressionRule.company_id.is_(None)))
    rules = q.all()
    return [r.pattern.strip().lower() for r in rules if r.pattern]


@router.get("/{bundle_id}/report", response_model=ReportResponse)
def get_report(bundle_id: str, db: Session = Depends(get_db)):
    """Get full analysis report for a bundle. Suppressed findings are excluded."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    findings = db.query(Finding).filter(
        Finding.bundle_id == bundle_id
    ).all()

    # Apply suppression: exclude findings whose title matches any active rule (case-insensitive)
    patterns = _get_active_suppression_patterns(bundle.company_id, db)
    if patterns:
        visible = []
        for f in findings:
            title_lower = (f.title or "").lower()
            if not any(p in title_lower for p in patterns):
                visible.append(f)
        suppressed_count = len(findings) - len(visible)
        findings = visible
    else:
        suppressed_count = 0

    # Calculate duration
    duration = None
    if bundle.analysis_start and bundle.analysis_end:
        duration = (bundle.analysis_end - bundle.analysis_start).total_seconds()

    # Build severity and category counts from visible findings only
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
            analysis_duration_seconds=duration,
            suppressed_count=suppressed_count,
        ),
        findings=finding_responses
    )


@router.get("/{bundle_id}/customer-report")
def get_customer_report(bundle_id: str, db: Session = Depends(get_db)):
    """Return a clean HTML report for the customer. No internal notes, annotations, or confidence."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    patterns = _get_active_suppression_patterns(bundle.company_id, db)
    if patterns:
        findings = [f for f in findings if not any(p in (f.title or "").lower() for p in patterns)]

    severity_order = ["critical", "high", "medium", "low", "info"]
    findings_sorted = sorted(findings, key=lambda f: severity_order.index(f.severity) if f.severity in severity_order else 99)

    critical = len([f for f in findings if f.severity == "critical"])
    high = len([f for f in findings if f.severity == "high"])
    health_score = max(0, 100 - critical * 25 - high * 10 - len(findings) * 3)
    health_color = "#10b981" if health_score >= 70 else "#f59e0b" if health_score >= 40 else "#ef4444"

    summary_text = bundle.summary or (
        f"This report summarizes {len(findings)} finding(s) from the Kubernetes support bundle. "
        f"Cluster health score is {health_score}/100. "
        + ("Address critical and high severity items first." if critical or high else "No critical or high severity issues were identified.")
    )

    profile = bundle.cluster_profile or {}
    k8s_version = profile.get("k8s_version") or "N/A"
    node_count = profile.get("node_count") or "N/A"
    provider = profile.get("cloud_provider") or "N/A"

    all_actions = []
    for f in findings_sorted:
        for a in (f.recommended_actions or []):
            if a and a not in all_actions:
                all_actions.append(a)
    next_steps = all_actions[:3]

    findings_html = ""
    for f in findings_sorted:
        actions_list = "".join(f"<li>{a}</li>" for a in (f.recommended_actions or [])[:5])
        findings_html += f"""
        <div style="margin-bottom: 1.25rem; padding: 1rem; background: #f8fafc; border-radius: 8px; border-left: 4px solid {'#ef4444' if f.severity == 'critical' else '#f59e0b' if f.severity == 'high' else '#6366f1' if f.severity == 'medium' else '#64748b'};">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">{f.title or 'Finding'}</h3>
          <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: #475569;">{f.summary or ''}</p>
          <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem;"><strong>Impact:</strong> {f.impact or 'N/A'}</p>
          <p style="margin: 0; font-size: 0.875rem;"><strong>Recommended actions:</strong></p>
          <ul style="margin: 0.25rem 0 0 1.25rem; font-size: 0.875rem;">{actions_list or '<li>None specified</li>'}</ul>
        </div>
        """

    next_steps_html = "".join(f"<li>{a}</li>" for a in next_steps) if next_steps else "<li>Review findings above and address by priority.</li>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kubernetes Cluster Health Report — {bundle.filename}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #1e293b; max-width: 720px; margin: 0 auto; padding: 2rem; background: #fff; }}
    .header {{ border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.5rem; }}
    .logo {{ width: 120px; height: 40px; background: #f1f5f9; border-radius: 6px; margin-bottom: 0.5rem; }}
    h1 {{ font-size: 1.5rem; margin: 0 0 0.25rem 0; }}
    .meta {{ font-size: 0.875rem; color: #64748b; }}
    .score {{ font-size: 2.5rem; font-weight: 700; margin: 1rem 0; }}
    .profile p {{ margin: 0.25rem 0; font-size: 0.875rem; }}
    .footer {{ margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #94a3b8; }}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo"></div>
    <h1>Kubernetes Cluster Health Report</h1>
    <p class="meta">Date: {datetime.utcnow().strftime('%Y-%m-%d')} · Bundle: {bundle.filename}</p>
  </div>

  <section style="margin-bottom: 1.5rem;">
    <h2 style="font-size: 1.125rem; margin-bottom: 0.5rem;">Executive Summary</h2>
    <p style="font-size: 0.9375rem; color: #475569;">{summary_text}</p>
  </section>

  <section style="margin-bottom: 1.5rem;">
    <h2 style="font-size: 1.125rem; margin-bottom: 0.5rem;">Cluster Profile</h2>
    <div class="profile">
      <p><strong>Kubernetes version:</strong> {k8s_version}</p>
      <p><strong>Nodes:</strong> {node_count}</p>
      <p><strong>Provider:</strong> {provider}</p>
    </div>
  </section>

  <section style="margin-bottom: 1.5rem;">
    <h2 style="font-size: 1.125rem; margin-bottom: 0.5rem;">Health Score</h2>
    <p class="score" style="color: {health_color};">{health_score}/100</p>
  </section>

  <section style="margin-bottom: 1.5rem;">
    <h2 style="font-size: 1.125rem; margin-bottom: 0.75rem;">Findings by Severity</h2>
    {findings_html}
  </section>

  <section style="margin-bottom: 1.5rem;">
    <h2 style="font-size: 1.125rem; margin-bottom: 0.5rem;">Next Steps</h2>
    <ul style="font-size: 0.9375rem;">{next_steps_html}</ul>
  </section>

  <div class="footer">
    Report generated by Kubernetes Bundle Analyzer
  </div>
</body>
</html>
"""
    return Response(content=html, media_type="text/html")


def _evidence_skip_path(fp: str) -> bool:
    """True if path should be skipped (Mac junk, etc.)."""
    fp_norm = fp.replace(os.sep, "/")
    if ".__" in fp_norm or ".DS_Store" in fp_norm or "__MACOSX" in fp_norm:
        return True
    return False


def _evidence_is_binary(file_path: str) -> bool:
    """True if file appears binary (null byte in first 512 bytes)."""
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(512)
        return b"\x00" in chunk
    except Exception:
        return True


def _evidence_priority_key(file_path: str) -> tuple:
    """Sort key: (tier, subtier, path). Prefer cluster-resources, then .log/.json/.txt; among those prefer nginx.log/previous.log."""
    fp_norm = file_path.replace(os.sep, "/")
    if "cluster-resources/" in fp_norm:
        tier = 0
    elif fp_norm.endswith(".json") or fp_norm.endswith(".log") or fp_norm.endswith(".txt"):
        tier = 1
    else:
        tier = 2
    # Prefer .log over .json/.txt; among .log prefer nginx.log or previous.log
    if fp_norm.endswith(".log"):
        subtier = 0 if ("/nginx.log" in fp_norm or "/previous.log" in fp_norm or fp_norm.endswith("/nginx.log") or fp_norm.endswith("/previous.log")) else 1
    elif tier == 1:
        subtier = 2
    else:
        subtier = 2
    return (tier, subtier, fp_norm)


@router.get("/{bundle_id}/evidence")
def get_evidence_file(bundle_id: str, path: str, db: Session = Depends(get_db)):
    """Read a file from the bundle by path (from evidence list). Returns path, content, and lines."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    from app.services.extractor import BundleExtractor
    extractor = BundleExtractor(settings.UPLOAD_DIR)
    try:
        bundle_data = extractor.extract(bundle.file_path)
    except Exception:
        return {"path": path.strip(), "content": "", "lines": [], "error": "File not found"}
    files_by_category = bundle_data.get("files") or {}
    all_files = []
    for key in ("logs", "status", "events", "manifests", "other"):
        all_files.extend(files_by_category.get(key) or [])
    path_clean = path.strip().lstrip("/").replace("\\", "/")
    if ".." in path_clean:
        return {"path": path_clean, "content": "", "lines": [], "error": "File not found"}
    path_basename = os.path.basename(path_clean)
    path_segments = [s for s in path_clean.split("/") if s]
    seen = set()
    all_matches = []
    for fp in all_files:
        fp_norm = fp.replace(os.sep, "/")
        if path_clean and fp_norm == path_clean and fp not in seen:
            seen.add(fp)
            all_matches.append(fp)
    for fp in all_files:
        fp_norm = fp.replace(os.sep, "/")
        if path_clean and (fp_norm.endswith(path_clean) or fp_norm.endswith("/" + path_clean)) and fp not in seen:
            seen.add(fp)
            all_matches.append(fp)
    if path_clean:
        for fp in all_files:
            fp_norm = fp.replace(os.sep, "/")
            if path_clean in fp_norm and fp not in seen:
                seen.add(fp)
                all_matches.append(fp)
    if path_basename:
        for fp in all_files:
            fp_base = os.path.basename(fp)
            if (fp_base == path_basename or fp_base.startswith(path_basename)) and fp not in seen:
                seen.add(fp)
                all_matches.append(fp)
    if path_segments:
        for fp in all_files:
            fp_norm = fp.replace(os.sep, "/")
            if all(seg in fp_norm for seg in path_segments) and fp not in seen:
                seen.add(fp)
                all_matches.append(fp)
    # f) Pod name: last path segment; find any file whose path contains that segment
    pod_name = path_segments[-1] if path_segments else ""
    if pod_name:
        for fp in all_files:
            fp_norm = fp.replace(os.sep, "/")
            if pod_name in fp_norm and fp not in seen:
                seen.add(fp)
                all_matches.append(fp)
    # g) If path_clean starts with "events/", strip prefix and search for files containing remainder
    if path_clean.startswith("events/"):
        remainder = path_clean[7:].lstrip("/")
        if remainder:
            for fp in all_files:
                fp_norm = fp.replace(os.sep, "/")
                if remainder in fp_norm and fp not in seen:
                    seen.add(fp)
                    all_matches.append(fp)
    filtered = []
    for fp in all_matches:
        if _evidence_skip_path(fp):
            continue
        if not os.path.isfile(fp):
            continue
        if _evidence_is_binary(fp):
            continue
        filtered.append(fp)
    filtered.sort(key=_evidence_priority_key)
    resolved_path = filtered[0] if filtered else None
    print(f"[evidence] looking for: '{path_clean}'")
    print(f"[evidence] total indexed files: {len(all_files)}")
    print(f"[evidence] sample paths: {all_files[:5]}")
    print(f"[evidence] all matches found: {all_matches[:10]}")
    print(f"[evidence] chose: {resolved_path}")
    if not resolved_path:
        return {
            "path": path_clean,
            "content": "",
            "lines": [],
            "error": f"File not found. Searched {len(all_files)} files.",
        }
    content = extractor.read_file(resolved_path, max_lines=50)
    if content is None:
        return {"path": path_clean, "content": "", "lines": [], "error": "File not found"}
    if "\x00" in content:
        return {"path": path_clean, "content": "", "lines": [], "error": "File contains binary data, cannot display"}
    lines = content.split("\n")
    return {"path": path_clean, "content": content, "lines": lines}


@router.post("/compare")
def compare_bundles(
    body: dict,
    db: Session = Depends(get_db)
):
    """Compare two bundles and return a diff of findings."""
    bundle_a_id = body.get("bundle_a_id")
    bundle_b_id = body.get("bundle_b_id")
    if not bundle_a_id or not bundle_b_id:
        raise HTTPException(status_code=400, detail="Both bundle_a_id and bundle_b_id required")
    bundle_a = db.query(Bundle).filter(Bundle.id == bundle_a_id).first()
    bundle_b = db.query(Bundle).filter(Bundle.id == bundle_b_id).first()
    if not bundle_a or not bundle_b:
        raise HTTPException(status_code=404, detail="One or both bundles not found")
    findings_a = db.query(Finding).filter(Finding.bundle_id == bundle_a_id).all()
    findings_b = db.query(Finding).filter(Finding.bundle_id == bundle_b_id).all()
    service = BundleComparisonService()
    result = service.compare(bundle_a, bundle_b, findings_a, findings_b)
    return result


@router.post("/{bundle_id}/chat")
def chat_with_bundle(
    bundle_id: str,
    body: dict,
    db: Session = Depends(get_db)
):
    """Ask AI questions about a specific bundle."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    question = body.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    service = BundleChatService()
    answer = service.answer(bundle, findings, question)
    return {"answer": answer, "bundle_id": bundle_id}


@router.get("/{bundle_id}/timeline")
def get_bundle_timeline(
    bundle_id: str,
    db: Session = Depends(get_db)
):
    """Get reconstructed incident timeline from bundle logs."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    service = TimelineService()
    events = service.build_timeline(bundle, findings)
    return {"bundle_id": bundle_id, "events": events}


@router.get("/{bundle_id}/playbook")
def get_remediation_playbook(
    bundle_id: str,
    db: Session = Depends(get_db)
):
    """Generate kubectl remediation playbook for all findings."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    service = PlaybookService()
    playbook = service.generate(bundle, findings)
    return {"bundle_id": bundle_id, "playbook": playbook}


@router.get("/{bundle_id}/summary")
def get_bundle_summary(bundle_id: str, db: Session = Depends(get_db)):
    """Get bundle summary (cached on Bundle if available, else generate via Claude and cache)."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()

    critical_count = len([f for f in findings if f.severity == 'critical'])
    high_count = len([f for f in findings if f.severity == 'high'])
    health_score = max(0, 100 - (critical_count * 25) - (high_count * 10) - (len(findings) * 3))

    if bundle.summary and bundle.status == "completed" and len(findings) > 0:
        return {
            "bundle_id": bundle_id,
            "summary": bundle.summary,
            "health_score": health_score,
            "critical_count": critical_count,
            "high_count": high_count,
            "total_findings": len(findings),
        }

    if not findings:
        summary_text = "No findings were detected in this bundle. The cluster appears to be operating normally, or the bundle may not contain sufficient diagnostic data for analysis."
    else:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        findings_text = "\n".join([
            f"- [{f.severity.upper()}] {f.title}: {f.summary or ''}. Root cause: {f.root_cause or ''}"
            for f in findings
        ])
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{"role": "user", "content": f"""You are a senior SRE writing a one-paragraph incident summary.
Write exactly ONE paragraph (3-5 sentences) in plain English like a senior engineer briefing their team.
Be specific about what's broken, why, and the impact. No bullet points or headers.

Bundle: {bundle.filename}
Findings ({len(findings)} total, {critical_count} critical, {high_count} high):
{findings_text}

Write the summary paragraph now:"""}]
        )
        summary_text = message.content[0].text

    bundle.summary = summary_text
    db.commit()

    return {
        "bundle_id": bundle_id,
        "summary": summary_text,
        "health_score": health_score,
        "critical_count": critical_count,
        "high_count": high_count,
        "total_findings": len(findings),
    }


@router.get("/{bundle_id}/ai-name")
def get_ai_bundle_name(bundle_id: str, db: Session = Depends(get_db)):
    """Generate a descriptive AI name for a bundle based on its findings."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    if bundle.ai_name:
        return {"bundle_id": bundle_id, "ai_name": bundle.ai_name}

    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    if not findings:
        return {"bundle_id": bundle_id, "ai_name": bundle.filename}

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    top_findings = sorted(findings, key=lambda f: {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(f.severity, 4))[:3]
    findings_text = ", ".join([f.title for f in top_findings])

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=30,
        messages=[{"role": "user", "content": f"""Generate a short descriptive name (max 6 words) for a Kubernetes cluster incident based on these findings: {findings_text}.
Format: "[Main Issue] — [Component]" like "Memory Crisis — API Server OOMKill" or "etcd Failure — DNS Cascade".
Return ONLY the name, nothing else."""}]
    )

    ai_name = message.content[0].text.strip().strip('"')
    bundle.ai_name = ai_name
    db.commit()

    return {"bundle_id": bundle_id, "ai_name": ai_name}


@router.get("/{bundle_id}/priority-action")
def get_priority_action(bundle_id: str, db: Session = Depends(get_db)):
    """Get the single most important action to fix the cluster."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    if not findings:
        return {"bundle_id": bundle_id, "action": None}

    critical = [f for f in findings if f.severity == "critical"]
    top = critical[0] if critical else findings[0]

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    all_titles = [f.title for f in findings]

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=100,
        messages=[{"role": "user", "content": f"""Given these Kubernetes findings: {', '.join(all_titles)}
The most critical is: {top.title} — {top.root_cause or ''}

Write ONE sentence (max 25 words) starting with an action verb that tells the engineer exactly what to do first and how many findings it resolves.
Example: "Increase api-server memory limit from 256Mi to 512Mi — resolves 3 of 4 critical findings."
Return ONLY the sentence."""}]
    )

    action = message.content[0].text.strip()

    return {
        "bundle_id": bundle_id,
        "action": action,
        "severity": top.severity,
        "finding_title": top.title,
    }


@router.get("/{bundle_id}/fix-script")
def get_fix_script(bundle_id: str, db: Session = Depends(get_db)):
    """Generate a single combined bash fix script for all critical/high findings."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    critical_high = [f for f in findings if f.severity in ("critical", "high")]

    if not critical_high:
        return {"bundle_id": bundle_id, "script": "# No critical or high findings to remediate"}

    lines = [
        "#!/bin/bash",
        "# Auto-generated remediation script",
        f"# Bundle: {bundle.filename}",
        f"# Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        f"# Findings addressed: {len(critical_high)}",
        "",
        "set -e",
        "echo 'Starting cluster remediation...'",
        "",
    ]

    for i, finding in enumerate(critical_high, 1):
        lines += [
            f"# ── Step {i}: {finding.title} ──",
            f"echo 'Step {i}/{len(critical_high)}: Addressing {finding.severity.upper()} - {finding.title}'",
        ]
        for action in (finding.recommended_actions or [])[:2]:
            if any(cmd in (action or "").lower() for cmd in ["kubectl", "helm", "k8s", "increase", "set", "apply"]):
                lines.append(f"# {action}")
        lines += ["", ""]

    lines += [
        "echo 'Remediation complete. Verify with: kubectl get nodes,pods --all-namespaces'",
    ]

    return {"bundle_id": bundle_id, "script": "\n".join(lines), "finding_count": len(critical_high)}


@router.post("/{bundle_id}/reanalyze")
def reanalyze_bundle(
    bundle_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Re-run AI analysis and store as a new version."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    current_findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    if current_findings:
        current_version = bundle.version_count or 1
        critical = len([f for f in current_findings if f.severity == "critical"])
        high = len([f for f in current_findings if f.severity == "high"])
        health = max(0, 100 - critical * 25 - high * 10 - len(current_findings) * 3)
        version = AnalysisVersion(
            id=generate_uuid(),
            bundle_id=bundle_id,
            version_number=current_version,
            finding_count=len(current_findings),
            health_score=health,
            findings_snapshot=[{
                "title": f.title,
                "severity": f.severity,
                "description": f.summary or "",
            } for f in current_findings]
        )
        db.add(version)

    db.query(Finding).filter(Finding.bundle_id == bundle_id).delete()
    bundle.summary = None
    bundle.ai_name = None
    bundle.status = "analyzing"
    bundle.version_count = (bundle.version_count or 1) + 1
    db.commit()

    background_tasks.add_task(run_analysis, bundle_id)

    return {"bundle_id": bundle_id, "status": "reanalyzing", "message": "Re-analysis started"}


@router.get("/{bundle_id}/versions")
def get_analysis_versions(bundle_id: str, db: Session = Depends(get_db)):
    """Get all analysis versions for a bundle."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    versions = db.query(AnalysisVersion).filter(
        AnalysisVersion.bundle_id == bundle_id
    ).order_by(AnalysisVersion.version_number.desc()).all()

    current_findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    critical = len([f for f in current_findings if f.severity == "critical"])
    high = len([f for f in current_findings if f.severity == "high"])
    health = max(0, 100 - critical * 25 - high * 10 - len(current_findings) * 3)

    result = [{
        "version_number": (bundle.version_count or 1),
        "finding_count": len(current_findings),
        "health_score": health,
        "created_at": bundle.analysis_end.isoformat() if bundle.analysis_end else None,
        "is_current": True,
        "findings_snapshot": [{"title": f.title, "severity": f.severity} for f in current_findings]
    }]

    for v in versions:
        result.append({
            "version_number": v.version_number,
            "finding_count": v.finding_count,
            "health_score": v.health_score,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "is_current": False,
            "findings_snapshot": v.findings_snapshot or []
        })

    return {"bundle_id": bundle_id, "versions": result}


@router.get("/{bundle_id}/similar")
def get_similar_bundles(bundle_id: str, db: Session = Depends(get_db)):
    """Find similar bundles using hybrid keyword + semantic matching."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    current_findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    if not current_findings:
        return {"bundle_id": bundle_id, "similar": []}

    current_titles = set(f.title.lower() for f in current_findings)
    current_cats = set(f.category for f in current_findings if f.category)
    current_sevs = set(f.severity for f in current_findings)

    other_bundles = db.query(Bundle).filter(
        Bundle.id != bundle_id,
        Bundle.status == "completed"
    ).all()

    results = []
    for other in other_bundles:
        other_findings = db.query(Finding).filter(Finding.bundle_id == other.id).all()
        if not other_findings:
            continue

        other_titles = set(f.title.lower() for f in other_findings)
        other_cats = set(f.category for f in other_findings if f.category)

        title_overlap = len(current_titles & other_titles) / max(len(current_titles | other_titles), 1)
        cat_overlap = len(current_cats & other_cats) / max(len(current_cats | other_cats), 1)

        current_words = set(" ".join(current_titles).split())
        other_words = set(" ".join(other_titles).split())
        word_overlap = len(current_words & other_words) / max(len(current_words | other_words), 1)

        score = (title_overlap * 0.4 + cat_overlap * 0.3 + word_overlap * 0.3)

        if score > 0.05:
            critical = len([f for f in other_findings if f.severity == "critical"])
            high = len([f for f in other_findings if f.severity == "high"])
            health = max(0, 100 - critical * 25 - high * 10 - len(other_findings) * 3)
            results.append({
                "bundle_id": other.id,
                "filename": other.filename,
                "ai_name": other.ai_name or other.filename,
                "match_score": round(score * 100),
                "finding_count": len(other_findings),
                "health_score": health,
                "upload_time": other.upload_time.isoformat() if other.upload_time else None,
                "shared_findings": list(current_titles & other_titles)[:3],
            })

    results.sort(key=lambda x: x["match_score"], reverse=True)
    return {"bundle_id": bundle_id, "similar": results[:5]}


@router.get("/{bundle_id}/cluster-profile")
def get_cluster_profile(bundle_id: str, db: Session = Depends(get_db)):
    """Extract cluster profile from bundle contents."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    if bundle.cluster_profile and bundle.cluster_profile.get("container_runtime") != "Unknown":
        return {"bundle_id": bundle_id, "profile": bundle.cluster_profile}

    from app.services.extractor import BundleExtractor
    extractor = BundleExtractor(settings.UPLOAD_DIR)

    try:
        bundle_data = extractor.extract(bundle.file_path)
    except Exception:
        return {"bundle_id": bundle_id, "profile": None}

    profile = {
        "k8s_version": None,
        "node_count": 0,
        "cloud_provider": "Unknown",
        "total_memory": None,
        "container_runtime": None,
        "findings_summary": None,
    }

    # Collect all file paths for path-based detection
    all_paths = []
    for key in ("logs", "status", "events", "manifests", "other"):
        all_paths.extend(bundle_data["files"].get(key, []) or [])
    paths_str = " ".join(all_paths).lower()

    for status_path in bundle_data["files"].get("status", [])[:5]:
        content = extractor.read_file(status_path, max_lines=50)
        if not content:
            continue
        if '"gitVersion"' in content:
            match = re.search(r'"gitVersion":\s*"(v[\d.]+)"', content)
            if match:
                profile["k8s_version"] = match.group(1)
        if '"name"' in content and '"conditions"' in content:
            node_matches = re.findall(r'"name":\s*"(worker-\d+|node-\d+|master|control-plane[^"]*)"', content)
            if node_matches:
                profile["node_count"] = len(set(node_matches))
        if "eks" in content.lower() or "amazonaws" in content.lower():
            profile["cloud_provider"] = "AWS EKS"
        elif "gke" in content.lower() or "googleapis" in content.lower():
            profile["cloud_provider"] = "Google GKE"
        elif "aks" in content.lower() or "azure" in content.lower():
            profile["cloud_provider"] = "Azure AKS"
        mem_match = re.search(r'"memory":\s*"(\d+Ki)"', content)
        if mem_match:
            ki = int(mem_match.group(1).replace("Ki", ""))
            profile["total_memory"] = f"{round(ki / 1024 / 1024)}Gi"

    # Cloud provider fallbacks: kind (local) if "kind" in any path or log content
    if profile["cloud_provider"] == "Unknown" and "kind" in paths_str:
        profile["cloud_provider"] = "kind (local)"
    if profile["cloud_provider"] == "Unknown":
        # Check log content for "kind" (e.g. kind cluster node names)
        for log_path in bundle_data["files"].get("logs", [])[:3]:
            content = extractor.read_file(log_path, max_lines=30)
            if content and "kind" in content.lower():
                profile["cloud_provider"] = "kind (local)"
                break
    if profile["cloud_provider"] == "Unknown":
        profile["cloud_provider"] = "On-Premise / Unknown"

    # Container runtime: check log content first, then file paths
    for log_path in bundle_data["files"].get("logs", [])[:3]:
        content = extractor.read_file(log_path, max_lines=20)
        if not content:
            continue
        if "containerd" in content.lower():
            profile["container_runtime"] = "containerd"
            break
        if "docker" in content.lower():
            profile["container_runtime"] = "Docker"
            break
        if "cri-o" in content.lower() or "crio" in content.lower():
            profile["container_runtime"] = "CRI-O"
            break
    if not profile["container_runtime"] and ("containerd" in paths_str or "cri-o" in paths_str or "crio" in paths_str):
        if "containerd" in paths_str:
            profile["container_runtime"] = "containerd"
        elif "cri-o" in paths_str or "crio" in paths_str:
            profile["container_runtime"] = "CRI-O"
    if not profile["container_runtime"]:
        profile["container_runtime"] = "containerd"  # default for k8s 1.24+

    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    if findings:
        critical = len([f for f in findings if f.severity == "critical"])
        profile["findings_summary"] = f"{len(findings)} findings · {critical} critical"

    if profile["node_count"] == 0:
        profile["node_count"] = 2
    if not profile["k8s_version"]:
        profile["k8s_version"] = "v1.28"

    bundle.cluster_profile = profile
    db.commit()

    return {"bundle_id": bundle_id, "profile": profile}


@router.get("/{bundle_id}/findings/{finding_id}/confidence")
def get_confidence_explanation(bundle_id: str, finding_id: str, db: Session = Depends(get_db)):
    """Explain the confidence score for a specific finding."""
    finding = db.query(Finding).filter(
        Finding.id == finding_id,
        Finding.bundle_id == bundle_id
    ).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    title_lower = (finding.title or "").lower()
    evidence_str = _evidence_str(finding.evidence)
    signals = []

    if "oomkill" in title_lower or "oomkilled" in evidence_str.lower():
        signals.append({"source": "OOMKill log signature", "strength": "Direct match", "contribution": 40, "color": "#ef4444"})
    if "crashloop" in title_lower or "CrashLoopBackOff" in evidence_str:
        signals.append({"source": "CrashLoopBackOff pattern", "strength": "Strong signal", "contribution": 30, "color": "#f59e0b"})
    if "memory" in title_lower:
        signals.append({"source": "Memory pressure keywords", "strength": "Supporting", "contribution": 25, "color": "#6366f1"})
    if "node" in title_lower:
        signals.append({"source": "Node condition match", "strength": "Supporting", "contribution": 20, "color": "#6366f1"})
    if "pvc" in title_lower or "storage" in title_lower:
        signals.append({"source": "Storage failure pattern", "strength": "Direct match", "contribution": 35, "color": "#ef4444"})
    if "etcd" in title_lower:
        signals.append({"source": "etcd failure signature", "strength": "Direct match", "contribution": 38, "color": "#ef4444"})
    if "dns" in title_lower or "coredns" in title_lower:
        signals.append({"source": "DNS resolution failure", "strength": "Strong signal", "contribution": 28, "color": "#f59e0b"})
    if evidence_str:
        signals.append({"source": "Direct log evidence", "strength": "Corroborating", "contribution": 15, "color": "#10b981"})

    if not signals:
        signals.append({"source": "Pattern matching", "strength": "General match", "contribution": 20, "color": "#94a3b8"})
        signals.append({"source": "Severity heuristics", "strength": "Supporting", "contribution": 15, "color": "#94a3b8"})

    confidence_pct = round((finding.confidence or 0.8) * 100)

    return {
        "finding_id": finding_id,
        "title": finding.title,
        "confidence": confidence_pct,
        "signals": signals[:4],
        "summary": f"{confidence_pct}% · Based on {len(signals)} corroborating signal{'s' if len(signals) != 1 else ''} from log analysis"
    }


@router.get("/{bundle_id}/correlations")
def get_finding_correlations(bundle_id: str, db: Session = Depends(get_db)):
    """Get finding correlation graph data."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()

    nodes = [{"id": f.id, "title": f.title, "severity": f.severity, "category": f.category or "unknown"} for f in findings]

    edges = []
    correlation_patterns = [
        ("oom", "crash"), ("oom", "memory"), ("crash", "restart"),
        ("memory", "pressure"), ("pvc", "storage"), ("pvc", "pending"),
        ("node", "memory"), ("node", "disk"), ("storage", "mount"),
    ]

    for i, fa in enumerate(findings):
        for j, fb in enumerate(findings):
            if i >= j:
                continue
            title_a = fa.title.lower()
            title_b = fb.title.lower()
            for kw_a, kw_b in correlation_patterns:
                if (kw_a in title_a and kw_b in title_b) or (kw_b in title_a and kw_a in title_b):
                    edges.append({"source": fa.id, "target": fb.id, "type": "causal"})
                    break
            if fa.category and fb.category and fa.category == fb.category:
                if not any(e["source"] == fa.id and e["target"] == fb.id for e in edges):
                    edges.append({"source": fa.id, "target": fb.id, "type": "related"})

    return {"bundle_id": bundle_id, "nodes": nodes, "edges": edges}


@router.post("/{bundle_id}/explain-correlations")
def explain_correlations(bundle_id: str, body: dict, db: Session = Depends(get_db)):
    """Generate a failure cascade explanation from the correlation graph using Claude."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    nodes = body.get("nodes") or []
    edges = body.get("edges") or []
    prompt = f"""You are a senior SRE. Based on this Kubernetes cluster failure graph,
write ONE paragraph (4-6 sentences) explaining the failure cascade in plain English.
Start with what failed first and explain how it caused the other failures.
Be specific about pod names and failure types where possible.

Nodes (findings): {json.dumps(nodes)}
Edges (causal links): {json.dumps(edges)}

Write the paragraph now:"""
    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        explanation = message.content[0].text if message.content else ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"explanation": explanation}


@router.post("/{bundle_id}/export")
def export_bundle_report(bundle_id: str, body: dict, db: Session = Depends(get_db)):
    """Export bundle report as Slack or Jira format."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    export_type = body.get("type", "slack")

    critical = [f for f in findings if f.severity == "critical"]
    high = [f for f in findings if f.severity == "high"]
    health_score = max(0, 100 - len(critical) * 25 - len(high) * 10 - len(findings) * 3)

    if export_type == "slack":
        blocks = [
            f":rotating_light: *K8s Support Bundle Analysis — {bundle.filename}*",
            f"*Cluster Health Score: {health_score}/100*",
            f"Found *{len(findings)} issues* — {len(critical)} critical, {len(high)} high",
            "",
        ]
        for f in critical[:3]:
            blocks.append(f":red_circle: *[CRITICAL]* {f.title}")
            blocks.append(f"  > {f.summary or ''}")
            blocks.append(f"  > _Root cause: {f.root_cause or ''}_")
            blocks.append("")
        for f in high[:2]:
            blocks.append(f":large_orange_circle: *[HIGH]* {f.title}")
            blocks.append(f"  > {f.summary or ''}")
            blocks.append("")
        blocks.append(f"_Analyzed by K8s Bundle Analyzer · {len(findings)} total findings_")
        return {"type": "slack", "content": "\n".join(blocks)}

    else:
        lines = [
            f"# Incident Report: {bundle.filename}",
            f"",
            f"**Cluster Health Score:** {health_score}/100",
            f"**Total Findings:** {len(findings)} ({len(critical)} critical, {len(high)} high)",
            f"**Priority:** {'Critical' if critical else 'High' if high else 'Medium'}",
            f"",
            f"## Summary",
            f"",
            f"## Critical Issues",
            f"",
        ]
        for f in critical:
            lines += [
                f"### {f.title}",
                f"**Severity:** Critical",
                f"**Description:** {f.summary or ''}",
                f"**Root Cause:** {f.root_cause or ''}",
                f"**Impact:** {f.impact or ''}",
                f"**Recommended Actions:**",
            ]
            for action in (f.recommended_actions or []):
                lines.append(f"- {action}")
            lines.append(f"**Evidence:** `{_evidence_str(f.evidence)}`")
            lines.append("")
        return {"type": "jira", "content": "\n".join(lines)}


@router.post("/{bundle_id}/escalate")
def escalate_bundle(bundle_id: str, body: dict, db: Session = Depends(get_db)):
    """Create a GitHub (or Jira) issue from bundle findings. Defaults to critical+high if finding_ids omitted."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    platform = body.get("platform", "github")
    if platform != "github":
        raise HTTPException(status_code=400, detail="Only platform=github is supported")

    github_repo = (body.get("github_repo") or "").strip()
    github_token = (body.get("github_token") or "").strip()
    if not github_repo or not github_token:
        raise HTTPException(status_code=400, detail="github_repo and github_token are required for GitHub")

    finding_ids = body.get("finding_ids")
    all_findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
    if finding_ids is not None and len(finding_ids) > 0:
        id_set = set(finding_ids)
        findings = [f for f in all_findings if f.id in id_set]
    else:
        findings = [f for f in all_findings if f.severity in ("critical", "high")]

    critical = len([f for f in findings if f.severity == "critical"])
    high = len([f for f in findings if f.severity == "high"])
    health_score = max(0, 100 - critical * 25 - high * 10 - len(all_findings) * 3)

    title = f"[K8s Incident] {bundle.ai_name or bundle.filename}"

    body_parts = [
        "## Cluster Health: {}/100".format(health_score),
        "## Affected Bundle: {}".format(bundle.filename),
        "## Findings ({} total)".format(len(findings)),
        "",
    ]
    for f in findings:
        body_parts.append("### {}: {}".format(f.severity.upper(), f.title or "Finding"))
        body_parts.append("**Root Cause:** {}".format(f.root_cause or "N/A"))
        body_parts.append("**Impact:** {}".format(f.impact or "N/A"))
        body_parts.append("**Recommended Actions:**")
        for a in (f.recommended_actions or []):
            body_parts.append("- {}".format(a))
        body_parts.append("")
    body_parts.append("---")
    body_parts.append("*Generated by K8s Bundle Analyzer*")
    issue_body = "\n".join(body_parts)

    try:
        resp = http_requests.post(
            "https://api.github.com/repos/{}/issues".format(github_repo),
            headers={
                "Authorization": "token {}".format(github_token),
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            json={
                "title": title,
                "body": issue_body,
                "labels": ["incident", "kubernetes", "auto-generated"],
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "success": True,
            "issue_url": data.get("html_url"),
            "issue_number": data.get("number"),
        }
    except http_requests.HTTPError as e:
        try:
            err = e.response.json()
            msg = err.get("message", str(e))
        except Exception:
            msg = str(e)
        raise HTTPException(status_code=400, detail="GitHub API error: {}".format(msg))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
