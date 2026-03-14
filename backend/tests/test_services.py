"""Tests for analysis services."""
import os
import tempfile
import tarfile
import json
import pytest

from app.services.extractor import BundleExtractor
from app.services.signal_extractor import SignalExtractor
from app.services.pattern_matcher import PatternMatcher
from app.services.report_builder import ReportBuilder
from app.services.llm_analyzer import LLMAnalyzer, LogChunker


class TestBundleExtractor:
    """Tests for BundleExtractor."""

    def test_extract_valid_bundle(self):
        """Extracts a valid .tar.gz and indexes files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create sample bundle
            bundle_dir = os.path.join(tmpdir, "bundle")
            os.makedirs(os.path.join(bundle_dir, "logs"))
            with open(os.path.join(bundle_dir, "logs", "test.log"), "w") as f:
                f.write("test log content\n")
            with open(os.path.join(bundle_dir, "config.yaml"), "w") as f:
                f.write("key: value\n")
            with open(os.path.join(bundle_dir, "status.json"), "w") as f:
                json.dump({"status": "ok"}, f)

            tar_path = os.path.join(tmpdir, "test.tar.gz")
            with tarfile.open(tar_path, "w:gz") as tar:
                for root, dirs, files in os.walk(bundle_dir):
                    for file in files:
                        full_path = os.path.join(root, file)
                        arcname = os.path.relpath(full_path, bundle_dir)
                        tar.add(full_path, arcname=arcname)

            extractor = BundleExtractor(tmpdir)
            result = extractor.extract(tar_path)

            assert result["total_files"] >= 3
            assert len(result["files"]["logs"]) >= 1
            assert len(result["files"]["manifests"]) >= 1
            assert len(result["files"]["status"]) >= 1

    def test_extract_handles_invalid_file(self):
        """Handles non-tar.gz files gracefully."""
        with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as f:
            f.write(b"not a real tar file")
            f.flush()
            extractor = BundleExtractor(".")
            result = extractor.extract(f.name)
            # Should not raise, returns empty
            assert isinstance(result["files"], dict)
        os.unlink(f.name)

    def test_read_file(self):
        """Reads file content with line limit."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False) as f:
            for i in range(100):
                f.write(f"Line {i}\n")
            f.flush()

            extractor = BundleExtractor(".")
            content = extractor.read_file(f.name, max_lines=10)
            assert content is not None
            assert len(content.split("\n")) <= 11  # 10 lines + possible trailing
        os.unlink(f.name)


class TestSignalExtractor:
    """Tests for SignalExtractor."""

    def test_extract_oom_signals(self):
        """Detects OOMKill signals from logs."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False) as f:
            f.write("2024-01-01 INFO Starting\n")
            f.write("2024-01-01 ERROR OOMKilled: container killed\n")
            f.write("2024-01-01 INFO Recovery\n")
            f.flush()

            extractor = SignalExtractor()
            signals = extractor.extract({"logs": [f.name], "manifests": [], "status": [], "other": []})

            assert len(signals["oom_kills"]) >= 1
            assert "OOMKilled" in signals["oom_kills"][0]["content"]
        os.unlink(f.name)

    def test_extract_crashloop_signals(self):
        """Detects CrashLoopBackOff signals."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False) as f:
            f.write("CrashLoopBackOff detected\n")
            f.flush()

            extractor = SignalExtractor()
            signals = extractor.extract({"logs": [f.name], "manifests": [], "status": [], "other": []})
            assert len(signals["crashloop_backoffs"]) >= 1
        os.unlink(f.name)

    def test_extract_node_conditions(self):
        """Detects node pressure signals."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False) as f:
            f.write("MemoryPressure on node worker-1\n")
            f.write("DiskPressure on node worker-2\n")
            f.flush()

            extractor = SignalExtractor()
            signals = extractor.extract({"logs": [f.name], "manifests": [], "status": [], "other": []})
            assert len(signals["node_conditions"]) >= 2
        os.unlink(f.name)

    def test_extract_dns_issues(self):
        """Detects DNS resolution failures."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False) as f:
            f.write("dns resolution failed for service\n")
            f.flush()

            extractor = SignalExtractor()
            signals = extractor.extract({"logs": [f.name], "manifests": [], "status": [], "other": []})
            assert len(signals["dns_issues"]) >= 1
        os.unlink(f.name)

    def test_extract_k8s_events_from_json(self):
        """Extracts warning events from JSON status files."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({
                "kind": "EventList",
                "items": [
                    {"kind": "Event", "type": "Warning", "reason": "FailedMount", "message": "Volume not found"},
                    {"kind": "Event", "type": "Normal", "reason": "Scheduled", "message": "Pod assigned"},
                ]
            }, f)
            f.flush()

            extractor = SignalExtractor()
            signals = extractor.extract({"logs": [], "manifests": [], "status": [f.name], "other": []})
            assert len(signals["recent_events"]) == 1
            assert signals["recent_events"][0]["reason"] == "FailedMount"
        os.unlink(f.name)

    def test_empty_files(self):
        """Handles empty file index gracefully."""
        extractor = SignalExtractor()
        signals = extractor.extract({"logs": [], "manifests": [], "status": [], "other": []})
        for key in signals:
            assert signals[key] == []


class TestPatternMatcher:
    """Tests for PatternMatcher."""

    def test_oom_pattern(self):
        """OOMKill signals produce critical finding."""
        matcher = PatternMatcher()
        signals = {
            "oom_kills": [{"source": "test.log", "line": 1, "content": "OOMKilled", "type": "log_line"}],
            "crashloop_backoffs": [], "image_pull_errors": [], "pending_pvcs": [],
            "node_conditions": [], "recent_events": [], "resource_pressure": [],
            "dns_issues": [], "rbac_issues": [], "failed_pods": [],
        }
        findings = matcher.match(signals)
        assert len(findings) >= 1
        oom_finding = [f for f in findings if "OOMKill" in f["title"]]
        assert len(oom_finding) >= 1
        assert oom_finding[0]["severity"] == "critical"

    def test_crashloop_pattern(self):
        """CrashLoopBackOff signals produce high finding."""
        matcher = PatternMatcher()
        signals = {
            "oom_kills": [],
            "crashloop_backoffs": [{"source": "test.log", "line": 1, "content": "CrashLoopBackOff", "type": "log_line"}],
            "image_pull_errors": [], "pending_pvcs": [],
            "node_conditions": [], "recent_events": [], "resource_pressure": [],
            "dns_issues": [], "rbac_issues": [], "failed_pods": [],
        }
        findings = matcher.match(signals)
        crash_finding = [f for f in findings if "CrashLoopBackOff" in f["title"]]
        assert len(crash_finding) >= 1
        assert crash_finding[0]["severity"] == "high"

    def test_correlation_oom_and_crashloop(self):
        """OOMKill + CrashLoop produces correlation finding."""
        matcher = PatternMatcher()
        signals = {
            "oom_kills": [{"source": "test.log", "line": 1, "content": "OOMKilled", "type": "log_line"}],
            "crashloop_backoffs": [{"source": "test.log", "line": 2, "content": "CrashLoopBackOff", "type": "log_line"}],
            "image_pull_errors": [], "pending_pvcs": [],
            "node_conditions": [], "recent_events": [], "resource_pressure": [],
            "dns_issues": [], "rbac_issues": [], "failed_pods": [],
        }
        findings = matcher.match(signals)
        correlation = [f for f in findings if f["source"] == "correlation"]
        assert len(correlation) >= 1

    def test_no_signals_no_findings(self):
        """No signals produce no findings."""
        matcher = PatternMatcher()
        signals = {
            "oom_kills": [], "crashloop_backoffs": [], "image_pull_errors": [],
            "pending_pvcs": [], "node_conditions": [], "recent_events": [],
            "resource_pressure": [], "dns_issues": [], "rbac_issues": [], "failed_pods": [],
        }
        findings = matcher.match(signals)
        assert len(findings) == 0


class TestReportBuilder:
    """Tests for ReportBuilder."""

    def test_build_report(self):
        """Builds a complete report from findings."""
        builder = ReportBuilder()
        pattern_findings = [
            {"id": "1", "severity": "critical", "category": "resource", "title": "OOMKill",
             "summary": "test", "root_cause": "test", "impact": "test",
             "confidence": 0.95, "source": "pattern_match",
             "recommended_actions": ["fix it"], "evidence": [], "related_findings": []},
        ]
        llm_findings = [
            {"id": "2", "severity": "medium", "category": "application", "title": "Summary",
             "summary": "test", "root_cause": "test", "impact": "test",
             "confidence": 0.6, "source": "llm_analysis",
             "recommended_actions": ["monitor"], "evidence": [], "related_findings": []},
        ]
        signals = {"oom_kills": [{}], "crashloop_backoffs": []}

        report = builder.build(pattern_findings, llm_findings, signals, 5.0)

        assert report["summary"]["total_findings"] == 2
        assert report["summary"]["by_severity"]["critical"] == 1
        assert report["summary"]["by_severity"]["medium"] == 1
        assert report["summary"]["analysis_duration_seconds"] == 5.0
        # Should be sorted by severity (critical first)
        assert report["findings"][0]["severity"] == "critical"

    def test_deduplication(self):
        """Removes duplicate findings by title."""
        builder = ReportBuilder()
        findings = [
            {"id": "1", "severity": "high", "category": "resource", "title": "Same Title",
             "source": "pattern_match", "related_findings": []},
            {"id": "2", "severity": "high", "category": "resource", "title": "Same Title",
             "source": "llm_analysis", "related_findings": []},
        ]
        report = builder.build(findings, [], {}, 1.0)
        assert report["summary"]["total_findings"] == 1


class TestLogChunker:
    """Tests for LogChunker."""

    def test_chunk_small_content(self):
        """Small content returns single chunk."""
        chunker = LogChunker()
        chunks = chunker.chunk("short log line\n")
        assert len(chunks) == 1

    def test_chunk_large_content(self):
        """Large content is split into multiple chunks."""
        chunker = LogChunker()
        content = "\n".join([f"Log line {i} " * 20 for i in range(100)])
        chunks = chunker.chunk(content, max_chunks=3)
        assert len(chunks) <= 3

    def test_chunk_respects_max(self):
        """Does not exceed max_chunks."""
        chunker = LogChunker()
        content = "\n".join([f"line {i}" for i in range(10000)])
        chunks = chunker.chunk(content, max_chunks=2)
        assert len(chunks) <= 2


class TestLLMAnalyzer:
    """Tests for LLMAnalyzer (without real API calls)."""

    def test_synthetic_findings_no_signals(self):
        """Generates info finding when no signals present."""
        # Force no client
        analyzer = LLMAnalyzer()
        analyzer.client = None

        import asyncio
        signals = {
            "oom_kills": [], "crashloop_backoffs": [], "image_pull_errors": [],
            "pending_pvcs": [], "node_conditions": [], "dns_issues": [],
        }
        findings = asyncio.get_event_loop().run_until_complete(analyzer.analyze(signals))
        assert len(findings) >= 1
        assert findings[0]["severity"] == "info"

    def test_synthetic_findings_with_signals(self):
        """Generates summary finding when signals present."""
        analyzer = LLMAnalyzer()
        analyzer.client = None

        import asyncio
        signals = {
            "oom_kills": [{"source": "test.log", "content": "OOMKilled"}],
            "crashloop_backoffs": [{"source": "test.log", "content": "CrashLoop"}],
        }
        findings = asyncio.get_event_loop().run_until_complete(analyzer.analyze(signals))
        assert len(findings) >= 1
        assert findings[0]["severity"] == "medium"
        assert "llm_analysis" in findings[0]["source"]
