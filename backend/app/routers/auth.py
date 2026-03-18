from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    require_admin,
    verify_password,
)
from app.database import get_db
from app.models import User, Company

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str


class RegisterBody(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    role: str = "company_user"
    company_id: Optional[str] = None


class UpdateUserBody(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    company_id: Optional[str] = None
    is_active: Optional[bool] = None


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    """Authenticate and return JWT and user info."""
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user.last_login = datetime.utcnow()
    db.commit()
    token = create_access_token(
        str(user.id), user.email, user.role or "company_user", user.company_id
    )
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "company_id": user.company_id,
        },
    }


@router.post("/register")
def register(body: RegisterBody, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Create a new user (admin only)."""
    email = body.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    role = (body.role or "company_user").strip().lower()
    if role not in ("admin", "company_user"):
        raise HTTPException(status_code=400, detail="role must be admin or company_user")
    if role == "company_user" and body.company_id:
        company = db.query(Company).filter(Company.id == body.company_id).first()
        if not company:
            raise HTTPException(status_code=400, detail="Company not found")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        name=(body.name or "").strip() or None,
        role=role,
        company_id=body.company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "company_id": user.company_id,
        "is_active": user.is_active,
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return current user info from JWT."""
    company_name = None
    if current_user.company_id:
        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        company_name = company.name if company else None
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "company_id": current_user.company_id,
        "company_name": company_name,
    }


@router.post("/logout")
def logout():
    """Client-side only; JWT is stateless."""
    return {"ok": True}


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update user (admin only). Cannot change own role."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None and user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    if body.name is not None:
        user.name = (body.name or "").strip() or None
    if body.role is not None:
        if body.role not in ("admin", "company_user"):
            raise HTTPException(status_code=400, detail="role must be admin or company_user")
        user.role = body.role
    if body.company_id is not None:
        user.company_id = body.company_id
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "company_id": user.company_id,
        "is_active": user.is_active,
    }


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Soft delete: set is_active = false (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user.is_active = False
    db.commit()
    return {"ok": True, "user_id": user_id}


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List all users with company name (admin only)."""
    users = db.query(User).all()
    company_ids = {u.company_id for u in users if u.company_id}
    companies = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(company_ids)).all()}
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "company_id": u.company_id,
            "company_name": companies.get(u.company_id) if u.company_id else None,
            "is_active": u.is_active,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        }
        for u in users
    ]
