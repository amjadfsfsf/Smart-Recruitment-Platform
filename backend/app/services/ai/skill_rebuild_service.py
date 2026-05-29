"""
Application service for rebuilding a user's skills list from role context.
"""

from __future__ import annotations

from typing import Any, Iterable

from app.data import models as m
from app.services.ai.gpt_service import SkillRebuildContext, rebuild_skill_list_with_gpt
from app.services.jobs.role_utils import resolve_desired_job_title
from app.services.skill_gap.skill_gap_utils import clean_text
from app.services.jobs.skill_source import normalize_skill_name


def _normalize_input_skills(values: Any) -> list[str]:
    if isinstance(values, str):
        raw_values: Iterable[Any] = values.split(",")
    elif isinstance(values, Iterable) and not isinstance(values, (bytes, dict)):
        raw_values = values
    else:
        raw_values = [values]

    normalized: list[str] = []
    seen: set[str] = set()

    for raw_value in raw_values:
        skill = normalize_skill_name(str(raw_value or ""))
        if not skill:
            continue

        key = skill.lower()
        if key in seen:
            continue

        seen.add(key)
        normalized.append(skill)

    return normalized


async def rebuild_skill_list_for_user(
    *,
    user: m.User,
    payload: dict[str, Any],
) -> dict[str, Any]:
    current_skills = _normalize_input_skills(payload.get("skills"))
    if not current_skills:
        current_skills = _normalize_input_skills([skill.skill_name for skill in user.skills])

    desired_job_title = resolve_desired_job_title(
        payload.get("desired_job_title") or user.desired_job_title,
        payload.get("target_role") or user.target_role,
    )
    target_role = clean_text(payload.get("target_role") or user.target_role) or desired_job_title

    rebuild_context = SkillRebuildContext(
        education=clean_text(payload.get("education") or user.education_level),
        experience_level=clean_text(payload.get("experience") or user.experience_level),
        field_of_study=clean_text(payload.get("field") or user.field_of_study),
        current_skills=current_skills,
        desired_job_title=desired_job_title,
        target_role=target_role,
    )
    rebuilt_skills = await rebuild_skill_list_with_gpt(rebuild_context)

    return {
        "status": "success",
        "skills": rebuilt_skills,
        "skills_csv": ", ".join(rebuilt_skills),
        "desired_job_title": desired_job_title,
        "target_role": clean_text(payload.get("target_role") or user.target_role) or None,
        "experience": rebuild_context.experience_level,
    }
