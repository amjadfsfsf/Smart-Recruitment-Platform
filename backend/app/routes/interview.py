import json
import logging
import os
import traceback
from functools import lru_cache

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.data import get_db
from app.data.models import User
from app.services.company.company_interview_service import persist_completed_interview
from app.services.jobs.role_utils import resolve_desired_job_title


logger = logging.getLogger(__name__)

router = APIRouter()

@lru_cache(maxsize=1)
def _build_service():
    from app.services.interview.InterviewService import InterviewService

    return InterviewService()


def _get_service():
    try:
        return _build_service()
    except Exception as exc:  # pragma: no cover - diagnostic only
        logger.error("Interview service initialization failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/question", tags=["interview"])
def get_question(payload: dict = Body(None)):
    svc = _get_service()
    payload = payload or {}
    desired_job_title = resolve_desired_job_title(
        payload.get("desired_job_title"),
        payload.get("target_role"),
    )
    return svc.ask_question(
        interview_type=payload.get("interview_type"),
        experience_level=payload.get("experience_level"),
        desired_job_title=desired_job_title,
        target_role=payload.get("target_role"),
        field_of_study=payload.get("field_of_study"),
        skills=payload.get("skills"),
        previous_questions=payload.get("previous_questions") or [],
        language=payload.get("language"),
    )


@router.post("/interview/start", tags=["interview"])
def start_interview(payload: dict = Body(None)):
    svc = _get_service()
    payload = payload or {}
    desired_job_title = resolve_desired_job_title(
        payload.get("desired_job_title"),
        payload.get("target_role"),
    )

    total_questions = 2
    if payload.get("totalQuestions") is not None:
        try:
            total_questions = max(1, int(payload.get("totalQuestions", 4)))
        except ValueError:
            raise HTTPException(status_code=400, detail="totalQuestions must be an integer")

    try:
        return svc.start_interview(
            total_questions=total_questions,
            interview_type=payload.get("interview_type"),
            experience_level=payload.get("experience_level"),
            desired_job_title=desired_job_title,
            target_role=payload.get("target_role"),
            field_of_study=payload.get("field_of_study"),
            skills=payload.get("skills"),
            previous_questions=payload.get("previous_questions") or [],
            language=payload.get("language"),
            speech_locale=payload.get("speechLocale") or payload.get("speech_locale"),
        )
    except Exception as exc:  # pragma: no cover - defensive
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/interview/session/{session_id}", tags=["interview"])
def get_session(session_id: str):
    svc = _get_service()
    session = svc.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/interview/answer", tags=["interview"])
async def upload_answer(
    video: UploadFile = File(...),
    session_id: str = Form(...),
    question_index: int = Form(...),
    metadata: str = Form("{}"),
):
    svc = _get_service()
    try:
        meta = json.loads(metadata) if metadata else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid metadata JSON")

    try:
        result = await svc.store_answer(session_id, int(question_index), video, meta)
        return {"message": "Answer saved", **result}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/interview/complete", tags=["interview"])
def complete_interview(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = _get_service()
    session_id = payload.get("sessionId") or payload.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="sessionId is required")

    try:
        result = svc.complete_interview(session_id)
        runtime_session = (result or {}).get("session") or svc.get_session(session_id) or {}
        company_interview_id = (
            payload.get("companyInterviewId")
            or payload.get("company_interview_id")
            or runtime_session.get("companyInterviewSessionId")
        )
        if company_interview_id:
            try:
                completed = persist_completed_interview(
                    db,
                    company_interview_id=int(company_interview_id),
                    runtime_result=result,
                )
                result["companyInterviewId"] = completed.id
                result["companyInterviewStatus"] = completed.status
            except Exception as exc:  # noqa: BLE001 - analysis should still be returned
                logger.warning("Failed to persist company interview result: %s", exc)
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/upload-video", tags=["interview"])
async def upload_video(video: UploadFile = File(...)):
    os.makedirs("uploads", exist_ok=True)
    file_path = os.path.join("uploads", video.filename)

    with open(file_path, "wb") as f:
        f.write(await video.read())

    return {
        "message": "Video uploaded successfully. Analysis will run only after interview finalization.",
        "file_path": file_path,
        "analysis": "deferred",
    }
