"""
Hybrid skill-gap analysis service.

GPT is used only to generate required skills for a role snapshot.
Missing skills are always computed locally from required_skills - current_user_skills.
"""

from __future__ import annotations

import json
from typing import Any, Iterable, Mapping

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.data import models as m
from app.services.ai.gpt_service import (
    SkillGapGptContext,
    analyze_skill_gap_with_gpt as analyze_skill_gap_with_progressive_gpt,
)
from app.services.jobs.role_utils import resolve_desired_job_title
from app.services.ai.skill_comparison_service import compute_skill_differences
from app.services.skill_gap.skill_gap_utils import (
    CATEGORY_KEYS,
    PRIORITY_KEYS,
    clean_text,
    describe_skill,
    flatten_missing_skills,
    matches_any_skill,
    normalize_priority_groups_semantic,
    normalize_skill,
    normalize_missing_skills,
    normalize_priority_groups,
    normalize_skill_key,
    normalize_skill_list,
    normalize_skill_list_semantic,
    semantic_skill_signatures,
    skills_match,
)
from app.services.ai.skill_matcher import enhance_with_semantic_matches


def _get_latest_history(
    db: Session,
    *,
    user_id: int,
    job_title: str,
) -> m.SkillGapHistory | None:
    statement = (
        select(m.SkillGapHistory)
        .where(m.SkillGapHistory.user_id == user_id)
        .where(func.lower(m.SkillGapHistory.job_title) == job_title.lower())
        .order_by(m.SkillGapHistory.created_at.desc(), m.SkillGapHistory.id.desc())
        .limit(1)
    )
    return db.execute(statement).scalar_one_or_none()


def _get_latest_history_by_state(
    db: Session,
    *,
    user_id: int,
    critical_state_key: str,
) -> m.SkillGapHistory | None:
    statement = (
        select(m.SkillGapHistory)
        .where(m.SkillGapHistory.user_id == user_id)
        .where(m.SkillGapHistory.critical_state_key == critical_state_key)
        .order_by(m.SkillGapHistory.created_at.desc(), m.SkillGapHistory.id.desc())
        .limit(1)
    )
    return db.execute(statement).scalar_one_or_none()


def _normalize_critical_state(
    *,
    education: Any,
    experience: Any,
    desired_job_title: Any,
    target_role: Any,
) -> dict[str, str]:
    resolved_job_title = resolve_desired_job_title(desired_job_title, target_role)
    cleaned_target_role = clean_text(target_role)

    if resolved_job_title and cleaned_target_role.lower() == resolved_job_title.lower():
        cleaned_target_role = ""

    return {
        "education": clean_text(education).lower(),
        "experience_level": clean_text(experience).lower(),
        "desired_job_title": resolved_job_title.lower(),
        "target_role": cleaned_target_role.lower(),
    }


def _build_critical_state_key(
    *,
    education: Any,
    experience: Any,
    desired_job_title: Any,
    target_role: Any,
) -> str:
    normalized_state = _normalize_critical_state(
        education=education,
        experience=experience,
        desired_job_title=desired_job_title,
        target_role=target_role,
    )
    return json.dumps(normalized_state, sort_keys=True, separators=(",", ":"))


def _build_missing_by_level(skill_priority: Mapping[str, Iterable[str]]) -> dict[str, list[str]]:
    normalized_priority = normalize_priority_groups(skill_priority)
    return {
        "HIGH": normalized_priority["high"],
        "MEDIUM": normalized_priority["medium"],
        "LOW": normalized_priority["low"],
    }


def _build_gpt_context(payload: dict[str, Any]) -> SkillGapGptContext:
    desired_job_title = resolve_desired_job_title(
        payload.get("desired_job_title"),
        payload.get("target_role"),
    )
    target_role = clean_text(payload.get("target_role")) or desired_job_title

    return SkillGapGptContext(
        education=clean_text(payload.get("education")),
        field_of_study=clean_text(payload.get("field")),
        current_skills=[],
        desired_job_title=desired_job_title,
        target_role=target_role,
        experience_level=clean_text(payload.get("experience")),
    )


def _normalize_required_skills_by_level(required_skills: Any) -> dict[str, list[str]]:
    if not isinstance(required_skills, Mapping):
        return normalize_priority_groups_semantic({"medium": required_skills})

    return normalize_priority_groups_semantic(required_skills)


def _flatten_required_skills(required_skills_by_level: Mapping[str, Iterable[str]]) -> list[str]:
    normalized = _normalize_required_skills_by_level(required_skills_by_level)
    flattened: list[str] = []

    for priority in PRIORITY_KEYS:
        flattened.extend(normalized[priority])

    return flattened


def _build_required_skills_from_gpt(gpt_result) -> dict[str, list[str]]:
    category_required = normalize_missing_skills(gpt_result.role_required_skills)
    required_by_level = _normalize_required_skills_by_level(gpt_result.skill_priority)
    required_flat_from_categories = flatten_missing_skills(category_required)
    assigned_keys = set(semantic_skill_signatures(_flatten_required_skills(required_by_level)))

    for skill in required_flat_from_categories:
        skill_key = describe_skill(skill).semantic_key
        if skill_key and skill_key not in assigned_keys:
            required_by_level["medium"].append(skill)
            assigned_keys.add(skill_key)

    return _normalize_required_skills_by_level(required_by_level)


def _load_required_skills_by_level_from_history(history: m.SkillGapHistory | None) -> dict[str, list[str]]:
    if history is None:
        return {priority: [] for priority in PRIORITY_KEYS}

    required_by_level = _normalize_required_skills_by_level(history.required_skill_priority)
    if _flatten_required_skills(required_by_level):
        return required_by_level

    return _normalize_required_skills_by_level(
        {
            "medium": history.required_skills,
        }
    )


def _group_skills_by_category(skills: Iterable[str]) -> dict[str, list[str]]:
    groups = {category: [] for category in CATEGORY_KEYS}

    for skill in normalize_skill_list_semantic(skills):
        skill_key = normalize_skill(skill)
        if any(marker in skill_key for marker in ("communication", "collaboration", "leadership", "stakeholder", "problem solving", "documentation", "teamwork", "facilitation")):
            groups["soft"].append(skill)
        elif any(marker in skill_key for marker in ("sql", "docker", "kubernetes", "pytorch", "tensorflow", "tableau", "power bi", "excel", "figma", "jira", "selenium", "playwright", "spark", "airflow", "pandas", "scikit", "node.js", "react")):
            groups["tools"].append(skill)
        else:
            groups["technical"].append(skill)

    return groups


def _validate_gap_result(
    *,
    required_skills: list[str],
    current_user_skills: list[str],
    missing_skills: list[str],
) -> None:
    required_signatures = set(semantic_skill_signatures(required_skills))
    missing_signatures = set(semantic_skill_signatures(missing_skills))

    for missing_skill in missing_skills:
        if matches_any_skill(current_user_skills, missing_skill):
            raise ValueError("A skill cannot exist in both current_user_skills and missing_skills.")

    if not missing_signatures.issubset(required_signatures):
        raise ValueError("missing_skills must be a subset of required_skills.")

def _apply_smart_priority_classification(
    categorized: dict[str, list[str]],
    missing_skills: list[str],
    desired_job_title: str | None
) -> dict[str, list[str]]:
    skill_scores = {}
    for skill in missing_skills:
        skill_normalized = skill.lower()
        score = 1
        
        if any(kw in skill_normalized for kw in ["deployment", "mlops", "pipeline", "monitoring", "production"]):
            score = 3
        elif any(kw in skill_normalized for kw in ["aws", "kubernetes", "docker"]):
            score = 2
            
        skill_scores[skill] = score
        
    sorted_missing = sorted(missing_skills, key=lambda s: skill_scores[s], reverse=True)
    new_categorized = {"high": [], "medium": [], "low": []}
    
    force_high = set()
    if desired_job_title and "machine learning" in desired_job_title.lower():
        force_high.update([
            "model deployment", "mlops", "feature engineering", "data preprocessing"
        ])
    
    for skill in sorted_missing:
        skill_normalized = skill.lower()
        score = skill_scores[skill]
        is_forced = any(fh in skill_normalized for fh in force_high)
        
        original_bucket = "low"
        if skill in categorized.get("high", []):
            original_bucket = "high"
        elif skill in categorized.get("medium", []):
            original_bucket = "medium"
            
        if is_forced or score == 3:
            new_categorized["high"].append(skill)
        else:
            new_categorized[original_bucket].append(skill)
            
    if len(new_categorized["high"]) < 3:
        for skill in sorted_missing:
            if len(new_categorized["high"]) >= 3:
                break
            if skill not in new_categorized["high"]:
                new_categorized["high"].append(skill)
                if skill in new_categorized["medium"]:
                    new_categorized["medium"].remove(skill)
                if skill in new_categorized["low"]:
                    new_categorized["low"].remove(skill)
                    
    return new_categorized


def compute_skill_gap(required_skills: Any, current_user_skills: Any, desired_job_title: str | None = None) -> dict[str, Any]:
    normalized_required = _normalize_required_skills_by_level(required_skills)
    normalized_current = normalize_skill_list_semantic(current_user_skills)
    required_flat = _flatten_required_skills(normalized_required)
    normalized_user_skills = semantic_skill_signatures(normalized_current)
    normalized_required_skills = semantic_skill_signatures(required_flat)
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    categorized = {priority: [] for priority in PRIORITY_KEYS}
    
    weights_map = {"high": 3.0, "medium": 2.0, "low": 1.0}
    total_weight = 0.0
    matched_weight = 0.0
    matched_skills_with_weights = {}

    for priority in PRIORITY_KEYS:
        weight = weights_map.get(priority, 1.0)
        for skill in normalized_required[priority]:
            total_weight += weight
            if matches_any_skill(normalized_current, skill):
                matched_skills.append(skill)
                matched_weight += weight
                matched_skills_with_weights[skill] = weight
            else:
                categorized[priority].append(skill)
                missing_skills.append(skill)

    categorized = _apply_smart_priority_classification(categorized, missing_skills, desired_job_title)

    _validate_gap_result(
        required_skills=required_flat,
        current_user_skills=normalized_current,
        missing_skills=missing_skills,
    )

    score = round((matched_weight / total_weight) * 100, 2) if total_weight > 0 else 0.0

    return {
        "normalized_user_skills": normalized_user_skills,
        "required_skills": required_flat,
        "normalized_required": normalized_required_skills,
        "normalized_required_skills": normalized_required_skills,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "categorized": categorized,
        "score": score,
        "total_weight": total_weight,
        "matched_weight": matched_weight,
        "matched_skills_with_weights": matched_skills_with_weights,
    }


def _detect_newly_added_required_skills(
    *,
    previous_skills: list[str],
    current_skills: list[str],
    required_skills: list[str],
) -> list[str]:
    added_skills, _ = compute_skill_differences(previous_skills, current_skills)
    detected: list[str] = []
    seen: set[str] = set()

    for skill in normalize_skill_list_semantic(required_skills):
        semantic_key = describe_skill(skill).semantic_key
        if semantic_key in seen:
            continue

        if any(skills_match(added_skill, skill) for added_skill in added_skills):
            detected.append(skill)
            seen.add(semantic_key)

    return detected


def _build_improvement_reason(newly_added_skills_detected: list[str]) -> str:
    if not newly_added_skills_detected:
        return "No significant skill improvements detected."

    return (
        "Great progress! You added new relevant skills such as "
        f"{', '.join(newly_added_skills_detected)}. This improves your alignment with the target role."
    )


def _serialize_analyze_response(
    *,
    history: m.SkillGapHistory,
    required_skills_by_level: dict[str, list[str]],
    result: dict[str, Any],
    newly_added_skills_detected: list[str],
    source: str,
) -> dict[str, Any]:
    previous_match_score = history.previous_match_score
    score_delta = (
        round(history.match_score - previous_match_score, 2)
        if previous_match_score is not None
        else 0.0
    )
    if score_delta > 0:
        score_direction = "up"
    elif score_delta < 0:
        score_direction = "down"
    else:
        score_direction = "flat"

    created_at = history.created_at.isoformat() if history.created_at else None
    required_by_level_response = _build_missing_by_level(required_skills_by_level)
    missing_by_level_response = _build_missing_by_level(result["categorized"])
    required_by_category = _group_skills_by_category(result["required_skills"])
    missing_by_category = _group_skills_by_category(result["missing_skills"])

    exact_matches = result.get("exact_matches") or []
    semantic_matches = result.get("semantic_matches") or []

    return {
        "status": "success",
        "score": result["score"],
        "normalized_user_skills": result["normalized_user_skills"],
        "required_skills": result["required_skills"],
        "normalized_required": result["normalized_required"],
        "normalized_required_skills": result["normalized_required_skills"],
        "required_skills_by_level": required_by_level_response,
        "missing_skills": result["missing_skills"],
        "skill_gap": result["missing_skills"],
        "matched_skills": result["matched_skills"],
        "exact_matches": exact_matches,
        "semantic_matches": semantic_matches,
        "newly_added_skills_detected": newly_added_skills_detected,
        "improvement_detected": bool(newly_added_skills_detected),
        "missing_by_level": missing_by_level_response,
        "skills_snapshot": normalize_skill_list_semantic(history.user_skills_snapshot),
        "source": source,
        "created_at": created_at,
        "basic_analysis": {
            "existing_skills": result["matched_skills"],
            "missing_skills": result["missing_skills"],
            "match_percentage": result["score"],
        },
        "ai_analysis": {
            "match_score": result["score"],
            "normalized_user_skills": result["normalized_user_skills"],
            "role_required_skills": required_by_category,
            "normalized_required_skills": result["normalized_required_skills"],
            "missing_skills": missing_by_category,
            "skill_priority": normalize_priority_groups(required_skills_by_level),
            "required_skills_by_level": normalize_priority_groups(required_skills_by_level),
            "matched_skills": result["matched_skills"],
            "exact_matches": exact_matches,
            "semantic_matches": semantic_matches,
            "skill_gap": result["missing_skills"],
            "improvement_detected": bool(newly_added_skills_detected),
            "improvement_reason": _build_improvement_reason(newly_added_skills_detected),
            "newly_acquired_skills": newly_added_skills_detected,
            "newly_added_skills_detected": newly_added_skills_detected,
            "still_missing_skills": result["missing_skills"],
            "previous_match_score": previous_match_score,
            "score_delta": score_delta,
            "score_direction": score_direction,
            "cached": source == "database",
            "created_at": created_at,
        },
    }


def _serialize_latest_response(history: m.SkillGapHistory) -> dict[str, Any]:
    required_skills_by_level = _load_required_skills_by_level_from_history(history)

    return {
        "status": "success",
        "score": history.match_score,
        "normalized_user_skills": semantic_skill_signatures(history.user_skills_snapshot),
        "required_skills": normalize_skill_list_semantic(history.required_skills),
        "normalized_required": semantic_skill_signatures(history.required_skills),
        "normalized_required_skills": semantic_skill_signatures(history.required_skills),
        "required_skills_by_level": _build_missing_by_level(required_skills_by_level),
        "missing_by_level": _build_missing_by_level(normalize_priority_groups(history.skill_priority)),
        "skills_snapshot": normalize_skill_list_semantic(history.user_skills_snapshot),
        "source": "database",
        "created_at": history.created_at.isoformat() if history.created_at else None,
    }


def _build_history_record(
    *,
    user_id: int,
    job_title: str,
    critical_state_key: str,
    current_skills: list[str],
    required_skills: list[str],
    required_skills_by_level: dict[str, list[str]],
    missing_skills_by_category: dict[str, list[str]],
    missing_skills_by_level: dict[str, list[str]],
    match_score: float,
    previous_match_score: float | None,
    newly_added_skills_detected: list[str],
    still_missing_skills: list[str],
) -> m.SkillGapHistory:
    return m.SkillGapHistory(
        user_id=user_id,
        job_title=job_title,
        critical_state_key=critical_state_key,
        match_score=match_score,
        previous_match_score=previous_match_score,
        required_skills=normalize_skill_list_semantic(required_skills),
        required_skill_priority=_normalize_required_skills_by_level(required_skills_by_level),
        missing_skills=normalize_missing_skills(missing_skills_by_category),
        skill_priority=normalize_priority_groups(missing_skills_by_level),
        improvement_detected=bool(newly_added_skills_detected),
        improvement_reason=_build_improvement_reason(newly_added_skills_detected),
        newly_acquired_skills=normalize_skill_list_semantic(newly_added_skills_detected),
        still_missing_skills=normalize_skill_list_semantic(still_missing_skills),
        user_skills_snapshot=normalize_skill_list_semantic(current_skills),
    )


def get_latest_skill_gap_for_user(
    db: Session,
    *,
    user: m.User,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    desired_job_title = resolve_desired_job_title(
        payload.get("desired_job_title") or user.desired_job_title,
        payload.get("target_role") or user.target_role,
    )
    target_role = clean_text(payload.get("target_role") or user.target_role)
    critical_state_key = _build_critical_state_key(
        education=payload.get("education") or user.education_level,
        experience=payload.get("experience") or user.experience_level,
        desired_job_title=desired_job_title,
        target_role=target_role,
    )

    history = _get_latest_history_by_state(
        db,
        user_id=user.id,
        critical_state_key=critical_state_key,
    )

    if history is None:
        return None

    return _serialize_latest_response(history)


async def analyze_skill_gap_for_user(
    db: Session,
    *,
    user: m.User,
    payload: dict[str, Any],
) -> dict[str, Any]:
    current_skills = normalize_skill_list_semantic(payload.get("skills"))
    if not current_skills:
        current_skills = normalize_skill_list_semantic([skill.skill_name for skill in user.skills])

    desired_job_title = resolve_desired_job_title(
        payload.get("desired_job_title") or user.desired_job_title,
        payload.get("target_role") or user.target_role,
    )
    target_role = clean_text(payload.get("target_role") or user.target_role)
    education = clean_text(payload.get("education") or user.education_level)
    experience = clean_text(payload.get("experience") or user.experience_level)
    field_of_study = clean_text(payload.get("field") or user.field_of_study)
    critical_state_key = _build_critical_state_key(
        education=education,
        experience=experience,
        desired_job_title=desired_job_title,
        target_role=target_role,
    )

    latest_history_by_state = _get_latest_history_by_state(
        db,
        user_id=user.id,
        critical_state_key=critical_state_key,
    )
    previous_skills = normalize_skill_list_semantic(
        latest_history_by_state.user_skills_snapshot if latest_history_by_state is not None else [],
    )
    previous_score = latest_history_by_state.match_score if latest_history_by_state is not None else None

    required_skills_by_level = _load_required_skills_by_level_from_history(latest_history_by_state)
    if _flatten_required_skills(required_skills_by_level):
        source = "database"
    else:
        gpt_context = _build_gpt_context(
            {
                "education": education,
                "experience": experience,
                "field": field_of_study,
                "desired_job_title": desired_job_title,
                "target_role": target_role or None,
            }
        )
        gpt_result = await analyze_skill_gap_with_progressive_gpt(gpt_context)
        required_skills_by_level = _build_required_skills_from_gpt(gpt_result)
        source = "gpt"

    result = compute_skill_gap(required_skills_by_level, current_skills, desired_job_title)
    result = await enhance_with_semantic_matches(
        result, user_skills=current_skills, db=db,
    )
    newly_added_skills_detected = _detect_newly_added_required_skills(
        previous_skills=previous_skills,
        current_skills=current_skills,
        required_skills=result["required_skills"],
    )
    history_record = _build_history_record(
        user_id=user.id,
        job_title=desired_job_title,
        critical_state_key=critical_state_key,
        current_skills=current_skills,
        required_skills=result["required_skills"],
        required_skills_by_level=required_skills_by_level,
        missing_skills_by_category=_group_skills_by_category(result["missing_skills"]),
        missing_skills_by_level=result["categorized"],
        match_score=result["score"],
        previous_match_score=previous_score,
        newly_added_skills_detected=newly_added_skills_detected,
        still_missing_skills=result["missing_skills"],
    )
    db.add(history_record)
    db.commit()
    db.refresh(history_record)

    return _serialize_analyze_response(
        history=history_record,
        required_skills_by_level=required_skills_by_level,
        result=result,
        newly_added_skills_detected=newly_added_skills_detected,
        source=source,
    )


async def analyze_skill_gap_with_gpt(user_data: dict[str, Any]) -> dict[str, Any]:
    gpt_context = _build_gpt_context(user_data)
    gpt_result = await analyze_skill_gap_with_progressive_gpt(gpt_context)
    required_skills_by_level = _build_required_skills_from_gpt(gpt_result)
    desired_job_title = resolve_desired_job_title(
        user_data.get("desired_job_title"),
        user_data.get("target_role"),
    )
    result = compute_skill_gap(required_skills_by_level, user_data.get("skills"), desired_job_title)
    result = await enhance_with_semantic_matches(
        result, user_skills=user_data.get("skills"), db=None,
    )

    return {
        "normalized_user_skills": result["normalized_user_skills"],
        "required_skills": result["required_skills"],
        "normalized_required": result["normalized_required"],
        "normalized_required_skills": result["normalized_required_skills"],
        "missing_skills": result["missing_skills"],
        "match_score": result["score"],
        "skill_priority": normalize_priority_groups(required_skills_by_level),
        "matched_skills": result["matched_skills"],
        "exact_matches": result.get("exact_matches", []),
        "semantic_matches": result.get("semantic_matches", []),
        "skill_gap": result["missing_skills"],
        "improvement_detected": False,
        "improvement_reason": "",
    }

async def recompute_skill_gap_for_user(
    db: Session,
    *,
    user: m.User,
    payload: dict[str, Any],
) -> dict[str, Any]:
    skills_payload = payload.get("skills")
    if skills_payload is not None:
        current_skills = normalize_skill_list_semantic(skills_payload)
    else:
        current_skills = normalize_skill_list_semantic([skill.skill_name for skill in user.skills])
    
    desired_job_title = resolve_desired_job_title(
        user.desired_job_title,
        user.target_role,
    )
    target_role = clean_text(user.target_role)
    education = clean_text(user.education_level)
    experience = clean_text(user.experience_level)
    critical_state_key = _build_critical_state_key(
        education=education,
        experience=experience,
        desired_job_title=desired_job_title,
        target_role=target_role,
    )

    latest_history_by_state = _get_latest_history_by_state(
        db,
        user_id=user.id,
        critical_state_key=critical_state_key,
    )

    if not latest_history_by_state:
        raise ValueError("No existing skill gap history found for the current role.")

    previous_skills = normalize_skill_list_semantic(
        latest_history_by_state.user_skills_snapshot if latest_history_by_state is not None else [],
    )
    previous_score = latest_history_by_state.match_score

    required_skills_by_level = _load_required_skills_by_level_from_history(latest_history_by_state)
    
    if not _flatten_required_skills(required_skills_by_level):
        raise ValueError("No required skills found to recompute against.")

    result = compute_skill_gap(required_skills_by_level, current_skills, desired_job_title)
    result = await enhance_with_semantic_matches(
        result, user_skills=current_skills, db=db,
    )
    newly_added_skills_detected = _detect_newly_added_required_skills(
        previous_skills=previous_skills,
        current_skills=current_skills,
        required_skills=result["required_skills"],
    )
    
    history_record = _build_history_record(
        user_id=user.id,
        job_title=desired_job_title,
        critical_state_key=critical_state_key,
        current_skills=current_skills,
        required_skills=result["required_skills"],
        required_skills_by_level=required_skills_by_level,
        missing_skills_by_category=_group_skills_by_category(result["missing_skills"]),
        missing_skills_by_level=result["categorized"],
        match_score=result["score"],
        previous_match_score=previous_score,
        newly_added_skills_detected=newly_added_skills_detected,
        still_missing_skills=result["missing_skills"],
    )
    db.add(history_record)
    db.commit()
    db.refresh(history_record)

    return _serialize_analyze_response(
        history=history_record,
        required_skills_by_level=required_skills_by_level,
        result=result,
        newly_added_skills_detected=newly_added_skills_detected,
        source="database",
    )
