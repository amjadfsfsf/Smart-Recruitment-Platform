"""
Dynamic skill suggestion utilities backed by persisted application data.
"""

from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from app.data import models as m
from app.services.skill_gap.skill_gap_utils import flatten_missing_skills


def normalize_skill_name(value: str) -> str:
    """
    Trim whitespace and collapse internal spacing for duplicate detection.
    """
    return " ".join((value or "").strip().split())


def _dedupe_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    for raw in items:
        normalized = normalize_skill_name(raw)
        if not normalized:
            continue

        key = normalized.lower()
        if key in seen:
            continue

        seen.add(key)
        ordered.append(normalized)

    return ordered


def _load_catalog_from_db(db: Session) -> list[str]:
    candidates: list[str] = []

    candidates.extend(
        skill_name
        for (skill_name,) in db.query(m.UserSkill.skill_name)
        .order_by(m.UserSkill.skill_name.asc())
        .all()
        if skill_name
    )
    candidates.extend(
        skill_name
        for (skill_name,) in db.query(m.JobSkill.skill_name)
        .order_by(m.JobSkill.skill_name.asc())
        .all()
        if skill_name
    )

    for (missing_skills,) in db.query(m.SkillGapHistory.missing_skills).all():
        candidates.extend(flatten_missing_skills(missing_skills))

    return _dedupe_preserve_order(candidates)


def search_skills(db: Session, query: str = "", limit: int = 15) -> list[str]:
    """
    Return persisted skills filtered by the provided query, prioritizing prefix matches.
    """
    skills = _load_catalog_from_db(db)
    limit = max(1, min(limit, 50))

    normalized_query = normalize_skill_name(query).lower()
    if not normalized_query:
        return skills[:limit]

    startswith = [skill for skill in skills if skill.lower().startswith(normalized_query)]
    contains = [
        skill
        for skill in skills
        if normalized_query in skill.lower() and skill not in startswith
    ]

    return (startswith + contains)[:limit]
