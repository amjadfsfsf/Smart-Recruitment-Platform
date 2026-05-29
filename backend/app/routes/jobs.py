"""
Routes for target jobs, job skills, skill-gap analysis, and real-time job search.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.data import get_db
from app.data import models as m
from app.data import schemas as s
from app.services.jobs.jobs_api_service import JobFetchError, fetch_all_jobs
from app.services.jobs.job_matching_service import match_jobs
from app.services.skill_gap.skill_gap_service import analyze_skill_gap_with_gpt

router = APIRouter(tags=["jobs"])
logger = logging.getLogger(__name__)


def _flatten_missing_skills(ai_analysis: dict) -> list[str]:
    missing_skills = ai_analysis.get("missing_skills")
    if isinstance(missing_skills, list):
        ordered: list[str] = []
        seen: set[str] = set()

        for value in missing_skills:
            normalized = " ".join(str(value or "").strip().split()).lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            ordered.append(normalized)

        return ordered
    if not isinstance(missing_skills, dict):
        return []

    ordered: list[str] = []
    seen: set[str] = set()

    for category in ("technical", "tools", "soft"):
        values = missing_skills.get(category)
        if not isinstance(values, list):
            continue

        for value in values:
            normalized = " ".join(str(value or "").strip().split())
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            ordered.append(normalized)

    return ordered


def _summarize_gpt_skill_gap(ai_analysis: dict) -> dict[str, object]:
    existing_skills = ai_analysis.get("matched_skills")
    if not isinstance(existing_skills, list):
        existing_skills = ai_analysis.get("existing_skills")
    if not isinstance(existing_skills, list):
        existing_skills = []

    return {
        "existing_skills": existing_skills,
        "missing_skills": _flatten_missing_skills(ai_analysis),
        "match_percentage": ai_analysis.get("match_score", 0),
    }

# -----------------------------
# Target jobs
# -----------------------------


@router.post("/target-jobs", response_model=s.TargetJobRead, status_code=status.HTTP_201_CREATED)
def create_target_job(payload: s.TargetJobCreate, db: Session = Depends(get_db)) -> s.TargetJobRead:
    job = m.TargetJob(title=payload.title.strip(), description=payload.description)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/target-jobs", response_model=list[s.TargetJobRead])
def list_target_jobs(db: Session = Depends(get_db)) -> list[s.TargetJobRead]:
    return db.query(m.TargetJob).all()


# -----------------------------
# Job skills for a target job
# -----------------------------


@router.post("/job-skills", response_model=s.JobSkillRead, status_code=status.HTTP_201_CREATED)
def create_job_skill(payload: s.JobSkillCreate, db: Session = Depends(get_db)) -> s.JobSkillRead:
    job = db.get(m.TargetJob, payload.job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target job not found.")

    skill = m.JobSkill(
        job_id=payload.job_id,
        skill_name=payload.skill_name.strip(),
        importance=payload.importance,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.get("/target-jobs/{job_id}/skills", response_model=list[s.JobSkillRead])
def list_job_skills(job_id: int, db: Session = Depends(get_db)) -> list[s.JobSkillRead]:
    job = db.get(m.TargetJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target job not found.")
    return db.query(m.JobSkill).filter(m.JobSkill.job_id == job_id).all()


# -----------------------------
# Skill-gap analysis
# -----------------------------


@router.get("/skill-gap/{user_id}/{job_id}", response_model=s.SkillGapResponse)
async def skill_gap(user_id: int, job_id: int, db: Session = Depends(get_db)) -> s.SkillGapResponse:
    user = db.get(m.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    job = db.get(m.TargetJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target job not found.")

    user_data = {
        "education": user.education_level or "",
        "experience": user.experience_level or "",
        "field": user.field_of_study or "",
        "skills": [skill.skill_name for skill in user.skills],
        "desired_job_title": job.title,
        "target_role": user.target_role or "",
        "reference_job_description": job.description or "",
    }
    ai_analysis = await analyze_skill_gap_with_gpt(user_data)
    summary = _summarize_gpt_skill_gap(ai_analysis)

    return s.SkillGapResponse(
        user_id=user_id,
        job_id=job_id,
        existing_skills=summary["existing_skills"],
        missing_skills=summary["missing_skills"],
        match_percentage=summary["match_percentage"],
    )


# -----------------------------
# Real-time job search (no persistence)
# -----------------------------


@router.get("/jobs/search")
def job_search(
    title: str = Query(..., description="Role/title to search for"),
    location: str = Query("any", description="City/region or 'any'"),
    page: int = Query(1, ge=1, description="Page number for upstream providers"),
) -> dict:
    """
    Fetch live jobs from multiple providers with hard-coded credentials.
    """
    try:
        jobs = fetch_all_jobs(title, location=location, page=page)
    except JobFetchError as exc:  # defensive, individual providers may still raise
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    return {"query": title, "location": location, "results": jobs}


@router.get("/jobs/feed")
def job_feed(
    query: str = Query("software", description="Keyword(s) to search for"),
    location: str = Query("any", description="City/region filter or 'any'"),
    page: int = Query(1, ge=1, description="Page number for upstream providers"),
) -> dict:
    """
    Aggregated feed across providers. Used by the dashboard job feed page.
    """
    try:
        jobs = fetch_all_jobs(query, location=location, page=page)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return {"query": query, "location": location, "source": "multi", "jobs": jobs}


# -----------------------------
# AI-powered job matching
# -----------------------------


@router.get("/jobs/match/{user_id}")
def match_jobs_for_user(
    user_id: int,
    top_k: int = Query(10, ge=1, le=50, description="Number of matches to return"),
    location: str = Query("any", description="City/region filter or 'any'"),
    page: int = Query(1, ge=1, description="Page number for upstream job search"),
    db: Session = Depends(get_db),
) -> dict:
    user = db.get(m.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    try:
        result = match_jobs(
            user,
            location=location,
            top_k=top_k,
            experience_level=user.experience_level if hasattr(user, "experience_level") else None,
            page=page,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    result["user_id"] = user_id
    return result
