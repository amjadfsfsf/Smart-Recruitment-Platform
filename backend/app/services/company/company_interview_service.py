"""
Company interview invitation workflow.

The database tracks hiring-pipeline state while the existing InterviewService
continues to handle camera/microphone recordings, transcription, scoring, and
AI feedback.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy.orm import Session, selectinload

from app.data import models as m

STATUS_DRAFT = "draft"
STATUS_PENDING = "pending"
STATUS_ACCEPTED = "accepted"
STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETED = "completed"
STATUS_REVIEWED = "reviewed"


def _user_summary(user: m.User | None) -> dict | None:
    if not user:
        return None
    location = user.location or ", ".join(part for part in [user.city, user.country] if part)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "experience_level": user.experience_level,
        "desired_job_title": user.desired_job_title,
        "target_role": user.target_role,
        "logo_url": user.logo_url,
        "industry": user.industry,
        "location": location,
        "about": user.about,
        "profile_url": f"/company/{user.id}" if user.role == "company" else None,
        "verified_company": bool(user.verified_company),
    }


def _job_summary(job: m.CompanyJob | None) -> dict | None:
    if not job:
        return None
    return {
        "id": job.id,
        "title": job.title,
        "description": job.description,
        "experience_level": job.experience_level,
        "required_skills": job.required_skills or [],
    }


def _video_url(path: str | None) -> str | None:
    if not path:
        return None
    return "/" + path.replace("\\", "/")


def _first_mapping(*values: Any) -> dict[str, Any]:
    for value in values:
        if isinstance(value, dict) and value:
            return value
    return {}


def _clean_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if value is not None and value != {} and value != []
    }


def _analysis_payload_from_runtime(runtime_result: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(runtime_result, dict):
        return {}

    runtime_session = runtime_result.get("session") if isinstance(runtime_result.get("session"), dict) else {}
    analysis = _first_mapping(runtime_result.get("analysis"), runtime_session.get("analysis"))
    scores = _first_mapping(runtime_result.get("scores"), analysis.get("scores"), runtime_session.get("scores"))
    audio_score = _first_mapping(runtime_result.get("audio_score"), analysis.get("audio_score"))
    video_score = _first_mapping(runtime_result.get("video_score"), analysis.get("video_score"))
    candidate_position = _first_mapping(runtime_result.get("candidate_position"), analysis.get("candidate_position"))

    normalized_analysis = {
        **analysis,
        "audio_score": audio_score or analysis.get("audio_score"),
        "video_score": video_score or analysis.get("video_score"),
        "scores": scores or analysis.get("scores"),
        "candidate_position": candidate_position or analysis.get("candidate_position"),
    }

    return _clean_payload(
        {
            "analysis": _clean_payload(normalized_analysis),
            "audio_score": audio_score,
            "video_score": video_score,
            "scores": scores,
            "candidate_position": candidate_position,
            "analysisScope": runtime_result.get("analysisScope") or analysis.get("analysisScope"),
            "lastQuestionIndex": runtime_result.get("lastQuestionIndex"),
            "finalVideoPath": runtime_result.get("finalVideoPath") or runtime_session.get("finalVideo"),
            "finalVideoUrl": runtime_result.get("finalVideoUrl")
            or (("/" + runtime_session["finalVideo"].replace("\\", "/")) if runtime_session.get("finalVideo") else None),
        }
    )


def _stored_analysis_payload(session: m.InterviewSession) -> dict[str, Any]:
    for answer in session.answers:
        feedback = answer.ai_feedback if isinstance(answer.ai_feedback, dict) else {}
        payload = feedback.get("sessionAnalysis") or feedback.get("session_analysis")
        if isinstance(payload, dict) and payload:
            return payload
    return {}


def serialize_interview_session(
    session: m.InterviewSession,
    runtime_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    scores = [answer.score for answer in session.answers if answer.score is not None]
    overall_score = round(sum(scores) / len(scores), 2) if scores else None
    analysis_payload = _analysis_payload_from_runtime(runtime_result) or _stored_analysis_payload(session)
    payload = {
        "id": session.id,
        "company_id": session.company_id,
        "candidate_id": session.candidate_id,
        "job_id": session.job_id,
        "runtime_session_id": session.runtime_session_id,
        "status": session.status,
        "language": session.language,
        "interview_type": session.interview_type,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "candidate": _user_summary(session.candidate),
        "company": _user_summary(session.company),
        "job": _job_summary(session.job),
        "questions": [
            {
                "id": question.id,
                "question_text": question.question_text,
                "category": question.category,
                "difficulty": question.difficulty,
                "expected_answer_keywords": question.expected_answer_keywords or [],
                "required": question.required,
                "order_index": question.order_index,
            }
            for question in sorted(session.questions, key=lambda q: q.order_index)
        ],
        "answers": [
            {
                "id": answer.id,
                "question_id": answer.question_id,
                "answer_text": answer.answer_text,
                "video_path": answer.video_path,
                "video_url": _video_url(answer.video_path),
                "ai_feedback": answer.ai_feedback,
                "score": answer.score,
            }
            for answer in session.answers
        ],
        "overall_score": overall_score,
    }
    payload.update(analysis_payload)
    return payload


def get_interview_session(db: Session, session_id: int) -> m.InterviewSession | None:
    return (
        db.query(m.InterviewSession)
        .options(
            selectinload(m.InterviewSession.company),
            selectinload(m.InterviewSession.candidate),
            selectinload(m.InterviewSession.job),
            selectinload(m.InterviewSession.questions),
            selectinload(m.InterviewSession.answers),
        )
        .filter(m.InterviewSession.id == session_id)
        .first()
    )


def create_interview_request(
    db: Session,
    *,
    company_id: int,
    candidate_id: int,
    job_id: int | None,
) -> m.InterviewSession:
    candidate = db.get(m.User, candidate_id)
    if not candidate or candidate.role == "company":
        raise ValueError("Candidate not found")

    job = db.get(m.CompanyJob, job_id) if job_id else None
    if job_id and (not job or job.company_id != company_id):
        raise PermissionError("Job not found or not owned by company")

    existing = (
        db.query(m.InterviewSession)
        .filter(
            m.InterviewSession.company_id == company_id,
            m.InterviewSession.candidate_id == candidate_id,
            m.InterviewSession.job_id == job_id,
            m.InterviewSession.status.in_([STATUS_DRAFT, STATUS_PENDING, STATUS_ACCEPTED, STATUS_IN_PROGRESS]),
        )
        .order_by(m.InterviewSession.created_at.desc())
        .first()
    )
    if existing:
        return existing

    session = m.InterviewSession(
        company_id=company_id,
        candidate_id=candidate_id,
        job_id=job_id,
        status=STATUS_DRAFT,
        language="en",
        interview_type="technical",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def save_interview_template(
    db: Session,
    *,
    session: m.InterviewSession,
    company_id: int,
    language: str,
    interview_type: str,
    questions: Iterable[Any],
) -> m.InterviewSession:
    if session.company_id != company_id:
        raise PermissionError("Not authorized")

    session.language = (language or "en").strip() or "en"
    session.interview_type = (interview_type or "technical").strip() or "technical"
    session.status = STATUS_PENDING

    for question in list(session.questions):
        db.delete(question)
    db.flush()

    for index, question in enumerate(questions):
        payload = question.model_dump() if hasattr(question, "model_dump") else dict(question)
        db.add(
            m.InterviewQuestion(
                interview_session_id=session.id,
                question_text=payload.get("question_text", ""),
                category=payload.get("category") or "technical",
                difficulty=payload.get("difficulty") or "medium",
                expected_answer_keywords=payload.get("expected_answer_keywords") or [],
                required=bool(payload.get("required", True)),
                order_index=int(payload.get("order_index", index)),
            )
        )

    db.commit()
    return get_interview_session(db, session.id) or session


def list_candidate_interviews(db: Session, candidate_id: int) -> list[m.InterviewSession]:
    return (
        db.query(m.InterviewSession)
        .options(
            selectinload(m.InterviewSession.company),
            selectinload(m.InterviewSession.candidate),
            selectinload(m.InterviewSession.job),
            selectinload(m.InterviewSession.questions),
            selectinload(m.InterviewSession.answers),
        )
        .filter(m.InterviewSession.candidate_id == candidate_id)
        .filter(m.InterviewSession.status != STATUS_DRAFT)
        .order_by(m.InterviewSession.created_at.desc())
        .all()
    )


def accept_interview(db: Session, *, session: m.InterviewSession, candidate_id: int) -> m.InterviewSession:
    if session.candidate_id != candidate_id:
        raise PermissionError("Not authorized")
    if session.status == STATUS_PENDING:
        session.status = STATUS_ACCEPTED
        db.commit()
        db.refresh(session)
    return session


def mark_interview_started(
    db: Session,
    *,
    session: m.InterviewSession,
    candidate_id: int,
    runtime_session_id: str,
) -> m.InterviewSession:
    if session.candidate_id != candidate_id:
        raise PermissionError("Not authorized")
    session.runtime_session_id = runtime_session_id
    session.status = STATUS_IN_PROGRESS
    db.commit()
    db.refresh(session)
    return session


def persist_completed_interview(
    db: Session,
    *,
    company_interview_id: int,
    runtime_result: dict[str, Any],
) -> m.InterviewSession:
    session = get_interview_session(db, company_interview_id)
    if not session:
        raise ValueError("Company interview session not found")

    question_by_index = {
        index + 1: question
        for index, question in enumerate(sorted(session.questions, key=lambda q: q.order_index))
    }

    for answer in list(session.answers):
        db.delete(answer)
    db.flush()

    runtime_session = runtime_result.get("session") or {}
    session_analysis_payload = _analysis_payload_from_runtime(runtime_result)
    responses = runtime_session.get("responses") or runtime_result.get("questions") or []
    for response_index, response in enumerate(responses):
        question_index = int(response.get("questionIndex") or 0)
        try:
            runtime_question_id = int(response.get("questionId")) if response.get("questionId") else None
        except (TypeError, ValueError):
            runtime_question_id = None
        question = (
            next((item for item in question_by_index.values() if item.id == runtime_question_id), None)
            if runtime_question_id
            else question_by_index.get(question_index)
        )
        db.add(
            m.InterviewAnswer(
                session_id=session.id,
                question_id=question.id if question else None,
                answer_text=response.get("transcript"),
                video_path=response.get("videoPath"),
                ai_feedback={
                    "questionEvaluation": response.get("questionEvaluation"),
                    "audioScore": response.get("audioScore"),
                    "videoScore": response.get("videoScore"),
                    "analysisStatus": response.get("analysisStatus"),
                    **({"sessionAnalysis": session_analysis_payload} if response_index == 0 and session_analysis_payload else {}),
                },
                score=response.get("questionScore"),
            )
        )

    session.status = STATUS_COMPLETED
    session.completed_at = datetime.now(timezone.utc)
    db.commit()
    return get_interview_session(db, session.id) or session


def latest_status_by_candidate_for_job(
    db: Session,
    *,
    company_id: int,
    job_id: int,
) -> dict[int, dict[str, Any]]:
    rows = (
        db.query(m.InterviewSession)
        .filter(
            m.InterviewSession.company_id == company_id,
            m.InterviewSession.job_id == job_id,
        )
        .order_by(m.InterviewSession.created_at.desc())
        .all()
    )
    statuses: dict[int, dict[str, Any]] = {}
    for row in rows:
        statuses.setdefault(
            row.candidate_id,
            {"interview_session_id": row.id, "interview_status": row.status},
        )
    return statuses
