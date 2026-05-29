"""
CV upload (user) and download (company) endpoints.

This module is purely a file-storage layer: PDFs are produced on the
frontend (html2pdf) and uploaded as a binary blob. No PDF generation
or HTML-to-PDF conversion happens here.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_company
from app.data import get_db
from app.data.models import User
from app.routes.cv_requests import complete_pending_cv_requests

router = APIRouter(tags=["cv-files"])

BASE_DIR = Path(__file__).resolve().parents[2]
RESUME_DIR = (BASE_DIR / "resume-builder").resolve()
RESUME_DIR.mkdir(parents=True, exist_ok=True)

SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9._\-]+$")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _safe_email_filename(email: str) -> str:
    """
    Build a filesystem-safe filename of the form ``<email-with-@-replaced>.pdf``.
    Rejects any value that would escape ``RESUME_DIR``.
    """
    cleaned = (email or "").strip().lower()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Email is required.")
    safe = cleaned.replace("@", "_")
    # Allow letters, digits, underscores, dots, and hyphens only.
    if not re.match(r"^[A-Za-z0-9._\-]+$", safe):
        raise HTTPException(status_code=400, detail="Invalid email for filename.")
    return f"{safe}.pdf"


@router.post("/upload-cv", status_code=status.HTTP_201_CREATED)
async def upload_cv(
    file: UploadFile = File(...),
    email: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Receive a PDF generated on the frontend (html2pdf) and store it under
    resume-builder/<email>.pdf (with '@' replaced by '_').
    The authenticated user must match the email in the form.
    """
    normalized_email = (email or "").strip().lower()
    if not normalized_email or current_user.email.lower() != normalized_email:
        raise HTTPException(status_code=403, detail="You can only upload your own CV.")

    original_name = os.path.basename(file.filename or "")
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large.")

    filename = _safe_email_filename(normalized_email)
    target_path = (RESUME_DIR / filename).resolve()
    if not str(target_path).startswith(str(RESUME_DIR)):
        raise HTTPException(status_code=400, detail="Invalid file path.")

    with open(target_path, "wb") as f:
        f.write(content)

    db_user = db.query(User).filter(User.id == current_user.id).first()
    if db_user:
        db_user.cv_path = filename
        complete_pending_cv_requests(db, db_user.id)
        db.commit()

    return {"message": "saved", "cv_filename": filename}


@router.get("/download-cv/{filename}")
def download_cv(
    filename: str,
    current_user: User = Depends(require_company),
):
    """
    Securely serve a candidate CV. Restricted to authenticated companies.
    """
    safe_name = os.path.basename(filename)
    if safe_name != filename or not SAFE_FILENAME_RE.match(safe_name):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    target_path = (RESUME_DIR / safe_name).resolve()

    if not str(target_path).startswith(str(RESUME_DIR)):
        raise HTTPException(status_code=403, detail="Forbidden path.")

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="CV file not found.")

    return FileResponse(
        path=str(target_path),
        filename=safe_name,
        media_type="application/pdf",
    )
