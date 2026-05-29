from __future__ import annotations

import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.data import schemas as s
from app.services.cv.cv_parser import CVParser

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/parse-cv", response_model=s.CVParseResponse)
async def parse_cv(file: UploadFile = File(...)) -> s.CVParseResponse:
    if not file.filename.lower().endswith(".pdf") or file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a PDF file.",
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            content = await file.read()
            if not content:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")
            tmp_file.write(content)
            tmp_path = tmp_file.name

        parser = CVParser(tmp_path)
        result = parser.to_response()
        return s.CVParseResponse(**result)

    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - runtime defensive handling
        # Broad except to capture parsing edge cases and return a clean API error.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse CV: {exc}",
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
