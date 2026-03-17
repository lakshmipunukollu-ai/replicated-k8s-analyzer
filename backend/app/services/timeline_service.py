import re
from datetime import datetime
from typing import List, Dict, Any


def _evidence_str(evidence) -> str:
    if not evidence:
        return ""
    if isinstance(evidence, list):
        parts = []
        for x in evidence[:3]:
            if isinstance(x, dict):
                parts.append(str(x.get("content") or x.get("source") or x))
            else:
                parts.append(str(x))
        return " ".join(parts)
    return str(evidence)


SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
COLOR_MAP = {
    "critical": "#ef4444",
    "high": "#f59e0b",
    "medium": "#6366f1",
    "low": "#10b981",
    "info": "#94a3b8",
}


class TimelineService:
    def build_timeline(self, bundle, findings) -> List[Dict[str, Any]]:
        events = []
        base_time = bundle.upload_time or datetime.utcnow()

        offsets = {
            "critical": -120,
            "high": -60,
            "medium": -30,
            "low": -10,
            "info": 0,
        }

        for i, finding in enumerate(sorted(findings, key=lambda f: SEVERITY_ORDER.get(f.severity, 4))):
            offset = offsets.get(finding.severity, 0) - (i * 5)
            event_time = datetime.utcfromtimestamp(base_time.timestamp() + offset * 60)

            evidence_str = _evidence_str(finding.evidence)
            source = "unknown"
            if evidence_str:
                match = re.match(r'^([^:]+\.log)', evidence_str)
                if match:
                    source = match.group(1)

            events.append({
                "timestamp": event_time.strftime("%H:%M"),
                "timestamp_full": event_time.isoformat(),
                "title": finding.title,
                "description": finding.summary or "",
                "severity": finding.severity,
                "color": COLOR_MAP.get(finding.severity, "#94a3b8"),
                "source": source,
                "evidence": evidence_str,
                "finding_id": finding.id,
            })

        events.sort(key=lambda e: e["timestamp_full"])
        return events
