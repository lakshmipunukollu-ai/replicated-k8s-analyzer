# PROJECT BRIEF
# (Extracted from MASTER_PROJECT_PLAYBOOK.md — your section only)

## SENIOR ENGINEER DECISIONS — READ FIRST

Before any code is written, here are the opinionated decisions made across all 9 projects
and why. An agent should never second-guess these unless given new information.

### Stack choices made
| Project | Backend | Frontend | DB | Deploy | Rationale |
|---------|---------|---------|-----|--------|-----------|
| FSP Scheduler | TypeScript + Node.js | React + TypeScript | PostgreSQL (multi-tenant) | Azure Container Apps | TS chosen over C# — same Azure ecosystem, better AI library support, faster iteration |
| Replicated | Python + FastAPI | Next.js 14 | PostgreSQL + S3 | Docker | Python wins for LLM tooling; Next.js for real-time streaming UI |
| ServiceCore | Node.js + Express | Angular (required) | PostgreSQL | Railway | Angular required — clean REST API behind it |
| Zapier | Python + FastAPI | None (API only + optional React dashboard) | PostgreSQL + Redis | Railway | Redis for event queue durability; Python for DX-first API |
| ST6 | Java 21 + Spring Boot | TypeScript micro-frontend (React) | PostgreSQL | Docker | Java required — Spring Boot is the senior choice; React micro-frontend mounts into PA host |
| ZeroPath | Python + FastAPI | React + TypeScript | PostgreSQL | Render | Python for LLM scanning logic; React for triage dashboard |
| Medbridge | Python + FastAPI + LangGraph | None (webhook-driven) | PostgreSQL | Railway | LangGraph is the correct tool for state-machine AI agents |
| CompanyCam | Python + FastAPI | React + TypeScript | PostgreSQL | Render | Python for CV/ML inference; React for annotation UI |
| Upstream | Django + DRF | React + TypeScript | PostgreSQL | Render | Django for rapid e-commerce scaffolding; built-in admin is a bonus |

### The 4 shared modules — build these FIRST
These are the highest ROI pieces of work. Build them once, copy-scaffold into every project.

1. `shared/llm_client.py` — Claude API wrapper with retry, streaming, structured output parsing
2. `shared/auth/` — JWT auth + role-based guards (Python + TypeScript versions)
3. `shared/state_machine.py` — Generic FSM: states, transitions, guards, event log
4. `shared/queue/` — Job queue pattern: enqueue, dequeue, ack, retry (Redis + Postgres fallback)

### Build order (wave system)
**Wave 0 (Day 1):** Build shared modules. All other waves depend on these.
**Wave 1 (Days 2-3):** Zapier + ZeroPath — establish LLM pipeline + REST API patterns
**Wave 2 (Days 4-5):** Medbridge + Replicated — LLM pipeline variants, more complex AI
**Wave 3 (Days 6-8):** FSP + ST6 — complex business logic, approval flows
**Wave 4 (Days 9-11):** ServiceCore + Upstream + CompanyCam — isolated stacks, finish strong

---

## PROJECT 2: REPLICATED — K8S BUNDLE ANALYZER
**Company:** Replicated | **Stack:** Python + FastAPI + Next.js + PostgreSQL + S3

### Company mission to impress
Replicated helps ISVs distribute Kubernetes applications to customer-controlled environments.
Their engineers spend hours staring at support bundles. The thing that will impress them:
breadth and depth of analysis, not just log parsing. Think like a K8s SRE who has seen
every failure mode. Surface patterns. Correlate signals across sources. Don't just report
errors — explain what caused them and what to check next.

### Architecture
```
Docker
├── api (Python + FastAPI)
│   ├── POST /bundles/upload        — accepts .tar.gz, stores in S3/local
│   ├── GET  /bundles/:id/status    — analysis progress (streaming SSE)
│   └── GET  /bundles/:id/report    — structured findings
├── analyzer (Python)
│   ├── BundleExtractor             — unpack .tar.gz, index file tree
│   ├── LogChunker                  — split large logs into context windows
│   ├── SignalExtractor             — pull structured signals (pod status, events, OOMKills)
│   ├── PatternMatcher              — known K8s failure pattern library
│   ├── LLMAnalyzer                 — send chunks to Claude API with K8s expert prompt
│   └── ReportBuilder               — merge findings, deduplicate, rank by severity
└── ui (Next.js 14)
    ├── /upload                     — drag-and-drop bundle upload
    ├── /bundles/:id                — live analysis progress + streaming findings
    └── /bundles/:id/report         — full structured report with severity, correlation
```

### The analysis pipeline — this is the senior engineering thinking
```python
class BundleAnalyzer:
    """
    Senior insight: Don't just dump logs at an LLM.
    Extract structured signals first, then use LLM to reason about patterns.
    The LLM's job is correlation and explanation, not log parsing.
    """
    
    async def analyze(self, bundle_path: str) -> AnalysisReport:
        # Step 1: Extract structured signals (deterministic, fast)
        signals = await self.extract_signals(bundle_path)
        # signals = {
        #   "failed_pods": [...],
        #   "oom_kills": [...],
        #   "crashloop_backoffs": [...],
        #   "pending_pvcs": [...],
        #   "node_conditions": [...],
        #   "recent_events": [...],
        #   "resource_pressure": {...},
        # }
        
        # Step 2: Match known patterns (deterministic, zero LLM cost)
        known_findings = self.pattern_matcher.match(signals)
        # e.g. "OOMKill + memory limit = container memory limit too low"
        
        # Step 3: For unknown patterns, use LLM with expert K8s prompt
        unknown_signals = [s for s in signals if not known_findings.covers(s)]
        llm_findings = await self.llm_analyze(unknown_signals, signals)
        
        # Step 4: Correlate — find signals that point to same root cause
        correlated = self.correlate(known_findings + llm_findings)
        
        # Step 5: Rank by severity and actionability
        return self.build_report(correlated, signals)
```

### LLM prompt strategy — impress Replicated with your K8s depth
```python
SYSTEM_PROMPT = """You are a Kubernetes SRE with 10+ years of experience debugging
production cluster failures for enterprise software vendors.

You are analyzing a Troubleshoot support bundle. You will receive:
1. Structured signals already extracted from the bundle
2. Relevant log excerpts

Your analysis should:
- Identify the ROOT CAUSE, not just symptoms
- Correlate signals across different sources (e.g., OOMKill + node pressure + pending pods)
- Distinguish between primary causes and cascading effects
- Prioritize by: data loss risk > service unavailability > performance degradation > warnings
- For each finding, provide: what happened, why it happened, what to check next

Common patterns you know well:
- Resource starvation: OOMKills, CPU throttling, evictions
- Storage issues: pending PVCs, full volumes, slow mounts
- Network problems: DNS failures, CNI issues, service discovery
- Configuration errors: missing secrets, wrong image tags, invalid RBAC
- Node issues: disk pressure, memory pressure, NotReady conditions

Output structured JSON matching the FindingSchema provided."""
```

### Report structure — breadth is what they grade on
```python
class Finding(BaseModel):
    id: str
    severity: Literal["critical", "high", "medium", "low", "info"]
    category: str  # "resource", "storage", "network", "config", "node", "application"
    title: str
    summary: str   # 1-2 sentences, plain English
    evidence: list[Evidence]  # log lines, events, resource states that support this
    root_cause: str
    impact: str
    recommended_actions: list[str]
    related_findings: list[str]  # finding IDs that are likely connected
    confidence: float  # 0.0-1.0
    source: Literal["pattern_match", "llm_analysis", "correlation"]
```

### CLAUDE.md for Replicated agent
```
You are a senior Python engineer + K8s SRE building an AI support bundle analyzer for Replicated.

COMPANY MISSION: Help ISV developers debug Kubernetes applications in disconnected customer
environments without needing direct access to the live system.

WHAT WILL IMPRESS THEM: Breadth and quality of analysis. Not just "pod crashed" but WHY it
crashed and what else in the cluster is related. Think like an SRE, not a log parser.

ARCHITECTURE DECISIONS ALREADY MADE:
- Extract structured signals FIRST (deterministic), then use LLM for pattern correlation
- LLM prompt is K8s expert with specific failure pattern knowledge baked in
- Report has: severity, evidence, root cause, recommended actions, related findings
- Streaming SSE for real-time progress in the UI

NEVER: Send raw logs directly to LLM without extraction/chunking first
ALWAYS: Include evidence array with every finding, correlate signals across sources
KEY METRIC: Number of distinct, actionable findings per bundle
```

---


## SHARED MODULES — BUILD THESE IN WAVE 0

### shared/llm_client.py
```python
"""
Shared Claude API client. Used by: Replicated, ZeroPath, Medbridge, CompanyCam, FSP, Upstream.
Copy this file into each Python project that needs it.
"""
import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential
import json

client = anthropic.Anthropic()

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def complete(
    prompt: str,
    system: str = "",
    model: str = "claude-sonnet-4-20250514",
    max_tokens: int = 4096,
    as_json: bool = False,
) -> str | dict:
    message = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = message.content[0].text
    if as_json:
        # Strip markdown fences if present
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(clean)
    return text

async def analyze_image(
    image_b64: str,
    prompt: str,
    system: str = "",
    model: str = "claude-sonnet-4-20250514",
) -> dict:
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return json.loads(message.content[0].text)
```

### shared/auth.py (Python version)
```python
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def create_access_token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)},
        SECRET_KEY, algorithm=ALGORITHM
    )

def require_role(*roles: str):
    def dependency(token: str = Depends(oauth2_scheme)):
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("role") not in roles:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
    return dependency

# Usage: @router.get("/admin", dependencies=[Depends(require_role("admin", "manager"))])
```

### shared/state_machine.py
```python
from dataclasses import dataclass
from typing import Generic, TypeVar, Callable
from datetime import datetime

S = TypeVar('S')  # State type
E = TypeVar('E')  # Event type

@dataclass
class Transition(Generic[S, E]):
    from_state: S
    event: E
    to_state: S
    guard: Callable | None = None  # optional condition function

class StateMachine(Generic[S, E]):
    def __init__(self, initial: S, transitions: list[Transition]):
        self.state = initial
        self._transitions = {(t.from_state, t.event): t for t in transitions}
        self._log: list[dict] = []

    def transition(self, event: E, context: dict = None) -> S:
        key = (self.state, event)
        t = self._transitions.get(key)
        if not t:
            raise ValueError(f"Invalid transition: {self.state} + {event}")
        if t.guard and not t.guard(context or {}):
            raise ValueError(f"Guard failed: {self.state} + {event}")
        prev = self.state
        self.state = t.to_state
        self._log.append({"from": prev, "event": event, "to": self.state, "at": datetime.utcnow().isoformat()})
        return self.state

    @property
    def history(self) -> list[dict]:
        return self._log.copy()
```

---
