import uuid

from app.auth import hash_password
from app.database import SessionLocal
from app.models import User, Company


def seed():
    db = SessionLocal()

    admin = db.query(User).filter(User.email == "admin@replicated.com").first()
    if not admin:
        admin = User(
            id=str(uuid.uuid4()),
            email="admin@replicated.com",
            password_hash=hash_password("admin123"),
            name="Replicated Admin",
            role="admin",
            company_id=None,
        )
        db.add(admin)

    companies = db.query(Company).all()
    for company in companies:
        email = f"admin@{company.slug}.com"
        existing = db.query(User).filter(User.email == email).first()
        if not existing:
            user = User(
                id=str(uuid.uuid4()),
                email=email,
                password_hash=hash_password("company123"),
                name=f"{company.name} Admin",
                role="company_user",
                company_id=company.id,
            )
            db.add(user)

    db.commit()
    print("Users seeded:")
    print("  admin@replicated.com / admin123 (admin - sees everything)")
    for company in companies:
        print(f"  admin@{company.slug}.com / company123 (company_user - scoped to {company.name})")
    db.close()


if __name__ == "__main__":
    seed()
