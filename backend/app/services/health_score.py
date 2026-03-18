"""Cluster health score from findings (single formula used across API)."""

from typing import Any, Iterable, List


def _severity(f: Any) -> str:
    if isinstance(f, dict):
        return f.get("severity") or ""
    return getattr(f, "severity", None) or ""


def compute_bundle_health_score(findings: Iterable[Any]) -> int:
    """
    Health 0–100 from severity counts. Info/other severities do not reduce score.
    """
    findings = list(findings)
    critical = len([f for f in findings if _severity(f) == "critical"])
    high = len([f for f in findings if _severity(f) == "high"])
    medium = len([f for f in findings if _severity(f) == "medium"])
    low = len([f for f in findings if _severity(f) == "low"])
    return max(0, 100 - critical * 15 - high * 7 - medium * 3 - low * 1)


def compute_bundle_health_score_from_severities(severities: List[str]) -> int:
    """Same formula when you only have a list of severity strings (e.g. batched list query)."""
    critical = sum(1 for s in severities if s == "critical")
    high = sum(1 for s in severities if s == "high")
    medium = sum(1 for s in severities if s == "medium")
    low = sum(1 for s in severities if s == "low")
    return max(0, 100 - critical * 15 - high * 7 - medium * 3 - low * 1)
