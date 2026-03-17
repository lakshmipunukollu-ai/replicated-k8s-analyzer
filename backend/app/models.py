import uuid
from datetime import datetime
from sqlalchemy import Column, String, BigInteger, Float, Integer, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Bundle(Base):
    __tablename__ = "bundles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    filename = Column(String(255), nullable=False)
    file_size = Column(BigInteger, default=0)
    file_path = Column(String(500), nullable=True)
    status = Column(String(50), default="uploaded")
    upload_time = Column(DateTime, default=datetime.utcnow)
    analysis_start = Column(DateTime, nullable=True)
    analysis_end = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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


class AnalysisEvent(Base):
    __tablename__ = "analysis_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    bundle_id = Column(String(36), ForeignKey("bundles.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    data = Column(JSON, default=dict)
    sequence = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    bundle = relationship("Bundle", back_populates="events")
