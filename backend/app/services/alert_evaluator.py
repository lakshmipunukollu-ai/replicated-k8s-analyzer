"""Alert rule evaluation — runs after bundle analysis completes."""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.models import Bundle, Finding, AlertRule, AlertFiring, generate_uuid

logger = logging.getLogger(__name__)


class AlertEvaluator:
    """Evaluate active alert rules against bundle findings and create firings."""

    def evaluate_bundle(self, bundle_id: str, db: Session) -> None:
        """
        Called after every bundle analysis completes.
        Check all active alert rules against the new bundle's findings.
        For each rule that matches, create an AlertFiring record.
        """
        bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
        if not bundle or bundle.status != "completed":
            return

        findings = db.query(Finding).filter(Finding.bundle_id == bundle_id).all()
        rules = db.query(AlertRule).filter(AlertRule.is_active == True).all()

        for rule in rules:
            if not self._rule_matches_bundle(rule, bundle, findings, db):
                continue
            # Check trigger_count: how many distinct companies hit this in window
            if rule.trigger_count > 1:
                if not self._enough_companies_hit(rule, bundle, db):
                    continue
            # Fire
            firing = AlertFiring(
                id=generate_uuid(),
                rule_id=rule.id,
                bundle_id=bundle_id,
                company_id=bundle.company_id,
                triggered_at=datetime.utcnow(),
                payload={
                    "bundle_filename": bundle.filename,
                    "finding_count": len(findings),
                },
            )
            db.add(firing)
            rule.last_triggered_at = datetime.utcnow()
            logger.info("Alert rule '%s' fired for bundle %s", rule.name, bundle_id)

        db.commit()

    def _rule_matches_bundle(
        self, rule: AlertRule, bundle: Bundle, findings: List[Finding], db: Session
    ) -> bool:
        if rule.company_id and bundle.company_id != rule.company_id:
            return False
        if not findings and (rule.trigger_severity or rule.trigger_pattern):
            return False
        if rule.trigger_severity:
            sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
            rule_sev = sev_order.get((rule.trigger_severity or "").lower(), -1)
            if rule.trigger_severity.lower() == "any":
                if not findings:
                    return False
            else:
                found = any(
                    sev_order.get(f.severity.lower(), 5) <= rule_sev
                    for f in findings
                )
                if not found:
                    return False
        if rule.trigger_pattern:
            pattern_lower = (rule.trigger_pattern or "").lower()
            if not pattern_lower:
                pass
            else:
                found = any(pattern_lower in (f.title or "").lower() for f in findings)
                if not found:
                    return False
        return True

    def _enough_companies_hit(self, rule: AlertRule, bundle: Bundle, db: Session) -> bool:
        """Check how many distinct companies hit this pattern in the last trigger_window_hours."""
        window_start = datetime.utcnow() - timedelta(hours=rule.trigger_window_hours or 24)
        rows = (
            db.query(AlertFiring.company_id)
            .filter(
                AlertFiring.rule_id == rule.id,
                AlertFiring.triggered_at >= window_start,
                AlertFiring.company_id.isnot(None),
            )
            .distinct()
            .all()
        )
        company_ids = {r[0] for r in rows}
        if bundle.company_id:
            company_ids.add(bundle.company_id)
        return len(company_ids) >= (rule.trigger_count or 1)

    def get_recent_firings_summary(self, db: Session, hours: int = 24) -> List[Dict[str, Any]]:
        """Return a summary of what fired in the last N hours."""
        since = datetime.utcnow() - timedelta(hours=hours)
        firings = (
            db.query(AlertFiring, AlertRule, Bundle)
            .join(AlertRule, AlertFiring.rule_id == AlertRule.id)
            .outerjoin(Bundle, AlertFiring.bundle_id == Bundle.id)
            .filter(AlertFiring.triggered_at >= since)
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
