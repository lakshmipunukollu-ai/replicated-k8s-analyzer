# Story 1: Support Bundle Upload

## Description
As a user, I can upload a K8s support bundle (.tar.gz) file through the UI or API so it can be analyzed.

## Acceptance Criteria
- POST /bundles/upload accepts multipart/form-data with .tar.gz file
- File is saved to local storage (UPLOAD_DIR)
- Bundle record created in database with status "uploaded"
- Response includes bundle ID, filename, status, upload_time
- Frontend has drag-and-drop upload component
- File size validation (max 500MB)
- Only .tar.gz files accepted

## Technical Notes
- Use FastAPI UploadFile for file handling
- Store file path in database, actual file on disk
- Generate UUID for bundle ID
