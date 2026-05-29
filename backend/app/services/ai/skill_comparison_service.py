"""
Comparison helpers for detecting skill progression across analyses.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.skill_gap.skill_gap_utils import (
    describe_skill,
    flatten_missing_skills,
    normalize_skill_list_semantic,
    semantic_skill_signatures,
)


@dataclass(slots=True)
class SkillComparisonResult:
    previous_missing_skills: list[str] = field(default_factory=list)
    previous_skills: list[str] = field(default_factory=list)
    current_skills: list[str] = field(default_factory=list)
    newly_acquired_skills: list[str] = field(default_factory=list)
    still_missing_skills: list[str] = field(default_factory=list)
    added_skills: list[str] = field(default_factory=list)
    removed_skills: list[str] = field(default_factory=list)
    skills_changed: bool = False


def compute_skill_differences(
    previous_skills,
    current_skills,
) -> tuple[list[str], list[str]]:
    normalized_previous_skills = normalize_skill_list_semantic(previous_skills or [])
    normalized_current_skills = normalize_skill_list_semantic(current_skills or [])

    previous_skill_map = {
        describe_skill(skill).semantic_key: skill for skill in normalized_previous_skills
    }
    current_skill_map = {
        describe_skill(skill).semantic_key: skill for skill in normalized_current_skills
    }

    added_skills = [
        skill
        for skill in normalized_current_skills
        if describe_skill(skill).semantic_key not in previous_skill_map
    ]
    removed_skills = [
        skill
        for skill in normalized_previous_skills
        if describe_skill(skill).semantic_key not in current_skill_map
    ]

    return added_skills, removed_skills


def compare_skill_progress(
    previous_missing_skills,
    current_skills,
    previous_skills = None,
) -> SkillComparisonResult:
    if isinstance(previous_missing_skills, dict):
        normalized_previous_missing = normalize_skill_list_semantic(
            flatten_missing_skills(previous_missing_skills or {})
        )
    else:
        normalized_previous_missing = normalize_skill_list_semantic(previous_missing_skills or [])
    normalized_previous_skills = normalize_skill_list_semantic(previous_skills or [])
    normalized_current_skills = normalize_skill_list_semantic(current_skills or [])

    previous_skill_map = {
        describe_skill(skill).semantic_key: skill for skill in normalized_previous_skills
    }
    current_skill_map = {
        describe_skill(skill).semantic_key: skill for skill in normalized_current_skills
    }

    newly_acquired_skills: list[str] = []
    still_missing_skills: list[str] = []
    seen_missing: set[str] = set()

    for skill in normalized_previous_missing:
        key = describe_skill(skill).semantic_key
        if key in seen_missing:
            continue

        seen_missing.add(key)
        if key in current_skill_map and key not in previous_skill_map:
            newly_acquired_skills.append(current_skill_map[key])
        elif key in current_skill_map:
            continue
        else:
            still_missing_skills.append(skill)

    added_skills, removed_skills = compute_skill_differences(
        normalized_previous_skills,
        normalized_current_skills,
    )

    return SkillComparisonResult(
        previous_missing_skills=normalized_previous_missing,
        previous_skills=normalized_previous_skills,
        current_skills=normalized_current_skills,
        newly_acquired_skills=newly_acquired_skills,
        still_missing_skills=still_missing_skills,
        added_skills=added_skills,
        removed_skills=removed_skills,
        skills_changed=set(semantic_skill_signatures(normalized_previous_skills))
        != set(semantic_skill_signatures(normalized_current_skills)),
    )
