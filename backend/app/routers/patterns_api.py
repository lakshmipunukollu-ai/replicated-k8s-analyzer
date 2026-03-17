"""Patterns API: cross-company patterns, app-version correlation, suppression rules."""
from collections import defaultdict
from datetime import datetime
from typing import Optional, List
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Bundle,
    Finding,
    Company,
    SuppressionRule,
    generate_uuid,
)

router = APIRouter(prefix="/patterns", tags=["patterns"])


def _title_words(title: str) -> set:
    """Extract words (len >= 2) from title for similarity."""
    return set(w.lower() for w in re.findall(r"[a-zA-Z0-9]{2,}", title or ""))


@router.get("/cross-company")
def get_cross_company_patterns(db: Session = Depends(get_db)):
    """Group findings by title similarity; return patterns seen at 2+ companies."""
    bundles = (
        db.query(Bundle)
        .filter(Bundle.status == "completed")
        .all()
    )
    if not bundles:
        return {"patterns": [], "total": 0, "generated_at": datetime.utcnow().isoformat() + "Z"}

    # Load company names
    company_ids = {b.company_id for b in bundles if b.company_id}
    companies = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(company_ids)).all()}

    # Collect (finding, bundle, company_name) for each completed bundle
    items = []
    for b in bundles:
        company_name = companies.get(b.company_id, "Unknown") if b.company_id else "Unknown"
        findings = db.query(Finding).filter(Finding.bundle_id == b.id).all()
        for f in findings:
            items.append((f, b, company_name))

    # Group by exact title first
    by_exact: dict[str, list] = defaultdict(list)
    for f, b, cname in items:
        key = (f.title or "").strip()
        if key:
            by_exact[key].append((f, b, cname))

    # Merge groups whose titles share 3+ words
    def merge_groups():
        groups = list(by_exact.items())
        merged = {}
        used = set()

        for title, entries in groups:
            if title in used:
                continue
            words = _title_words(title)
            current_entries = list(entries)
            current_title = title
            used.add(title)

            for other_title, other_entries in groups:
                if other_title in used or other_title == title:
                    continue
                other_words = _title_words(other_title)
                if len(words & other_words) >= 3:
                    current_entries.extend(other_entries)
                    used.add(other_title)
                    if len(other_entries) > len(entries):
                        current_title = other_title
                        words = other_words

            merged[current_title] = current_entries

        return merged

    merged = merge_groups()

    patterns = []
    for pattern_name, entries in merged.items():
        companies_affected = list({cname for _, _, cname in entries})
        if len(companies_affected) < 2:
            continue

        findings_list = [e[0] for e in entries]
        bundles_list = [e[1] for e in entries]
        severities = list({f.severity for f in findings_list})
        created_dates = [f.created_at for f in findings_list if f.created_at]
        first_seen = min(created_dates).isoformat() if created_dates else None
        last_seen = max(created_dates).isoformat() if created_dates else None

        # Top recommended_actions across findings (flatten, take most common or first)
        all_actions = []
        for f in findings_list:
            for a in (f.recommended_actions or [])[:2]:
                if a and a not in all_actions:
                    all_actions.append(a)
        recommendation = all_actions[0] if all_actions else None

        patterns.append({
            "pattern_name": pattern_name,
            "affected_companies": companies_affected,
            "affected_company_count": len(companies_affected),
            "total_occurrences": len(entries),
            "severities": severities,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "affected_bundles": list({b.id for b in bundles_list}),
            "recommendation": recommendation,
        })

    patterns.sort(key=lambda p: (-p["affected_company_count"], -p["total_occurrences"]))

    return {
        "patterns": patterns,
        "total": len(patterns),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/app-version-correlation")
def get_app_version_correlation(db: Session = Depends(get_db)):
    """Per app_version: bundle count, avg health, finding counts, top findings, companies."""
    bundles = (
        db.query(Bundle)
        .filter(Bundle.app_version.isnot(None), Bundle.app_version != "", Bundle.status == "completed")
        .all()
    )
    by_version = defaultdict(list)
    for b in bundles:
        by_version[b.app_version or ""].append(b)

    company_ids = {b.company_id for b in bundles if b.company_id}
    companies = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(company_ids)).all()}

    def health_score(bundle: Bundle) -> int:
        findings = db.query(Finding).filter(Finding.bundle_id == bundle.id).all()
        critical = len([f for f in findings if f.severity == "critical"])
        high = len([f for f in findings if f.severity == "high"])
        return max(0, 100 - critical * 25 - high * 10 - len(findings) * 3)

    correlations = []
    for version, version_bundles in sorted(by_version.items(), key=lambda x: x[0] or "", reverse=True):
        if not version:
            continue
        scores = [health_score(b) for b in version_bundles]
        avg_health = round(sum(scores) / len(scores), 1) if scores else 0
        finding_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        title_counts = defaultdict(int)
        company_names = set()
        for b in version_bundles:
            if b.company_id and b.company_id in companies:
                company_names.add(companies[b.company_id])
            findings = db.query(Finding).filter(Finding.bundle_id == b.id).all()
            for f in findings:
                finding_counts[f.severity] = finding_counts.get(f.severity, 0) + 1
                title_counts[f.title or ""] += 1
        top_titles = sorted(title_counts.items(), key=lambda x: -x[1])[:3]
        top_findings = [t for t, _ in top_titles]

        correlations.append({
            "version": version,
            "bundle_count": len(version_bundles),
            "avg_health_score": avg_health,
            "finding_counts": finding_counts,
            "top_findings": top_findings,
            "companies": list(company_names),
        })

    return {"correlations": correlations, "total": len(correlations)}


class SuppressionRuleCreate(BaseModel):
    company_id: Optional[str] = None
    pattern: str
    reason: Optional[str] = None
    created_by: Optional[str] = "Support Engineer"


class SuppressionRulePatch(BaseModel):
    is_active: Optional[bool] = None


@router.get("/suppression-rules")
def list_suppression_rules(db: Session = Depends(get_db)):
    """List all suppression rules with company name joined."""
    rules = db.query(SuppressionRule).order_by(SuppressionRule.created_at.desc()).all()
    company_ids = {r.company_id for r in rules if r.company_id}
    companies = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(company_ids)).all()}
    out = []
    for r in rules:
        out.append({
            "id": r.id,
            "company_id": r.company_id,
            "company_name": companies.get(r.company_id) if r.company_id else None,
            "pattern": r.pattern,
            "reason": r.reason,
            "created_by": r.created_by,
            "is_active": r.is_active,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return {"rules": out}


@router.post("/suppression-rules")
def create_suppression_rule(body: SuppressionRuleCreate, db: Session = Depends(get_db)):
    """Create a suppression rule."""
    rule = SuppressionRule(
        id=generate_uuid(),
        company_id=body.company_id,
        pattern=body.pattern.strip(),
        reason=body.reason,
        created_by=body.created_by or "Support Engineer",
        is_active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    company_name = None
    if rule.company_id:
        c = db.query(Company).filter(Company.id == rule.company_id).first()
        company_name = c.name if c else None
    return {
        "id": rule.id,
        "company_id": rule.company_id,
        "company_name": company_name,
        "pattern": rule.pattern,
        "reason": rule.reason,
        "created_by": rule.created_by,
        "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


@router.delete("/suppression-rules/{rule_id}")
def delete_suppression_rule(rule_id: str, db: Session = Depends(get_db)):
    """Hard delete a suppression rule."""
    rule = db.query(SuppressionRule).filter(SuppressionRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"deleted": True}


@router.patch("/suppression-rules/{rule_id}")
def patch_suppression_rule(rule_id: str, body: SuppressionRulePatch, db: Session = Depends(get_db)):
    """Toggle active state of a suppression rule."""
    rule = db.query(SuppressionRule).filter(SuppressionRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if body.is_active is not None:
        rule.is_active = body.is_active
    db.commit()
    db.refresh(rule)
    company_name = None
    if rule.company_id:
        c = db.query(Company).filter(Company.id == rule.company_id).first()
        company_name = c.name if c else None
    return {
        "id": rule.id,
        "company_id": rule.company_id,
        "company_name": company_name,
        "pattern": rule.pattern,
        "reason": rule.reason,
        "created_by": rule.created_by,
        "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }
