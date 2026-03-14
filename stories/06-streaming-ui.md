# Story 6: Streaming UI & Real-Time Progress

## Description
As a user, I can see real-time analysis progress and findings as they are discovered via Server-Sent Events.

## Acceptance Criteria
- GET /bundles/{id}/status streams SSE events
- Events: progress (step, percentage), finding (as discovered), error, complete
- Frontend connects to SSE stream on bundle detail page
- Progress bar shows extraction/analysis progress
- Findings appear in real-time as cards
- Complete event triggers full report view
- Works across page refreshes (can reconnect to stream)

## Technical Notes
- FastAPI StreamingResponse with text/event-stream
- Next.js EventSource API on client
- Analysis events stored in database for replay
