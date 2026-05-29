"""
Company-side candidate ranking utilities.

This module is intentionally scoped to recruiter/company matching. Candidate
job recommendations continue to use their existing scoring path.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.data.models import CompanyJob, User
from app.services.jobs.job_matching_service import normalize_score, normalize_text
from app.services.ai.model_service import predict_match_score
from app.services.jobs.role_utils import resolve_desired_job_title
from app.services.ai.skill_matcher import SemanticMatch, alias_resolve, match_skills

logger = logging.getLogger(__name__)

SCORE_BREAKDOWN = {
    "skills_weight": 0.45,
    "desc_weight": 0.30,
    "major_weight": 0.15,
    "title_weight": 0.10,
}

SEMANTIC_SKILL_WEIGHT = 0.80
RESUME_DIR = (Path(__file__).resolve().parents[3] / "resume-builder").resolve()


@dataclass(frozen=True)
class SkillScoreDetails:
    skills_score: float
    exact_matches: list[str]
    semantic_matches: list[dict[str, Any]]
    missing_skills: list[str]


def clean_required_skills(required_skills: Iterable[Any]) -> list[str]:
    """Normalize company-required skills enough for stable comparison."""
    cleaned: list[str] = []
    seen_keys: set[str] = set()
    for raw in required_skills or []:
        label = " ".join(str(raw or "").strip().split())
        key = alias_resolve(label)
        if not label or not key or key in seen_keys:
            continue
        seen_keys.add(key)
        cleaned.append(label)
    return cleaned


async def score_candidate_skills(
    *,
    db: Session,
    required_skills: Iterable[Any],
    user_skills: Iterable[Any],
) -> SkillScoreDetails:
    """Score required skill coverage using exact matches plus lower-weight semantic matches."""
    required_clean = clean_required_skills(required_skills)
    if not required_clean:
        return SkillScoreDetails(0.0, [], [], [])

    match_result = await match_skills(
        required_skills=required_clean,
        user_skills=user_skills,
        db=db,
    )

    exact_keys = {alias_resolve(skill) for skill in match_result.exact_matches}
    semantic_lookup: dict[str, SemanticMatch] = {
        alias_resolve(match.skill): match for match in match_result.semantic_matches
    }

    exact_matches: list[str] = []
    semantic_matches: list[dict[str, Any]] = []
    missing_skills: list[str] = []
    score_units = 0.0
    classified_keys: set[str] = set()

    for required_skill in required_clean:
        key = alias_resolve(required_skill)
        if not key or key in classified_keys:
            continue
        classified_keys.add(key)

        if key in exact_keys:
            exact_matches.append(required_skill)
            score_units += 1.0
            continue

        semantic_match = semantic_lookup.get(key)
        if semantic_match:
            similarity = max(0.0, min(float(semantic_match.similarity), 1.0))
            semantic_matches.append(
                {
                    "skill": required_skill,
                    "matched_with": semantic_match.matched_with,
                    "similarity": round(similarity, 4),
                    "type": "semantic",
                }
            )
            # Semantic matches count, but less than alias-resolved exact matches.
            score_units += similarity * SEMANTIC_SKILL_WEIGHT
            continue

        missing_skills.append(required_skill)

    skills_score = round((score_units / len(required_clean)) * 100, 2)
    return SkillScoreDetails(
        skills_score=skills_score,
        exact_matches=exact_matches,
        semantic_matches=semantic_matches,
        missing_skills=missing_skills,
    )


def normalize_experience_level(value: str | None) -> str:
    lowered = normalize_text(value or "")
    if not lowered:
        return ""
    if any(token in lowered for token in ("intern", "trainee", "entry", "beginner", "graduate")):
        return "entry"
    if any(token in lowered for token in ("junior", "associate", "jr")):
        return "junior"
    if any(token in lowered for token in ("mid level", "mid-level", "midlevel", "intermediate")):
        return "mid"
    if any(token in lowered for token in ("senior", "sr")):
        return "senior"
    if any(token in lowered for token in ("lead", "principal", "staff", "manager", "director", "head")):
        return "lead"
    return lowered


def experience_match_score(candidate_level: str | None, job_level: str | None) -> float:
    """Reusable ordered experience-level compatibility score."""
    candidate = normalize_experience_level(candidate_level)
    job = normalize_experience_level(job_level)
    if not candidate and not job:
        return 70.0
    if not candidate or not job:
        return 50.0

    rank = {"entry": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4}
    if candidate not in rank or job not in rank:
        return 65.0 if candidate == job else 45.0

    distance = abs(rank[candidate] - rank[job])
    if distance == 0:
        return 100.0
    if {candidate, job} == {"entry", "junior"}:
        return 90.0
    if distance == 1:
        return 70.0
    if distance == 2:
        return 40.0
    return 10.0


def semantic_text_score(left: str | None, right: str | None) -> float:
    """Return semantic similarity as a 0..100 score using the local embedding model."""
    left_clean = normalize_text(left or "")
    right_clean = normalize_text(right or "")
    if not left_clean or not right_clean:
        return 0.0
    return normalize_score(predict_match_score(left_clean, right_clean))


def _extract_resume_text(cv_filename: str | None, limit: int = 3000) -> str:
    if not cv_filename:
        return ""
    safe_name = Path(cv_filename).name
    path = (RESUME_DIR / safe_name).resolve()
    if not str(path).startswith(str(RESUME_DIR)) or not path.exists():
        return ""
    try:
        import pdfplumber

        parts: list[str] = []
        with pdfplumber.open(str(path)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                if text:
                    parts.append(text)
                if sum(len(part) for part in parts) >= limit:
                    break
        return normalize_text(" ".join(parts))[:limit]
    except Exception as exc:  # noqa: BLE001 - CV parsing must not block matching
        logger.info("Could not extract CV text for company matching: %s", exc)
        return ""


def build_candidate_description_text(user: User) -> str:
    """Combine the profile fields recruiters expect to be compared to the job description."""
    resume_text = _extract_resume_text(getattr(user, "cv_path", None))
    parts = [
        getattr(user, "target_role", "") or "",
        resume_text,
    ]
    return "\n".join(part for part in parts if part).strip()


def title_score_for_candidate(user: User, job: CompanyJob) -> float:
    desired_title = resolve_desired_job_title(
        getattr(user, "desired_job_title", None),
        getattr(user, "target_role", None),
        default="",
    )
    return semantic_text_score(desired_title, getattr(job, "title", "") or "")


def final_weighted_score(
    *,
    skills_score: float,
    desc_score: float,
    major_score: float,
    title_score: float,
) -> float:
    """Apply the recruiter ranking formula requested by product."""
    final_score = (
        skills_score * SCORE_BREAKDOWN["skills_weight"]
        + desc_score * SCORE_BREAKDOWN["desc_weight"]
        + major_score * SCORE_BREAKDOWN["major_weight"]
        + title_score * SCORE_BREAKDOWN["title_weight"]
    )
    return round(final_score, 2)
