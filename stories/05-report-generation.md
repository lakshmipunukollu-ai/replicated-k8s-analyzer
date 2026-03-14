# Story 5: Report Generation & Correlation

## Description
As the system, I can merge findings, correlate related issues, and produce a final structured report.

## Acceptance Criteria
- ReportBuilder merges pattern_match and llm_analysis findings
- Deduplicates similar findings
- Correlates related findings (same root cause)
- Ranks by severity: critical > high > medium > low > info
- GET /bundles/{id}/report returns full structured report
- Report includes summary with counts by severity and category
- Bundle status transitions to "completed" after report generation

## Technical Notes
- related_findings field links correlated issues
- Summary statistics computed from findings list
