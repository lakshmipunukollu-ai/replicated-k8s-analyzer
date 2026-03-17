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
        signals = signal_extractor.extract(bundle_data["files"])
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

    if bundle.summary:
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
