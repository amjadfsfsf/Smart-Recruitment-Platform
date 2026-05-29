"""
Company-to-candidate CV request workflow.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user, require_company
from app.data import get_db
from app.data.models import CVRequest, CompanyJob, User
from app.data.schemas import CVRequestCreate, CVRequestRead

STATUS_PENDING = "pending"
STATUS_COMPLETED = "completed"

router = APIRouter(prefix="/cv-requests", tags=["cv-requests"])


@router.post("", response_model=CVRequestRead)
def create_cv_request(
    payload: CVRequestCreate,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    candidate = db.query(User).filter(User.id == payload.candidate_id).first()
    if not candidate or candidate.role == "company":
        raise HTTPException(status_code=404, detail="Candidate not found")

    job = None
    if payload.job_id is not None:
        job = db.query(CompanyJob).filter(CompanyJob.id == payload.job_id).first()
        if not job or job.company_id != current_user.id:
            raise HTTPException(status_code=403, detail="Job not found or not owned by company")

    existing = (
        db.query(CVRequest)
        .options(
            selectinload(CVRequest.company),
            selectinload(CVRequest.candidate),
            selectinload(CVRequest.job),
        )
        .filter(
            CVRequest.candidate_id == candidate.id,
            CVRequest.company_id == current_user.id,
            CVRequest.job_id == payload.job_id,
        )
        .first()
    )
    if existing:
        if candidate.cv_path and existing.status != STATUS_COMPLETED:
            existing.status = STATUS_COMPLETED
            existing.completed_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing)
        return serialize_cv_request(existing)

    request = CVRequest(
        candidate_id=candidate.id,
        company_id=current_user.id,
        job_id=payload.job_id,
        status=STATUS_COMPLETED if candidate.cv_path else STATUS_PENDING,
        completed_at=datetime.now(timezone.utc) if candidate.cv_path else None,
    )
    db.add(request)
    db.commit()
    hydrated = get_cv_request(db, request.id) or request
    return serialize_cv_request(hydrated)


@router.get("/candidate", response_model=list[CVRequestRead])
def list_candidate_cv_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CVRequest)
        .options(
            selectinload(CVRequest.company),
            selectinload(CVRequest.candidate),
            selectinload(CVRequest.job),
        )
        .filter(CVRequest.candidate_id == current_user.id)
        .order_by(CVRequest.created_at.desc())
        .all()
    )
    return [serialize_cv_request(row) for row in rows]


@router.get("/company", response_model=list[CVRequestRead])
def list_company_cv_requests(
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CVRequest)
        .options(
            selectinload(CVRequest.company),
            selectinload(CVRequest.candidate),
            selectinload(CVRequest.job),
        )
        .filter(CVRequest.company_id == current_user.id)
        .order_by(CVRequest.created_at.desc())
        .all()
    )
    return [serialize_cv_request(row) for row in rows]


def get_cv_request(db: Session, request_id: int) -> CVRequest | None:
    return (
        db.query(CVRequest)
        .options(
            selectinload(CVRequest.company),
            selectinload(CVRequest.candidate),
            selectinload(CVRequest.job),
        )
        .filter(CVRequest.id == request_id)
        .first()
    )


def complete_pending_cv_requests(db: Session, candidate_id: int) -> int:
    rows = (
        db.query(CVRequest)
        .filter(CVRequest.candidate_id == candidate_id, CVRequest.status == STATUS_PENDING)
        .all()
    )
    if not rows:
        return 0

    completed_at = datetime.now(timezone.utc)
    for row in rows:
        row.status = STATUS_COMPLETED
        row.completed_at = completed_at
    db.commit()
    return len(rows)


def latest_cv_request_by_candidate_for_job(
    db: Session,
    *,
    company_id: int,
    job_id: int,
) -> dict[int, dict]:
    rows = (
        db.query(CVRequest)
        .filter(CVRequest.company_id == company_id, CVRequest.job_id == job_id)
        .order_by(CVRequest.created_at.desc())
        .all()
    )
    latest: dict[int, dict] = {}
    for row in rows:
        latest.setdefault(
            row.candidate_id,
            {
                "cv_request_id": row.id,
                "cv_request_status": row.status,
                "cv_request_created_at": _iso(row.created_at),
                "cv_request_completed_at": _iso(row.completed_at),
            },
        )
    return latest


def serialize_cv_request(request: CVRequest) -> dict:
    return {
        "id": request.id,
        "candidate_id": request.candidate_id,
        "company_id": request.company_id,
        "job_id": request.job_id,
        "status": request.status,
        "created_at": _iso(request.created_at),
        "completed_at": _iso(request.completed_at),
        "company": _user_summary(request.company),
        "candidate": _user_summary(request.candidate),
        "job": _job_summary(request.job),
    }


def _user_summary(user: User | None) -> dict | None:
    if not user:
        return None
    location = user.location or ", ".join(part for part in [user.city, user.country] if part)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "logo_url": user.logo_url,
        "industry": user.industry,
        "location": location,
        "about": user.about,
        "profile_url": f"/company/{user.id}" if user.role == "company" else None,
        "verified_company": bool(user.verified_company),
    }


def _job_summary(job: CompanyJob | None) -> dict | None:
    if not job:
        return None
    return {
        "id": job.id,
        "title": job.title,
        "description": job.description,
    }


def _iso(value) -> str | None:
    return value.isoformat() if value else None
