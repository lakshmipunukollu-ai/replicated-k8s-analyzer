# Story 2: Bundle Extraction & Signal Extraction

## Description
As the system, I can extract a .tar.gz support bundle and pull structured signals from its contents.

## Acceptance Criteria
- BundleExtractor unpacks .tar.gz and indexes file tree
- SignalExtractor identifies: failed pods, OOM kills, crashloop backoffs, pending PVCs, node conditions, recent events, resource pressure
- Extraction is deterministic (no LLM cost)
- Progress events emitted during extraction
- Bundle status transitions: uploaded -> extracting -> analyzing

## Technical Notes
- Use tarfile module for extraction
- Parse YAML manifests, JSON status files, log files
- Regex-based signal detection for known patterns
