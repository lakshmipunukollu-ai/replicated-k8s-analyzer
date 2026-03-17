"""Finding annotations API."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Finding, FindingAnnotation, Bundle

router = APIRouter(tags=["annotations"])

VALID_ANNOTATION_TYPES = ("note", "action_taken", "customer_update")


class AnnotationCreate(BaseModel):
    author: Optional[str] = "Support Engineer"
    content: str
    annotation_type: Optional[str] = "note"


class AnnotationUpdate(BaseModel):
    content: str


def _verify_finding_belongs_to_bundle(db: Session, bundle_id: str, finding_id: str) -> Finding:
    finding = db.query(Finding).filter(Finding.id == finding_id, Finding.bundle_id == bundle_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return finding


@router.get("/bundles/{bundle_id}/findings/{finding_id}/annotations")
def list_annotations(bundle_id: str, finding_id: str, db: Session = Depends(get_db)):
    """Return all annotations for a finding, ordered by created_at asc."""
    _verify_finding_belongs_to_bundle(db, bundle_id, finding_id)
    rows = (
        db.query(FindingAnnotation)
        .filter(FindingAnnotation.finding_id == finding_id, FindingAnnotation.bundle_id == bundle_id)
        .order_by(FindingAnnotation.created_at.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "author": r.author,
            "content": r.content,
            "annotation_type": r.annotation_type,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/bundles/{bundle_id}/findings/{finding_id}/annotations")
def create_annotation(bundle_id: str, finding_id: str, body: AnnotationCreate, db: Session = Depends(get_db)):
    """Create an annotation for a finding."""
    _verify_finding_belongs_to_bundle(db, bundle_id, finding_id)
    if body.annotation_type and body.annotation_type not in VALID_ANNOTATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"annotation_type must be one of: {VALID_ANNOTATION_TYPES}",
        )
    ann = FindingAnnotation(
        finding_id=finding_id,
        bundle_id=bundle_id,
        author=body.author or "Support Engineer",
        content=body.content,
        annotation_type=body.annotation_type or "note",
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return {
        "id": ann.id,
        "author": ann.author,
        "content": ann.content,
        "annotation_type": ann.annotation_type,
        "created_at": ann.created_at.isoformat() if ann.created_at else None,
    }


@router.patch("/annotations/{annotation_id}")
def update_annotation(annotation_id: str, body: AnnotationUpdate, db: Session = Depends(get_db)):
    """Update annotation content only."""
    ann = db.query(FindingAnnotation).filter(FindingAnnotation.id == annotation_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    ann.content = body.content
    db.commit()
    db.refresh(ann)
    return {
        "id": ann.id,
        "author": ann.author,
        "content": ann.content,
        "annotation_type": ann.annotation_type,
        "created_at": ann.created_at.isoformat() if ann.created_at else None,
        "updated_at": ann.updated_at.isoformat() if ann.updated_at else None,
    }


@router.delete("/annotations/{annotation_id}")
def delete_annotation(annotation_id: str, db: Session = Depends(get_db)):
    """Hard delete an annotation."""
    ann = db.query(FindingAnnotation).filter(FindingAnnotation.id == annotation_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    db.delete(ann)
    db.commit()
    return {"deleted": True}
