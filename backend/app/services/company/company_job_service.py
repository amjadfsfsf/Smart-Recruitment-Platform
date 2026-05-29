"""
Company job management and candidate matching service.

This service is scoped to recruiter/company ranking. Candidate-facing job
recommendations use a separate matching path.
"""

from __future__ import annotations

import logging
from typing import List

from sqlalchemy.orm import Session, selectinload

from app.data.models import CompanyJob, User
from app.services.company.company_candidate_scoring import (
    SCORE_BREAKDOWN,
    build_candidate_description_text,
    clean_required_skills,
    experience_match_score,
    final_weighted_score,
    score_candidate_skills,
    semantic_text_score,
    title_score_for_candidate,
)
from app.services.company.company_interview_service import latest_status_by_candidate_for_job
from app.routes.cv_requests import latest_cv_request_by_candidate_for_job
from app.services.jobs.job_matching_service import _extract_user_skills

logger = logging.getLogger(__name__)


def create_company_job(
    db: Session,
    company_id: int,
    title: str,
    description: str,
    required_skills: List[str],
    experience_level: str | None = None,
) -> CompanyJob:
    job = CompanyJob(
        company_id=company_id,
        title=title,
        description=description,
        required_skills=required_skills,
        experience_level=experience_level,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_company_jobs(db: Session, company_id: int) -> List[CompanyJob]:
    return (
        db.query(CompanyJob)
        .filter(CompanyJob.company_id == company_id)
        .order_by(CompanyJob.created_at.desc())
        .all()
    )


def get_company_job(db: Session, job_id: int) -> CompanyJob | None:
    return db.query(CompanyJob).filter(CompanyJob.id == job_id).first()


def delete_company_job(db: Session, job_id: int, company_id: int) -> bool:
    job = (
        db.query(CompanyJob)
        .filter(CompanyJob.id == job_id, CompanyJob.company_id == company_id)
        .first()
    )
    if not job:
        return False
    db.delete(job)
    db.commit()
    return True


async def match_candidates(
    db: Session,
    job: CompanyJob,
    min_score: float = 0.0,
    top_k: int = 50,
) -> list[dict]:
    """
    Score every user in the database against a company job posting.

    Final recruiter score:
        skills_score * 0.45
        + desc_score * 0.30
        + major_score * 0.15
        + title_score * 0.10

    Skill matching runs through the shared two-stage pipeline and then applies
    lower credit to semantic matches than exact matches.
    """
    job_skills_clean = clean_required_skills(job.required_skills or [])
    job_description = getattr(job, "description", "") or ""

    logger.info(
        "[match-candidates] job_id=%s title=%r required_skills(raw)=%s",
        job.id,
        job.title,
        job_skills_clean,
    )

    users = (
        db.query(User)
        .options(selectinload(User.skills))
        .filter(User.role != "company")
        .all()
    )
    interview_statuses = latest_status_by_candidate_for_job(
        db,
        company_id=job.company_id,
        job_id=job.id,
    )
    cv_request_statuses = latest_cv_request_by_candidate_for_job(
        db,
        company_id=job.company_id,
        job_id=job.id,
    )
    results: list[dict] = []

    for user in users:
        user_skills = _extract_user_skills(user)

        skill_details = await score_candidate_skills(
            db=db,
            required_skills=job_skills_clean,
            user_skills=user_skills,
        )

        desc_score = semantic_text_score(
            job_description,
            build_candidate_description_text(user),
        )
        major_score = experience_match_score(
            getattr(user, "experience_level", None),
            getattr(job, "experience_level", None),
        )
        title_score = title_score_for_candidate(user, job)
        final_score = final_weighted_score(
            skills_score=skill_details.skills_score,
            desc_score=desc_score,
            major_score=major_score,
            title_score=title_score,
        )

        logger.info(
            "[match-candidates] job_id=%s user_id=%s final=%.2f%% "
            "skills=%.2f desc=%.2f major=%.2f title=%.2f raw_user_skills=%s "
            "exact=%s semantic=%s missing=%s",
            job.id,
            user.id,
            final_score,
            skill_details.skills_score,
            desc_score,
            major_score,
            title_score,
            user_skills,
            skill_details.exact_matches,
            [m["skill"] for m in skill_details.semantic_matches],
            skill_details.missing_skills,
        )

        if final_score < min_score:
            continue

        cv_filename = getattr(user, "cv_path", None)
        interview_meta = interview_statuses.get(user.id, {})
        cv_request_meta = cv_request_statuses.get(user.id, {})
        results.append(
            {
                "user_id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "experience_level": getattr(user, "experience_level", None),
                "skills": list(user_skills),
                # Job-side fields (always preserved verbatim).
                "required_skills": list(job_skills_clean),
                "exact_matches": skill_details.exact_matches,
                "semantic_matches": skill_details.semantic_matches,
                "missing_skills": skill_details.missing_skills,
                "final_score": final_score,
                "skills_score": skill_details.skills_score,
                "desc_score": desc_score,
                "major_score": major_score,
                "title_score": title_score,
                "score_breakdown": dict(SCORE_BREAKDOWN),
                # Backward-compatible aliases for existing recruiter UI code.
                "score": final_score,
                "score_display": f"{final_score:.2f}%",
                "has_cv": bool(cv_filename),
                "hasCV": bool(cv_filename),
                "cv_filename": cv_filename,
                "cv_url": f"/download-cv/{cv_filename}" if cv_filename else None,
                "cv_request_id": cv_request_meta.get("cv_request_id"),
                "cv_request_status": cv_request_meta.get("cv_request_status"),
                "cv_request_created_at": cv_request_meta.get("cv_request_created_at"),
                "cv_request_completed_at": cv_request_meta.get("cv_request_completed_at"),
                "interview_session_id": interview_meta.get("interview_session_id"),
                "interview_status": interview_meta.get("interview_status"),
            }
        )

    results.sort(
        key=lambda r: (
            float(r.get("final_score") or 0),
            float(r.get("skills_score") or 0),
        ),
        reverse=True,
    )
    return results[:top_k]
