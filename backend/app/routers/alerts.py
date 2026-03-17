"""Alert rules and firings API."""
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import AlertRule, AlertFiring, Bundle, Finding, Company

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    company_id: Optional[str] = None
    trigger_severity: Optional[str] = None  # critical|high|any
    trigger_pattern: Optional[str] = None
    trigger_count: int = 1
    trigger_window_hours: int = 24
    channel: str = "slack"  # slack|email|webhook
    destination: Optional[str] = None


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    company_id: Optional[str] = None
    trigger_severity: Optional[str] = None
    trigger_pattern: Optional[str] = None
    trigger_count: Optional[int] = None
    trigger_window_hours: Optional[int] = None
    channel: Optional[str] = None
    destination: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/rules")
def list_rules(db: Session = Depends(get_db)):
    """Return all alert rules with company name, firing_count, last_triggered_at."""
    rules = db.query(AlertRule).order_by(AlertRule.created_at.desc()).all()
    result = []
    for r in rules:
        company_name = None
        if r.company_id:
            c = db.query(Company).filter(Company.id == r.company_id).first()
            company_name = c.name if c else None
        firing_count = db.query(AlertFiring).filter(AlertFiring.rule_id == r.id).count()
        result.append({
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "company_id": r.company_id,
            "company_name": company_name,
            "trigger_severity": r.trigger_severity,
            "trigger_pattern": r.trigger_pattern,
            "trigger_count": r.trigger_count,
            "trigger_window_hours": r.trigger_window_hours,
            "channel": r.channel,
            "destination": r.destination,
            "is_active": r.is_active,
            "last_triggered_at": r.last_triggered_at.isoformat() if r.last_triggered_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "firing_count": firing_count,
        })
    return result


@router.post("/rules")
def create_rule(body: AlertRuleCreate, db: Session = Depends(get_db)):
    """Create an alert rule."""
    rule = AlertRule(
        name=body.name,
        description=body.description,
        company_id=body.company_id,
        trigger_severity=body.trigger_severity,
        trigger_pattern=body.trigger_pattern,
        trigger_count=body.trigger_count,
        trigger_window_hours=body.trigger_window_hours,
        channel=body.channel,
        destination=body.destination,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {
        "id": rule.id,
        "name": rule.name,
        "description": rule.description,
        "company_id": rule.company_id,
        "trigger_severity": rule.trigger_severity,
        "trigger_pattern": rule.trigger_pattern,
        "trigger_count": rule.trigger_count,
        "trigger_window_hours": rule.trigger_window_hours,
        "channel": rule.channel,
        "destination": rule.destination,
        "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: str, body: AlertRuleUpdate, db: Session = Depends(get_db)):
    """Update an alert rule."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    return {
        "id": rule.id,
        "name": rule.name,
        "description": rule.description,
        "company_id": rule.company_id,
        "trigger_severity": rule.trigger_severity,
        "trigger_pattern": rule.trigger_pattern,
        "trigger_count": rule.trigger_count,
        "trigger_window_hours": rule.trigger_window_hours,
        "channel": rule.channel,
        "destination": rule.destination,
        "is_active": rule.is_active,
        "last_triggered_at": rule.last_triggered_at.isoformat() if rule.last_triggered_at else None,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, db: Session = Depends(get_db)):
    """Hard delete rule and its firings."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.query(AlertFiring).filter(AlertFiring.rule_id == rule_id).delete()
    db.delete(rule)
    db.commit()
    return {"deleted": True}


def _rule_matches_bundle(rule: AlertRule, bundle: Bundle, findings: List[Finding]) -> bool:
    if rule.company_id and bundle.company_id != rule.company_id:
        return False
    if rule.trigger_severity:
        if (rule.trigger_severity or "").lower() == "any":
            if not findings:
                return False
        else:
            sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
            rule_sev = sev_order.get((rule.trigger_severity or "").lower(), -1)
            if not any(sev_order.get(f.severity.lower(), 5) <= rule_sev for f in findings):
                return False
    if rule.trigger_pattern:
        pattern_lower = (rule.trigger_pattern or "").lower()
        if pattern_lower and not any(pattern_lower in (f.title or "").lower() for f in findings):
            return False
    return True


@router.post("/rules/{rule_id}/test")
def test_rule(rule_id: str, db: Session = Depends(get_db)):
    """Simulate firing: check if any bundle in the last trigger_window_hours matches the rule."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    window_start = datetime.utcnow() - timedelta(hours=rule.trigger_window_hours or 24)
    bundles = (
        db.query(Bundle)
        .filter(Bundle.status == "completed", Bundle.upload_time >= window_start)
        .all()
    )
    matching = []
    for b in bundles:
        findings = db.query(Finding).filter(Finding.bundle_id == b.id).all()
        if _rule_matches_bundle(rule, b, findings):
            matching.append({"bundle_id": b.id, "filename": b.filename, "company_id": b.company_id})
    return {
        "would_fire": len(matching) > 0,
        "matching_bundles": matching,
        "message": f"{len(matching)} bundle(s) in the last {rule.trigger_window_hours}h match this rule." if matching else "No bundles in the time window match this rule.",
    }


@router.get("/firings")
def list_firings(db: Session = Depends(get_db)):
    """Return recent alert firings (last 50) with rule name and bundle filename."""
    firings = (
        db.query(AlertFiring, AlertRule, Bundle)
        .join(AlertRule, AlertFiring.rule_id == AlertRule.id)
        .outerjoin(Bundle, AlertFiring.bundle_id == Bundle.id)
        .order_by(AlertFiring.triggered_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": f.id,
            "rule_id": f.rule_id,
            "rule_name": r.name,
            "bundle_id": f.bundle_id,
            "bundle_filename": b.filename if b else None,
            "company_id": f.company_id,
            "triggered_at": f.triggered_at.isoformat() if f.triggered_at else None,
        }
        for f, r, b in firings
    ]
