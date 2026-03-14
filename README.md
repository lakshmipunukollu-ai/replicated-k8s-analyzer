# Replicated K8s Bundle Analyzer

AI-powered Kubernetes support bundle analyzer that extracts structured signals from `.tar.gz` support bundles, matches known failure patterns, uses Claude LLM for deep correlation analysis, and presents findings through a streaming real-time UI.

## Architecture

- **Backend**: FastAPI (Python) on port 3002
- **Frontend**: Next.js 14 (React/TypeScript) on port 5002
- **Database**: PostgreSQL (`replicated_analyzer`)
- **ORM**: SQLAlchemy 1.4 (session.query style)
- **LLM**: Claude API via Anthropic SDK

## Quick Start

```bash
# Install dependencies
make install

# Seed the database with sample data
make seed

# Start development servers
make dev

# Run tests
make test

# Build frontend for production
make build
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/bundles/upload` | Upload a .tar.gz support bundle |
| GET | `/bundles` | List all bundles |
| GET | `/bundles/{id}` | Get bundle details |
| POST | `/bundles/{id}/analyze` | Trigger analysis |
| GET | `/bundles/{id}/status` | Stream analysis progress (SSE) |
| GET | `/bundles/{id}/report` | Get full analysis report |

## Analysis Pipeline

1. **BundleExtractor** - Unpacks .tar.gz, indexes files by type
2. **SignalExtractor** - Deterministic signal extraction (OOM, CrashLoop, node pressure, etc.)
3. **PatternMatcher** - Matches signals against known K8s failure patterns
4. **LLMAnalyzer** - Claude-powered deep analysis for unknown patterns
5. **ReportBuilder** - Merges, deduplicates, correlates, and ranks findings

## Environment Variables

Configure in `.env`:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/replicated_analyzer
ANTHROPIC_API_KEY=sk-ant-xxx
UPLOAD_DIR=./uploads
```

## Tests

35 tests covering health endpoint, bundle CRUD, file upload, report generation, database models, signal extraction, pattern matching, report building, and LLM analyzer fallback.

```bash
make test
```
