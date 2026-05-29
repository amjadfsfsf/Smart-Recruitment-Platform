"""
Company interview invitation and result APIs.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user, require_company
from app.data import get_db
from app.data.models import User
from app.data.schemas import InterviewSessionCreate, InterviewSessionRead, InterviewTemplateUpdate
from app.routes.interview import _get_service
from app.services.company.company_interview_service import (
    STATUS_PENDING,
    accept_interview,
    create_interview_request,
    get_interview_session,
    list_candidate_interviews,
    mark_interview_started,
    save_interview_template,
    serialize_interview_session,
)

router = APIRouter(prefix="/company-interviews", tags=["company-interviews"])


@router.post("", response_model=InterviewSessionRead)
def create_request(
    payload: InterviewSessionCreate,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    try:
        session = create_interview_request(
            db,
            company_id=current_user.id,
            candidate_id=payload.candidate_id,
            job_id=payload.job_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    hydrated = get_interview_session(db, session.id) or session
    return serialize_interview_session(hydrated)


@router.get("/candidate", response_model=list[InterviewSessionRead])
def candidate_interviews(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = list_candidate_interviews(db, current_user.id)
    return [serialize_interview_session(session) for session in sessions]


@router.get("/{session_id}", response_model=InterviewSessionRead)
def get_request(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = get_interview_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    if current_user.id not in {session.company_id, session.candidate_id}:
        raise HTTPException(status_code=403, detail="Not authorized")
    return serialize_interview_session(session)


@router.put("/{session_id}/template", response_model=InterviewSessionRead)
def update_template(
    session_id: int,
    payload: InterviewTemplateUpdate,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    session = get_interview_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    try:
        updated = save_interview_template(
            db,
            session=session,
            company_id=current_user.id,
            language=payload.language,
            interview_type=payload.interview_type,
            questions=payload.questions,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return serialize_interview_session(updated)


@router.post("/{session_id}/accept", response_model=InterviewSessionRead)
def accept_request(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = get_interview_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    try:
        accepted = accept_interview(db, session=session, candidate_id=current_user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    hydrated = get_interview_session(db, accepted.id) or accepted
    return serialize_interview_session(hydrated)


@router.post("/{session_id}/start")
def start_company_interview(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = get_interview_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    if session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if session.status == STATUS_PENDING:
        session = accept_interview(db, session=session, candidate_id=current_user.id)
        session = get_interview_session(db, session.id) or session
    if not session.questions:
        raise HTTPException(status_code=400, detail="Interview has no questions")

    candidate = (
        db.query(User)
        .options(selectinload(User.skills))
        .filter(User.id == current_user.id)
        .first()
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    svc = _get_service()
    started = svc.start_interview(
        total_questions=len(session.questions),
        interview_type=session.interview_type,
        experience_level=candidate.experience_level,
        desired_job_title=candidate.desired_job_title,
        target_role=candidate.target_role,
        field_of_study=candidate.field_of_study,
        skills=[skill.skill_name for skill in candidate.skills],
        language=session.language,
        custom_questions=[
            {
                "id": question.id,
                "question_text": question.question_text,
                "category": question.category,
                "difficulty": question.difficulty,
                "expected_answer_keywords": question.expected_answer_keywords or [],
                "required": question.required,
            }
            for question in sorted(session.questions, key=lambda q: q.order_index)
        ],
        company_interview_session_id=session.id,
    )
    mark_interview_started(
        db,
        session=session,
        candidate_id=current_user.id,
        runtime_session_id=started["sessionId"],
    )
    started["companyInterviewId"] = session.id
    return started


@router.get("/{session_id}/results", response_model=InterviewSessionRead)
def get_results(
    session_id: int,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    session = get_interview_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    if session.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    runtime_result = None
    if session.runtime_session_id:
        runtime_session = _get_service().get_session(session.runtime_session_id)
        if isinstance(runtime_session, dict):
            analysis = runtime_session.get("analysis") if isinstance(runtime_session.get("analysis"), dict) else {}
            final_video = runtime_session.get("finalVideo")
            runtime_result = {
                "session": runtime_session,
                "analysis": analysis,
                "audio_score": analysis.get("audio_score"),
                "video_score": analysis.get("video_score"),
                "scores": runtime_session.get("scores") or analysis.get("scores"),
                "candidate_position": analysis.get("candidate_position"),
                "analysisScope": analysis.get("analysisScope"),
                "lastQuestionIndex": len(runtime_session.get("responses") or []),
                "finalVideoPath": final_video,
                "finalVideoUrl": ("/" + final_video.replace("\\", "/")) if final_video else None,
            }

    return serialize_interview_session(session, runtime_result=runtime_result)
