# Story 7: Diagnostics Dashboard

## Description
As a user, I can view all uploaded bundles, their analysis status, and navigate to individual reports.

## Acceptance Criteria
- GET /bundles returns list of all bundles with status and finding counts
- Frontend dashboard shows bundle list with status indicators
- Each bundle links to detail/report page
- Status shown with color coding: analyzing=blue, completed=green, failed=red
- Finding count badges on each bundle card
- Sort by upload time (newest first)

## Technical Notes
- Next.js page at /bundles
- Polling or refresh for status updates on list page
