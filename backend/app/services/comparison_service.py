from typing import List, Dict, Any


class BundleComparisonService:
    def compare(self, bundle_a, bundle_b, findings_a, findings_b) -> Dict[str, Any]:
        titles_a = {f.title: f for f in findings_a}
        titles_b = {f.title: f for f in findings_b}

        new_findings = []
        for title, finding in titles_b.items():
            if title not in titles_a:
                new_findings.append({
                    "title": finding.title,
                    "severity": finding.severity,
                    "description": finding.summary or "",
                    "status": "new",
                })

        resolved_findings = []
        for title, finding in titles_a.items():
            if title not in titles_b:
                resolved_findings.append({
                    "title": finding.title,
                    "severity": finding.severity,
                    "description": finding.summary or "",
                    "status": "resolved",
                })

        degraded_findings = []
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        for title in titles_a:
            if title in titles_b:
                a = titles_a[title]
                b = titles_b[title]
                if severity_order.get(b.severity, 4) < severity_order.get(a.severity, 4):
                    degraded_findings.append({
                        "title": title,
                        "severity_before": a.severity,
                        "severity_after": b.severity,
                        "status": "degraded",
                    })

        unchanged_count = sum(1 for t in titles_a if t in titles_b and titles_a[t].severity == titles_b[t].severity)

        return {
            "bundle_a": {"id": bundle_a.id, "filename": bundle_a.filename, "finding_count": len(findings_a)},
            "bundle_b": {"id": bundle_b.id, "filename": bundle_b.filename, "finding_count": len(findings_b)},
            "summary": {
                "new": len(new_findings),
                "resolved": len(resolved_findings),
                "degraded": len(degraded_findings),
                "unchanged": unchanged_count,
            },
            "new": new_findings,
            "resolved": resolved_findings,
            "degraded": degraded_findings,
        }
