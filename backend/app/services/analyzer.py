"""
BundleAnalyzer - Main analysis pipeline orchestrator.
Coordinates extraction, signal detection, pattern matching, LLM analysis, and report building.
"""
import time
import asyncio
from datetime import datetime
from typing import Dict, List, Callable, Optional
from sqlalchemy.orm import Session

from app.models import Bundle, Finding, AnalysisEvent, generate_uuid
from app.services.extractor import BundleExtractor
from app.services.signal_extractor import SignalExtractor
from app.services.pattern_matcher import PatternMatcher
from app.services.llm_analyzer import LLMAnalyzer, LogChunker
from app.services.report_builder import ReportBuilder
from app.config import settings


class BundleAnalyzer:
    """
    Main analysis pipeline. Extracts structured signals first (deterministic),
    then uses LLM for pattern correlation and explanation.
    """

    def __init__(self):
        self.extractor = BundleExtractor(settings.UPLOAD_DIR)
        self.signal_extractor = SignalExtractor()
        self.pattern_matcher = PatternMatcher()
        self.llm_analyzer = LLMAnalyzer()
        self.log_chunker = LogChunker()
        self.report_builder = ReportBuilder()

    async def analyze(
        self,
        bundle_id: str,
        file_path: str,
        db: Session,
        event_callback: Optional[Callable] = None
    ) -> Dict:
        """
        Run the full analysis pipeline on a support bundle.

        Args:
            bundle_id: Bundle database ID
            file_path: Path to the .tar.gz file
            db: Database session
            event_callback: Optional callback for streaming events

        Returns:
            Complete analysis report
        """
        start_time = time.time()

        # Update bundle status to analyzing
        bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
        if bundle:
            bundle.status = "extracting"
            bundle.analysis_start = datetime.utcnow()
            db.commit()

        await self._emit_event(db, bundle_id, "progress", {
            "step": "extracting",
            "progress": 10,
            "message": "Extracting support bundle..."
        }, event_callback)

        # Step 1: Extract bundle
        extraction = self.extractor.extract(file_path)

        await self._emit_event(db, bundle_id, "progress", {
            "step": "extracting",
            "progress": 25,
            "message": f"Extracted {extraction['total_files']} files from bundle"
        }, event_callback)

        # Step 2: Extract structured signals
        if bundle:
            bundle.status = "analyzing"
            db.commit()

        await self._emit_event(db, bundle_id, "progress", {
            "step": "signal_extraction",
            "progress": 40,
            "message": "Extracting structured signals..."
        }, event_callback)

        signals = self.signal_extractor.extract(extraction)

        signal_count = sum(len(v) for v in signals.values())
        await self._emit_event(db, bundle_id, "progress", {
            "step": "signal_extraction",
            "progress": 50,
            "message": f"Extracted {signal_count} signals from bundle"
        }, event_callback)

        # Step 3: Pattern matching (deterministic)
        await self._emit_event(db, bundle_id, "progress", {
            "step": "pattern_matching",
            "progress": 60,
            "message": "Matching against known K8s failure patterns..."
        }, event_callback)

        pattern_findings = self.pattern_matcher.match(signals)

        # Emit each pattern finding as it's discovered
        for finding in pattern_findings:
            await self._emit_event(db, bundle_id, "finding", finding, event_callback)

        await self._emit_event(db, bundle_id, "progress", {
            "step": "pattern_matching",
            "progress": 70,
            "message": f"Found {len(pattern_findings)} pattern matches"
        }, event_callback)

        # Step 4: LLM analysis for unknown patterns
        await self._emit_event(db, bundle_id, "progress", {
            "step": "llm_analysis",
            "progress": 80,
            "message": "Running LLM analysis for deeper insights..."
        }, event_callback)

        # Prepare log excerpts for LLM
        log_excerpts = []
        for log_file in extraction["files"].get("logs", [])[:3]:
            content = self.extractor.read_file(log_file, max_lines=100)
            if content:
                chunks = self.log_chunker.chunk(content, max_chunks=2)
                log_excerpts.extend(chunks)

        llm_findings = await self.llm_analyzer.analyze(signals, log_excerpts)

        for finding in llm_findings:
            await self._emit_event(db, bundle_id, "finding", finding, event_callback)

        await self._emit_event(db, bundle_id, "progress", {
            "step": "llm_analysis",
            "progress": 90,
            "message": f"LLM analysis produced {len(llm_findings)} additional findings"
        }, event_callback)

        # Step 5: Build report
        duration = time.time() - start_time
        report = self.report_builder.build(
            pattern_findings, llm_findings, signals, duration
        )

        # Save findings to database
        self._save_findings(db, bundle_id, report["findings"])

        # Update bundle status
        if bundle:
            bundle.status = "completed"
            bundle.analysis_end = datetime.utcnow()
            db.commit()

        await self._emit_event(db, bundle_id, "complete", {
            "total_findings": report["summary"]["total_findings"],
            "duration_seconds": report["summary"]["analysis_duration_seconds"]
        }, event_callback)

        return report

    def _save_findings(self, db: Session, bundle_id: str, findings: List[Dict]):
        """Save findings to the database."""
        for f in findings:
            finding = Finding(
                id=f.get("id", generate_uuid()),
                bundle_id=bundle_id,
                severity=f["severity"],
                category=f["category"],
                title=f["title"],
                summary=f.get("summary", ""),
                root_cause=f.get("root_cause", ""),
                impact=f.get("impact", ""),
                confidence=f.get("confidence", 0.0),
                source=f.get("source", "pattern_match"),
                recommended_actions=f.get("recommended_actions", []),
                related_findings=f.get("related_findings", []),
                evidence=f.get("evidence", [])
            )
            db.add(finding)

        try:
            db.commit()
        except Exception:
            db.rollback()

    async def _emit_event(
        self,
        db: Session,
        bundle_id: str,
        event_type: str,
        data: Dict,
        callback: Optional[Callable] = None
    ):
        """Emit an analysis event and store it in the database."""
        # Get next sequence number
        last_event = db.query(AnalysisEvent).filter(
            AnalysisEvent.bundle_id == bundle_id
        ).order_by(AnalysisEvent.sequence.desc()).first()

        sequence = (last_event.sequence + 1) if last_event else 1

        event = AnalysisEvent(
            id=generate_uuid(),
            bundle_id=bundle_id,
            event_type=event_type,
            data=data,
            sequence=sequence
        )
        db.add(event)
        try:
            db.commit()
        except Exception:
            db.rollback()

        if callback:
            await callback(event_type, data)
