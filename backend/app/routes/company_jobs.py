"""
API routes for company job postings and candidate matching.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import require_company
from app.data import get_db
from app.data.models import User
from app.data.schemas import CompanyCandidateMatchResponse, CompanyJobCreate, CompanyJobRead
from app.services.company.company_job_service import (
    create_company_job,
    delete_company_job,
    get_company_job,
    get_company_jobs,
    match_candidates,
)

router = APIRouter(prefix="/jobs", tags=["company-jobs"])


@router.post("/create", response_model=CompanyJobRead)
def create_job(
    payload: CompanyJobCreate,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    job = create_company_job(
        db=db,
        company_id=current_user.id,
        title=payload.title,
        description=payload.description,
        required_skills=payload.required_skills,
        experience_level=payload.experience_level,
    )
    return _job_to_dict(job)


@router.get("/company/{company_id}", response_model=list[CompanyJobRead])
def list_company_jobs(
    company_id: int,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    jobs = get_company_jobs(db, company_id)
    return [_job_to_dict(j) for j in jobs]


@router.get("/{job_id}/match-candidates", response_model=CompanyCandidateMatchResponse)
async def find_candidates(
    job_id: int,
    min_score: float = Query(0.0, ge=0, le=100, description="Minimum match %"),
    top_k: int = Query(50, ge=1, le=200, description="Max candidates to return"),
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    job = get_company_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    candidates = await match_candidates(db, job, min_score=min_score, top_k=top_k)
    job_required_skills = list(job.required_skills or [])
    return {
        "job_id": job.id,
        "job_title": job.title,
        "job_required_skills": job_required_skills,
        "total_candidates": len(candidates),
        "candidates": candidates,
    }


@router.delete("/{job_id}")
def remove_job(
    job_id: int,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    deleted = delete_company_job(db, job_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found or not authorized")
    return {"detail": "Job deleted"}


def _job_to_dict(job) -> dict:
    return {
        "id": job.id,
        "company_id": job.company_id,
        "title": job.title,
        "description": job.description,
        "required_skills": job.required_skills or [],
        "experience_level": job.experience_level,
        "created_at": str(job.created_at) if job.created_at else None,
    }
