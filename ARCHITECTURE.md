# Replicated K8s Bundle Analyzer - Architecture

## Overview

An AI-powered Kubernetes support bundle analyzer that extracts structured signals from `.tar.gz` support bundles, matches known failure patterns, uses Claude LLM for deep correlation analysis, and presents findings through a streaming real-time UI.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Next.js 14  │  │   FastAPI    │  │  PostgreSQL   │  │
│  │  Frontend    │──│   Backend    │──│   Database    │  │
│  │  Port 3000   │  │  Port 8000   │  │  Port 5432   │  │
│  └──────────────┘  └──────┬───────┘  └──────────────┘  │
│                           │                             │
│                    ┌──────┴───────┐                     │
│                    │  Local S3 /  │                     │
│                    │  File Store  │                     │
│                    └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

## Data Models

### Bundle
```
bundles
├── id              UUID (PK)
├── filename        VARCHAR(255)
├── file_size       BIGINT
├── file_path       VARCHAR(500)
├── status          VARCHAR(50) - uploaded|extracting|analyzing|completed|failed
├── upload_time     TIMESTAMP
├── analysis_start  TIMESTAMP (nullable)
├── analysis_end    TIMESTAMP (nullable)
├── error_message   TEXT (nullable)
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

### Finding
```
findings
├── id                  UUID (PK)
├── bundle_id           UUID (FK -> bundles.id)
├── severity            VARCHAR(20) - critical|high|medium|low|info
├── category            VARCHAR(50) - resource|storage|network|config|node|application
├── title               VARCHAR(500)
├── summary             TEXT
├── root_cause          TEXT
├── impact              TEXT
├── confidence          FLOAT
├── source              VARCHAR(50) - pattern_match|llm_analysis|correlation
├── recommended_actions JSON (list of strings)
├── related_findings    JSON (list of finding IDs)
├── evidence            JSON (list of evidence objects)
├── created_at          TIMESTAMP
└── updated_at          TIMESTAMP
```

### AnalysisEvent (for SSE streaming)
```
analysis_events
├── id          UUID (PK)
├── bundle_id   UUID (FK -> bundles.id)
├── event_type  VARCHAR(50) - progress|finding|error|complete
├── data        JSON
├── created_at  TIMESTAMP
└── sequence    INTEGER
```

## API Contracts

### POST /bundles/upload
Upload a support bundle `.tar.gz` file.

**Request:** multipart/form-data with `file` field
**Response (201):**
```json
{
  "id": "uuid",
  "filename": "support-bundle.tar.gz",
  "status": "uploaded",
  "upload_time": "2024-01-01T00:00:00Z"
}
```

### GET /bundles
List all bundles.

**Response (200):**
```json
{
  "bundles": [
    {
      "id": "uuid",
      "filename": "support-bundle.tar.gz",
      "status": "completed",
      "upload_time": "...",
      "finding_count": 5
    }
  ]
}
```

### GET /bundles/{id}
Get bundle details.

**Response (200):**
```json
{
  "id": "uuid",
  "filename": "...",
  "status": "completed",
  "upload_time": "...",
  "analysis_start": "...",
  "analysis_end": "...",
  "file_size": 1024000
}
```

### GET /bundles/{id}/status
Stream analysis progress via SSE.

**Response:** text/event-stream
```
event: progress
data: {"step": "extracting", "progress": 20, "message": "Extracting bundle..."}

event: finding
data: {"id": "uuid", "severity": "critical", "title": "OOMKill detected", ...}

event: complete
data: {"total_findings": 5, "duration_seconds": 12.3}
```

### GET /bundles/{id}/report
Get full analysis report.

**Response (200):**
```json
{
  "bundle_id": "uuid",
  "status": "completed",
  "summary": {
    "total_findings": 5,
    "by_severity": {"critical": 1, "high": 2, "medium": 1, "low": 1},
    "by_category": {"resource": 2, "network": 1, "config": 2},
    "analysis_duration_seconds": 12.3
  },
  "findings": [
    {
      "id": "uuid",
      "severity": "critical",
      "category": "resource",
      "title": "OOMKill detected on pod api-server",
      "summary": "Pod was killed due to exceeding memory limits...",
      "root_cause": "Container memory limit set to 256Mi but actual usage peaks at 512Mi",
      "impact": "Service unavailability, request failures",
      "evidence": [
        {"type": "log_line", "source": "pod-logs/api-server.log", "content": "OOMKilled", "line": 1234}
      ],
      "recommended_actions": [
        "Increase memory limit to at least 512Mi",
        "Check for memory leaks in the application"
      ],
      "related_findings": ["uuid2"],
      "confidence": 0.95,
      "source": "pattern_match"
    }
  ]
}
```

### POST /bundles/{id}/analyze
Trigger analysis for an uploaded bundle.

**Response (202):**
```json
{
  "bundle_id": "uuid",
  "status": "analyzing",
  "message": "Analysis started"
}
```

### GET /health
Health check endpoint.

**Response (200):**
```json
{
  "status": "healthy",
  "service": "replicated-k8s-analyzer",
  "version": "1.0.0"
}
```

## Analysis Pipeline

### Step 1: BundleExtractor
- Unpacks `.tar.gz` file
- Indexes all files by type (logs, YAML manifests, JSON status)
- Builds a file tree map

### Step 2: SignalExtractor
Extracts structured signals deterministically from bundle contents:
- **failed_pods**: Pods in CrashLoopBackOff, Error, ImagePullBackOff
- **oom_kills**: OOMKill events from pod logs and node events
- **pending_pvcs**: PVCs stuck in Pending state
- **node_conditions**: NotReady nodes, disk/memory pressure
- **recent_events**: Warning-level K8s events
- **resource_pressure**: CPU/memory utilization anomalies
- **crashloop_backoffs**: Containers in CrashLoopBackOff

### Step 3: PatternMatcher
Matches extracted signals against known K8s failure patterns:
- OOMKill + memory limit = container memory limit too low
- CrashLoopBackOff + ImagePullBackOff = image configuration error
- PVC Pending + no StorageClass = missing storage provisioner
- Node NotReady + disk pressure = node disk full
- DNS resolution failure + CoreDNS crash = cluster DNS outage

### Step 4: LLMAnalyzer
For signals not covered by known patterns:
- Chunks log data into context windows
- Sends structured signals + log excerpts to Claude
- Uses K8s SRE expert system prompt
- Parses structured JSON findings from response

### Step 5: ReportBuilder
- Merges pattern-matched and LLM findings
- Deduplicates similar findings
- Correlates related findings (same root cause)
- Ranks by severity and actionability
- Produces final structured report

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | FastAPI + Python | Best LLM library support, fast async |
| Frontend | Next.js 14 | SSE streaming support, React Server Components |
| Database | PostgreSQL | Reliable, JSON column support for evidence |
| ORM | SQLAlchemy 1.4 | session.query() style, mature ecosystem |
| File Storage | Local filesystem | Simpler for demo; S3-compatible interface |
| LLM | Claude API (Anthropic) | Best reasoning for complex K8s analysis |
| Streaming | Server-Sent Events | Native browser support, simpler than WebSocket |

## Directory Structure

```
/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app with lifespan
│   │   ├── config.py            # Settings from .env
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── routers/
│   │   │   ├── bundles.py       # Bundle CRUD + upload
│   │   │   └── health.py        # Health check
│   │   └── services/
│   │       ├── analyzer.py      # Main analysis pipeline
│   │       ├── extractor.py     # Bundle extraction
│   │       ├── signal_extractor.py  # Structured signal extraction
│   │       ├── pattern_matcher.py   # Known pattern matching
│   │       ├── llm_analyzer.py      # LLM-powered analysis
│   │       └── report_builder.py    # Report generation
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Home / upload page
│   │   │   ├── layout.tsx       # Root layout
│   │   │   ├── bundles/
│   │   │   │   ├── page.tsx     # Bundle list
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx # Bundle detail + live analysis
│   │   │   │       └── report/
│   │   │   │           └── page.tsx # Full report
│   │   ├── components/
│   │   │   ├── BundleUpload.tsx
│   │   │   ├── BundleList.tsx
│   │   │   ├── AnalysisProgress.tsx
│   │   │   ├── FindingCard.tsx
│   │   │   ├── ReportView.tsx
│   │   │   └── SeverityBadge.tsx
│   │   └── lib/
│   │       └── api.ts           # API client
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── Makefile
├── .env
└── ARCHITECTURE.md
```

## Environment Variables (.env)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/k8s_analyzer
ANTHROPIC_API_KEY=sk-ant-xxx
UPLOAD_DIR=./uploads
SECRET_KEY=your-secret-key
CORS_ORIGINS=http://localhost:3000
```

## Deviations from Brief

1. **Local file storage instead of S3**: Using local filesystem with S3-compatible interface pattern for simpler local development. Can swap to real S3 with minimal changes.
2. **No Redis queue**: Analysis runs in-process with async/await. For production scale, would add Redis-backed job queue. Current approach is simpler and sufficient for demo.
3. **Auth simplified**: JWT auth is available via shared module but not enforced on all endpoints for demo simplicity. Can be enabled per-route.
