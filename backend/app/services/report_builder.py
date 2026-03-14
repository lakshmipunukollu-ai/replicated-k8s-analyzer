"""
ReportBuilder - Merges, deduplicates, and ranks findings into a final report.
"""
from typing import Dict, List, Any
from collections import Counter


class ReportBuilder:
    """Build a structured analysis report from all findings."""

    SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

    def build(
        self,
        pattern_findings: List[Dict],
        llm_findings: List[Dict],
        signals: Dict[str, List[Dict[str, Any]]],
        duration_seconds: float = 0.0
    ) -> Dict:
        """
        Build a complete analysis report.

        Args:
            pattern_findings: Findings from PatternMatcher
            llm_findings: Findings from LLMAnalyzer
            signals: Raw extracted signals
            duration_seconds: Time taken for analysis

        Returns:
            Complete report dict
        """
        # Merge all findings
        all_findings = pattern_findings + llm_findings

        # Deduplicate
        deduped = self._deduplicate(all_findings)

        # Correlate related findings
        correlated = self._correlate(deduped)

        # Sort by severity
        sorted_findings = sorted(
            correlated,
            key=lambda f: self.SEVERITY_ORDER.get(f.get("severity", "info"), 4)
        )

        # Build summary
        severity_counts = Counter(f["severity"] for f in sorted_findings)
        category_counts = Counter(f["category"] for f in sorted_findings)

        return {
            "summary": {
                "total_findings": len(sorted_findings),
                "by_severity": dict(severity_counts),
                "by_category": dict(category_counts),
                "analysis_duration_seconds": round(duration_seconds, 2),
                "total_signals": sum(len(v) for v in signals.values())
            },
            "findings": sorted_findings
        }

    def _deduplicate(self, findings: List[Dict]) -> List[Dict]:
        """Remove duplicate findings based on title similarity."""
        seen_titles = set()
        deduped = []

        for finding in findings:
            title_key = finding["title"].lower().strip()
            # Simple dedup by exact title match
            if title_key not in seen_titles:
                seen_titles.add(title_key)
                deduped.append(finding)

        return deduped

    def _correlate(self, findings: List[Dict]) -> List[Dict]:
        """Link related findings that share root causes."""
        # Group findings by category
        by_category = {}
        for f in findings:
            cat = f.get("category", "other")
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(f)

        # Link findings in the same category
        for cat, cat_findings in by_category.items():
            if len(cat_findings) > 1:
                ids = [f["id"] for f in cat_findings]
                for f in cat_findings:
                    f["related_findings"] = [fid for fid in ids if fid != f["id"]]

        return findings
