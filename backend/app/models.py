import uuid
from datetime import datetime
from sqlalchemy import Column, String, BigInteger, Float, Integer, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    role = Column(String(50), default="company_user")  # "admin" or "company_user"
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    company = relationship("Company", back_populates="users")


class Company(Base):
    __tablename__ = "companies"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    tier = Column(String(50), default="starter")  # starter, growth, enterprise
    created_at = Column(DateTime, default=datetime.utcnow)
    projects = relationship("Project", back_populates="company", cascade="all, delete-orphan")
    users = relationship("User", back_populates="company")


class Project(Base):
    __tablename__ = "projects"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)
    name = Column(String(255), nullable=False)
    app_version = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    company = relationship("Company", back_populates="projects")
    bundles = relationship("Bundle", back_populates="project")


class Bundle(Base):
    __tablename__ = "bundles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    filename = Column(String(255), nullable=False)
    file_size = Column(BigInteger, default=0)
    file_path = Column(String(500), nullable=True)
    s3_key = Column(String(500), nullable=True)
    status = Column(String(50), default="uploaded")
    previous_status = Column(String(50), nullable=True)  # set when archiving, used by restore
    upload_time = Column(DateTime, default=datetime.utcnow)
    analysis_start = Column(DateTime, nullable=True)
    analysis_end = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    ai_name = Column(Text, nullable=True)
    cluster_profile = Column(JSON, nullable=True)
    version_count = Column(Integer, default=1)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    app_version = Column(String(50), nullable=True)
    assigned_to = Column(String(255), nullable=True)
    triage_status = Column(String(50), default="unassigned")  # unassigned|open|in_progress|resolved
    assigned_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="bundles")
    findings = relationship("Finding", back_populates="bundle", cascade="all, delete-orphan")
    events = relationship("AnalysisEvent", back_populates="bundle", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bundle_id = Column(String(36), ForeignKey("bundles.id"), nullable=False)
    severity = Column(String(20), nullable=False)
    category = Column(String(50), nullable=False)
    title = Column(String(500), nullable=False)
    summary = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    impact = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)
    source = Column(String(50), default="pattern_match")
    recommended_actions = Column(JSON, default=list)
    related_findings = Column(JSON, default=list)
    evidence = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bundle = relationship("Bundle", back_populates="findings")


class FindingAnnotation(Base):
    __tablename__ = "finding_annotations"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    finding_id = Column(String(36), ForeignKey("findings.id"), nullable=False)
    bundle_id = Column(String(36), ForeignKey("bundles.id"), nullable=False)
    author = Column(String(255), default="Support Engineer")
    content = Column(Text, nullable=False)
    annotation_type = Column(String(50), default="note")  # note|action_taken|customer_update
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AlertRule(Base):
    __tablename__ = "alert_rules"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=True)
    trigger_severity = Column(String(20), nullable=True)  # critical|high|any
    trigger_pattern = Column(String(255), nullable=True)
    trigger_count = Column(Integer, default=1)
    trigger_window_hours = Column(Integer, default=24)
    channel = Column(String(50), default="slack")  # slack|email|webhook
    destination = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    firings = relationship("AlertFiring", back_populates="rule", cascade="all, delete-orphan")


class AlertFiring(Base):
    __tablename__ = "alert_firings"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    rule_id = Column(String(36), ForeignKey("alert_rules.id"), nullable=False)
    bundle_id = Column(String(36), ForeignKey("bundles.id"), nullable=True)
    company_id = Column(String(36), nullable=True)
    triggered_at = Column(DateTime, default=datetime.utcnow)
    payload = Column(JSON, default=dict)
    rule = relationship("AlertRule", back_populates="firings")


class AnalysisVersion(Base):
    __tablename__ = "analysis_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bundle_id = Column(String(36), ForeignKey("bundles.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    finding_count = Column(Integer, default=0)
    health_score = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    findings_snapshot = Column(JSON, nullable=True)


class SearchIndex(Base):
    __tablename__ = "search_index"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bundle_id = Column(String(36), ForeignKey("bundles.id"), nullable=False)
    finding_id = Column(String(36), nullable=False)
    content = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False)
    title = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AnalysisEvent(Base):
    __tablename__ = "analysis_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bundle_id = Column(String(36), ForeignKey("bundles.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    data = Column(JSON, default=dict)
    sequence = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    bundle = relationship("Bundle", back_populates="events")


class SuppressionRule(Base):
    __tablename__ = "suppression_rules"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=True)
    pattern = Column(String(255), nullable=False)
    reason = Column(Text, nullable=True)
    created_by = Column(String(255), default="Support Engineer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
