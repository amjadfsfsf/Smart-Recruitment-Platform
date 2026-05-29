"""
End-to-end job matching service that pulls live listings, extracts skills, and scores them
against a user's profile using the local fine-tuned model.
"""

from __future__ import annotations

from typing import List

from app.data.models import User
from app.services.jobs.jobs_api_service import fetch_all_jobs, get_fallback_jobs
from app.services.jobs.job_skill_extractor import extract_skills
from app.services.ai.model_service import predict_match_score
from app.services.jobs.role_utils import resolve_desired_job_title

DEBUG = True

def clean_resume(text: str, limit: int = 500) -> str:
    if not text:
        return ""
    collapsed = " ".join(text.split())
    return collapsed[:limit]


def normalize_score(raw_score: float) -> float:
    """
    Ensure scores are consistently returned as percentages with two decimals (0..100).
    """
    try:
        value = float(raw_score)
    except (TypeError, ValueError):
        value = 0.0

    if value <= 1.0:
        value *= 100.0

    if value < 0:
        value = 0.0
    if value > 100:
        value = 100.0

    return round(value, 2)


def _normalize_experience_label(value: str | None) -> str:
    """
    Map legacy labels to the current standard.
    """
    lowered = (value or "").strip().lower()
    if lowered == "beginner":
        return "Entry-Level"
    if lowered == "entry-level":
        return "Entry-Level"
    return value or ""


def build_search_query(desired_job_title: str | None, what_did_you_study: str | None, experience: str | None) -> str:
    """
    Combine the desired job title with supporting profile signals into a single
    search query, trimming and skipping empty values.
    """
    parts = [
        (desired_job_title or "").strip(),
        (what_did_you_study or "").strip(),
        (experience or "").strip(),
    ]
    return " ".join(part for part in parts if part)

def normalize_text(text: str) -> str:
    return " ".join((text or "").strip().lower().split())
def _build_user_text(
    study_field: str,
    experience: str,
    skills: list[str],
    desired_job_title: str,
    target_role_context: str,
    location: str,
) -> str:
    """
    Structured user profile string expected by the local model.
    """
    
    skills_text = ", ".join(skills) if skills else "None provided"
    return (
        "[DESIRED JOB TITLE]\n"
        f"{desired_job_title or 'unspecified'}\n"
        "[CAREER CONTEXT]\n"
        f"{normalize_text(target_role_context)[:350] or 'No additional context provided'}\n"
        "[FIELD OF STUDY]\n"
        f"{study_field or 'unspecified'}\n"
        "[EXPERIENCE]\n"
        f"{experience or 'unspecified'}\n"
        "[SKILLS]\n"
        f"{skills_text}\n"
  
    ).strip()


def _build_job_text(job: dict, job_skills: list[str]) -> str:
    description = job.get("description") or ""
    skills_text = ", ".join(job_skills) if job_skills else ""
    description = normalize_text(description) or ""

    return (
        "[JOB TITLE]\n"
        f"{job.get('title', '')}\n"
        "[DESCRIPTION]\n"
        f"{description[:350]}\n"
        "[SKILLS]\n"
        f"{skills_text}"
    ).strip()


def _extract_user_skills(user: User) -> List[str]:
    return [skill.skill_name for skill in getattr(user, "skills", []) if getattr(skill, "skill_name", None)]


def safe_fetch_jobs(query: str, location: str = "any", page: int = 1) -> tuple[list[dict], int]:
    """
    One-shot API call with fallback to ensure non-empty results.
    Returns (jobs, api_jobs_count) where api_jobs_count is the count returned by the live API (0 when fallback is used).
    """
    try:
        api_jobs = fetch_all_jobs(query, location=location, page=page)
        api_count = len(api_jobs)
        print(f"[job-matching] query='{query}' api_location='{location}' page={page} api_jobs={api_count} fallback=False")
        if not api_jobs:
            fallback = get_fallback_jobs(query, count=5)
            print(f"[job-matching] query='{query}' page={page} api_jobs=0 fallback=True")
            return fallback, api_count
        return api_jobs, api_count
    except Exception as exc:
        print(f"[job-matching] query='{query}' page={page} api_error='{exc}' fallback=True")
        return get_fallback_jobs(query, count=5), 0


def _ensure_minimum_jobs(jobs: list[dict], query: str, minimum: int = 5) -> list[dict]:
    if len(jobs) >= minimum:
        return jobs
    needed = minimum - len(jobs)
    return jobs + get_fallback_jobs(query, count=needed)


def _is_senior_title(title: str) -> bool:
    lowered = (title or "").lower()
    senior_markers = ("senior", "sr", "lead", "principal", "director", "manager", "head")
    return any(marker in lowered for marker in senior_markers)


def _is_junior_friendly_title(title: str) -> bool:
    lowered = (title or "").lower()
    junior_markers = ("junior", "intern", "entry", "associate", "trainee")
    return any(marker in lowered for marker in junior_markers)


def _experience_compatibility(user_experience: str, title: str) -> float:
    if not user_experience:
        return 0.6
    normalized = user_experience.lower()
    if normalized in {"entry-level", "entry", "beginner"}:
        if _is_senior_title(title):
            return 0.1
        if _is_junior_friendly_title(title):
            return 1.0
        return 0.6
    # mid-level or higher
    if _is_senior_title(title):
        return 0.9
    return 0.75


def _skill_overlap_score(user_skills: list[str], job_skills: list[str]) -> float:
    if not user_skills or not job_skills:
        return 0.0
    user_set = {s.lower() for s in user_skills}
    job_set = {s.lower() for s in job_skills}
    overlap = len(user_set & job_set)
    union = len(user_set | job_set) or 1
    return overlap / union


def match_jobs(
    user: User,
    location: str = "any",
    top_k: int = 10,
    experience_level: str | None = None,
    page: int = 1,
) -> dict:
    if not user:
        raise ValueError("User is required for matching.")

    study_field_raw = getattr(user, "field_of_study", None)
    experience_level_raw = experience_level or getattr(user, "experience_level", None)
    desired_job_title = resolve_desired_job_title(
        getattr(user, "desired_job_title", None),
        getattr(user, "target_role", None),
    )

    study_field = (study_field_raw or "").strip()
    experience_level_clean = _normalize_experience_label(experience_level_raw)
    search_query = build_search_query(desired_job_title, study_field, experience_level_clean)
    if not search_query:
        raise ValueError("Add your desired job title, field of study, or experience to run job matching.")

    experience_for_scoring = experience_level_clean or "unknown"

    requested_location = (location or "").strip()
    user_location = requested_location or (getattr(user, "location", None) or "").strip() or "any"
    target_role_context = clean_resume((getattr(user, "target_role", None) or "").strip(), limit=500)
    user_skills = _extract_user_skills(user)

    top_k = max(1, min(top_k, 50))  # enforce upper bound aligned with API

    user_text = _build_user_text(
        study_field=study_field,
        experience=experience_for_scoring,
        skills=user_skills,
        desired_job_title=desired_job_title,
        target_role_context=target_role_context,
        location=user_location,
    )

    jobs, api_jobs_count = safe_fetch_jobs(search_query, location=user_location, page=page)
    jobs = jobs[:50]  # cap scoring work to 50 results
    jobs_before_filter = len(jobs)
    # Beginner filtering: remove senior/lead/etc for beginners
    if (experience_for_scoring or "").lower() in {"entry-level", "junior", "entry", "beginner"}:
        jobs = [
            job for job in jobs
            if not _is_senior_title(job.get("title", ""))
        ]
    jobs_after_filter = len(jobs)

    jobs = _ensure_minimum_jobs(jobs, search_query, minimum=5)

    results: list[dict] = []
    if DEBUG:
        print(f"[jobs] scoring {len(jobs)} jobs (api_jobs_count={api_jobs_count}, page={page})")
    first_logged = False

    for job in jobs:
        job_skills = job.get("skills") or extract_skills(job.get("description", ""))
        job_text = _build_job_text(job, job_skills)
        model_score = predict_match_score(user_text, job_text)
        exp_score = _experience_compatibility(experience_for_scoring, job.get("title", ""))
        overlap_score = _skill_overlap_score(user_skills, job_skills)
        score_percent = normalize_score(model_score)

        sources_field = job.get("sources") if isinstance(job.get("sources"), list) else None
        sources = sources_field if sources_field else [job.get("source")] if job.get("source") else ["unknown"]

        result = {
            "job_id": str(job.get("job_id") or ""),
            "title": job.get("title") or "",
            "company": job.get("company") or "",
            "location": job.get("location") or "",
            "description": job.get("description") or "",
            "job_description": job.get("description") or "",
            "apply_url": job.get("apply_url") or job.get("apply_link") or "",
            "skills": job_skills,
            "score": score_percent,
            "score_display": f"{score_percent:.2f}%",
            "model_score": float(round(model_score, 4)),
            "experience_score": float(round(exp_score, 4)),
            "overlap_score": float(round(overlap_score, 4)),
            "source": job.get("source")
            or (job.get("sources")[0] if isinstance(job.get("sources"), list) and job.get("sources") else "unknown"),
            "sources": sources,
        }

        if job.get("salary_range"):
            result["salary_range"] = job.get("salary_range")
        if job.get("contract_type"):
            result["contract_type"] = job.get("contract_type")

        results.append(result)
        if DEBUG and not first_logged:
            print("[jobs] first scored job =", {"title": result.get("title"), "score": result.get("score")})
            first_logged = True

    results.sort(key=lambda item: item.get("score", 0), reverse=True)
    desired = max(5, top_k)
    limited = results[: min(desired, len(results))]
    top_title = limited[0]["title"] if limited else ""
    top_score = limited[0]["score"] if limited else 0
    from collections import Counter
    source_counts: Counter[str] = Counter()
    for job in results:
        if job.get("sources"):
            for src in job["sources"]:
                source_counts[src] += 1
        elif job.get("source"):
            source_counts[job.get("source")] += 1

 
    return {
        "searched_query": search_query,
        "searched_location": user_location,
        "searched_jobs": len(jobs),
        "returned_jobs": len(limited),
        "api_jobs_count": api_jobs_count,
        "page": page,
        "recommended_jobs": limited if limited else _ensure_minimum_jobs(results, search_query, minimum=5),
    }


__all__ = ["match_jobs"]
