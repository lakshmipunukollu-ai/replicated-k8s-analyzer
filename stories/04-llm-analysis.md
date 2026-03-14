# Story 4: LLM-Powered Analysis

## Description
As the system, I can use Claude to analyze signals not covered by known patterns, providing deep K8s expert reasoning.

## Acceptance Criteria
- LLMAnalyzer sends unknown signals + log excerpts to Claude API
- Uses K8s SRE expert system prompt
- LogChunker splits large logs into context-appropriate windows
- Response parsed into structured Finding objects
- Findings include evidence, root cause, recommendations
- Source marked as "llm_analysis"
- Retry logic for API failures
- Streaming progress events during LLM analysis

## Technical Notes
- Use shared/llm_client.py as base
- System prompt bakes in K8s failure pattern knowledge
- Request structured JSON output from LLM
