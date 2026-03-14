# Story 3: Known Pattern Matching

## Description
As the system, I can match extracted signals against a library of known K8s failure patterns to produce findings without LLM calls.

## Acceptance Criteria
- PatternMatcher has library of common K8s failure patterns
- Patterns include: OOMKill, CrashLoopBackOff, ImagePullBackOff, PVC pending, node pressure, DNS failures
- Each pattern produces a structured Finding with severity, evidence, root_cause, recommended_actions
- Findings include confidence scores
- Source marked as "pattern_match"

## Technical Notes
- Pattern library is a list of rule objects with conditions and finding templates
- Zero LLM cost for known patterns
- Patterns should be extensible
