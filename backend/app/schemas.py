from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class BundleResponse(BaseModel):
    id: str
    filename: str
    file_size: int
    status: str
    upload_time: datetime
    analysis_start: Optional[datetime] = None
    analysis_end: Optional[datetime] = None
    error_message: Optional[str] = None
    finding_count: int = 0

    class Config:
        from_attributes = True


class BundleListResponse(BaseModel):
    bundles: List[BundleResponse]


class EvidenceItem(BaseModel):
    type: str
    source: str
    content: str
    line: Optional[int] = None


class FindingResponse(BaseModel):
    id: str
    bundle_id: str
    severity: str
    category: str
    title: str
    summary: Optional[str] = None
    root_cause: Optional[str] = None
    impact: Optional[str] = None
    confidence: float
    source: str
    recommended_actions: List[str] = []
    related_findings: List[str] = []
    evidence: List[dict] = []

    class Config:
        from_attributes = True


class ReportSummary(BaseModel):
    total_findings: int
    by_severity: dict
    by_category: dict
    analysis_duration_seconds: Optional[float] = None


class ReportResponse(BaseModel):
    bundle_id: str
    status: str
    summary: ReportSummary
    findings: List[FindingResponse]


class AnalyzeResponse(BaseModel):
    bundle_id: str
    status: str
    message: str


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
