"""Companies and projects API."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, Project, Bundle, Finding

router = APIRouter(tags=["companies"])


def _health_score(bundle: Bundle, db: Session) -> int:
    findings = db.query(Finding).filter(Finding.bundle_id == bundle.id).all()
    critical = len([f for f in findings if f.severity == "critical"])
    high = len([f for f in findings if f.severity == "high"])
    return max(0, 100 - critical * 25 - high * 10 - len(findings) * 3)


class CompanyCreate(BaseModel):
    name: str
    tier: Optional[str] = "starter"


class ProjectCreate(BaseModel):
    name: str
    app_version: Optional[str] = None


@router.get("/companies")
def list_companies(db: Session = Depends(get_db)):
    """List all companies with project_count, bundle_count, avg_health_score."""
    companies = db.query(Company).all()
    result = []
    for c in companies:
        project_count = db.query(Project).filter(Project.company_id == c.id).count()
        bundles = db.query(Bundle).filter(Bundle.company_id == c.id).all()
        bundle_count = len(bundles)
        scores = []
        for b in bundles:
            if b.status == "completed":
                scores.append(_health_score(b, db))
        avg_health_score = round(sum(scores) / len(scores), 1) if scores else None
        result.append({
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "tier": c.tier,
            "project_count": project_count,
            "bundle_count": bundle_count,
            "avg_health_score": avg_health_score,
        })
    return result


@router.post("/companies")
def create_company(body: CompanyCreate, db: Session = Depends(get_db)):
    """Create a company. Slug is auto-generated from name."""
    slug = body.name.lower().replace(" ", "-")
    existing = db.query(Company).filter(Company.slug == slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Company with this slug already exists")
    company = Company(name=body.name, slug=slug, tier=body.tier or "starter")
    db.add(company)
    db.commit()
    db.refresh(company)
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "tier": company.tier,
        "created_at": company.created_at.isoformat() if company.created_at else None,
    }


@router.get("/companies/{company_id}")
def get_company(company_id: str, db: Session = Depends(get_db)):
    """Get company with nested projects (bundle_count, last_bundle_date per project)."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    projects = db.query(Project).filter(Project.company_id == company_id).all()
    projects_data = []
    for p in projects:
        bundles = db.query(Bundle).filter(Bundle.project_id == p.id).order_by(Bundle.upload_time.desc()).all()
        bundle_count = len(bundles)
        last_bundle_date = bundles[0].upload_time.isoformat() if bundles and bundles[0].upload_time else None
        projects_data.append({
            "id": p.id,
            "name": p.name,
            "app_version": p.app_version,
            "bundle_count": bundle_count,
            "last_bundle_date": last_bundle_date,
        })
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "tier": company.tier,
        "projects": projects_data,
    }


@router.post("/companies/{company_id}/projects")
def create_project(company_id: str, body: ProjectCreate, db: Session = Depends(get_db)):
    """Create a project under a company."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    project = Project(company_id=company_id, name=body.name, app_version=body.app_version)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        "id": project.id,
        "company_id": project.company_id,
        "name": project.name,
        "app_version": project.app_version,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@router.get("/projects/{project_id}/bundles")
def list_project_bundles(project_id: str, db: Session = Depends(get_db)):
    """List bundles for a project, ordered by upload_time desc."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    bundles = db.query(Bundle).filter(Bundle.project_id == project_id).order_by(Bundle.upload_time.desc()).all()
    return [
        {
            "id": b.id,
            "filename": b.filename,
            "file_size": b.file_size,
            "status": b.status,
            "upload_time": b.upload_time.isoformat() if b.upload_time else None,
            "finding_count": db.query(Finding).filter(Finding.bundle_id == b.id).count(),
        }
        for b in bundles
    ]
