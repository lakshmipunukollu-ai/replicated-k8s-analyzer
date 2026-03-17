import uuid
from app.database import SessionLocal
from app.models import Company, Project


def seed():
    db = SessionLocal()
    companies = [
        {"name": "Acme Corp", "slug": "acme-corp", "tier": "enterprise",
         "projects": [{"name": "acme-commerce", "app_version": "v2.1.4"},
                      {"name": "acme-payments", "app_version": "v1.8.0"}]},
        {"name": "Globex Industries", "slug": "globex", "tier": "growth",
         "projects": [{"name": "globex-platform", "app_version": "v3.0.1"},
                      {"name": "globex-api", "app_version": "v1.2.0"}]},
        {"name": "Initech LLC", "slug": "initech", "tier": "starter",
         "projects": [{"name": "initech-core", "app_version": "v0.9.5"},
                      {"name": "initech-reporting", "app_version": "v0.4.0"}]},
    ]
    for c_data in companies:
        existing = db.query(Company).filter(Company.slug == c_data["slug"]).first()
        if existing:
            continue
        company = Company(id=str(uuid.uuid4()), name=c_data["name"],
                          slug=c_data["slug"], tier=c_data["tier"])
        db.add(company)
        db.flush()
        for p_data in c_data["projects"]:
            project = Project(id=str(uuid.uuid4()), company_id=company.id,
                              name=p_data["name"], app_version=p_data["app_version"])
            db.add(project)
    db.commit()
    print("Seed complete.")


if __name__ == "__main__":
    seed()
