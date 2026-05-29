"""
Two-stage skill matching pipeline.

Stage 1 (synchronous, deterministic):
    - Normalize skill text (lowercase, trim, strip special chars,
      replace dashes/underscores with spaces).
    - Apply lightweight alias / synonym map (ai -> artificial intelligence, etc.).
    - Perform exact (alias-resolved) matching.

Stage 2 (asynchronous, OpenAI embeddings):
    - Only invoked for required skills that did not exact-match.
    - Generates embeddings for the leftover required skills and the
      leftover candidate skills using ``text-embedding-3-small``.
    - Computes cosine similarity and promotes pairs above a configurable
      threshold (default 0.65) to ``semantic`` matches.
    - Embeddings are cached in-memory and in the database to avoid
      re-embedding the same skill more than once.
"""

from __future__ import annotations

import logging
import math
import os
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.data import models as m
from app.services.skill_gap.skill_gap_utils import (
    clean_text as _clean_text,
    normalize_skill,
    parse_skills,
    split_camel_case,
)

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv("SKILL_EMBEDDING_MODEL", "text-embedding-3-small")
SEMANTIC_SIMILARITY_THRESHOLD = float(
    os.getenv("SKILL_SEMANTIC_THRESHOLD", "0.65")
)
EMBEDDING_BATCH_SIZE = 96


# ---------------------------------------------------------------------------
# Alias / synonym map
# ---------------------------------------------------------------------------
RAW_SKILL_ALIASES: dict[str, str] = {
    "ai": "artificial intelligence",
    "ml": "machine learning",
    "dl": "deep learning",
    "nlp": "natural language processing",
    "cv": "computer vision",
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "node": "node js",
    "node.js": "node js",
    "nodejs": "node js",
    "react.js": "react",
    "reactjs": "react",
    "vue.js": "vue",
    "vuejs": "vue",
    "next.js": "next js",
    "nextjs": "next js",
    "scikit learn": "scikit-learn",
    "scikit-learn": "scikit-learn",
    "sklearn": "scikit-learn",
    "data analyst": "data analysis",
    "data scientist": "data science",
    "tf": "tensorflow",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "ms sql": "sql server",
    "mssql": "sql server",
    "rest api": "rest apis",
    "restful api": "rest apis",
    "ci cd": "cicd pipelines",
    "ci/cd": "cicd pipelines",
    "cicd": "cicd pipelines",
    "gcp": "google cloud",
    "aws": "amazon web services",
}

SKILL_ALIASES: dict[str, str] = {}
for _alias, _canonical in RAW_SKILL_ALIASES.items():
    _alias_key = normalize_skill(_alias)
    _canonical_key = normalize_skill(_canonical)
    if _alias_key and _canonical_key:
        SKILL_ALIASES[_alias_key] = _canonical_key


def _normalize_match_input(skill: Any) -> tuple[str, str]:
    """Return ``(normalized, spaced_normalized)`` for a raw skill string.

    ``normalized`` is the existing legacy form (lowercased, special chars
    stripped) which preserves brand-word joining ("TensorFlow" -> "tensorflow").

    ``spaced_normalized`` is the additional camelCase/PascalCase-split form
    used purely as a matching fallback so phrasal labels like
    "DataAnalysis" or "NaturalLanguageProcessing" collapse onto their
    properly-spaced counterparts at comparison time.
    """
    raw = _clean_text(skill)
    if not raw:
        return "", ""
    normalized = normalize_skill(raw)
    spaced = normalize_skill(split_camel_case(raw))
    return normalized, spaced


def alias_resolve(skill: Any) -> str:
    """Return the canonical (alias-resolved) comparison key for a skill.

    The matcher tolerates the following spellings of the same concept by
    collapsing them to a single space-stripped comparison key:

        "DataAnalysis"        -> "dataanalysis"
        "Data Analysis"       -> "dataanalysis"
        "data analyst"        -> "dataanalysis"   (via alias)
        "PyTorch" / "pytorch" -> "pytorch"
        "AWS"                 -> "amazonwebservices"  (via alias)
    """
    normalized, spaced = _normalize_match_input(skill)
    if not normalized and not spaced:
        return ""

    # 1. Direct alias hit on either form.
    for candidate in (normalized, spaced):
        if candidate and candidate in SKILL_ALIASES:
            return SKILL_ALIASES[candidate].replace(" ", "")

    # 2. Joined-form alias hit (handles camelCase brand words like
    #    "PyTorch" -> "py torch" -> joined "pytorch").
    joined = (spaced or normalized).replace(" ", "")
    if joined and joined in SKILL_ALIASES:
        return SKILL_ALIASES[joined].replace(" ", "")

    # 3. Fall back to the joined comparison key so spaced and camelCase
    #    spellings of the same concept collapse together.
    return joined


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------
@dataclass
class SemanticMatch:
    skill: str
    matched_with: str
    similarity: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "skill": self.skill,
            "matched_with": self.matched_with,
            "similarity": round(self.similarity, 4),
            "type": "semantic",
        }


@dataclass
class SkillMatchResult:
    exact_matches: list[str] = field(default_factory=list)
    semantic_matches: list[SemanticMatch] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)

    @property
    def matched_skills(self) -> list[str]:
        return [*self.exact_matches, *(sm.skill for sm in self.semantic_matches)]

    def matched_set(self) -> set[str]:
        return set(self.matched_skills)


# ---------------------------------------------------------------------------
# Embedding cache (in-memory + DB)
# ---------------------------------------------------------------------------
_MEMORY_EMBEDDING_CACHE: dict[str, list[float]] = {}
_MEMORY_LOCK = threading.Lock()


def _cache_get(key: str) -> list[float] | None:
    with _MEMORY_LOCK:
        return _MEMORY_EMBEDDING_CACHE.get(key)


def _cache_set(key: str, vector: list[float]) -> None:
    with _MEMORY_LOCK:
        _MEMORY_EMBEDDING_CACHE[key] = vector


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    dot = 0.0
    norm_left = 0.0
    norm_right = 0.0
    for a, b in zip(left, right):
        dot += a * b
        norm_left += a * a
        norm_right += b * b
    if norm_left == 0.0 or norm_right == 0.0:
        return 0.0
    return dot / (math.sqrt(norm_left) * math.sqrt(norm_right))


@lru_cache(maxsize=1)
def _openai_client():
    """Lazily build the AsyncOpenAI client.

    Returns ``None`` if the ``OPENAI_API_KEY`` environment variable is missing
    so callers can gracefully fall back to Stage 1 only.
    """
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.warning("openai package is not installed; semantic matching disabled.")
        return None
    return AsyncOpenAI(api_key=api_key)


async def _fetch_embeddings_from_openai(keys: list[str]) -> dict[str, list[float]]:
    client = _openai_client()
    if client is None or not keys:
        return {}

    fetched: dict[str, list[float]] = {}
    for start in range(0, len(keys), EMBEDDING_BATCH_SIZE):
        batch = keys[start : start + EMBEDDING_BATCH_SIZE]
        try:
            response = await client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch,
            )
        except Exception as exc:  # noqa: BLE001 - network/runtime errors are non-fatal here
            logger.error(
                "[skill-match] OpenAI embeddings request failed (%s skills): %s",
                len(batch),
                exc,
            )
            return fetched
        for index, item in enumerate(response.data):
            key = batch[index]
            vector = list(item.embedding)
            fetched[key] = vector
            _cache_set(key, vector)
    return fetched


def _load_db_cached_embeddings(
    db: Session,
    keys: list[str],
) -> dict[str, list[float]]:
    if not keys:
        return {}
    try:
        rows = (
            db.query(m.SkillEmbeddingCache)
            .filter(
                m.SkillEmbeddingCache.skill_key.in_(keys),
                m.SkillEmbeddingCache.model == EMBEDDING_MODEL,
            )
            .all()
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[skill-match] DB embedding cache lookup failed: %s", exc)
        return {}

    cached: dict[str, list[float]] = {}
    for row in rows:
        if isinstance(row.embedding, list) and row.embedding:
            cached[row.skill_key] = list(row.embedding)
            _cache_set(row.skill_key, cached[row.skill_key])
    return cached


def _persist_embeddings(db: Session, embeddings: dict[str, list[float]]) -> None:
    if not embeddings:
        return
    try:
        for key, vector in embeddings.items():
            db.add(
                m.SkillEmbeddingCache(
                    skill_key=key,
                    model=EMBEDDING_MODEL,
                    embedding=vector,
                )
            )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("[skill-match] failed to persist embedding cache: %s", exc)
        db.rollback()


async def _load_embeddings(
    skills: Iterable[str],
    *,
    db: Session | None,
) -> dict[str, list[float]]:
    """Return mapping ``alias_key -> embedding`` for the given input skills."""
    keys: list[str] = []
    seen: set[str] = set()
    for skill in skills:
        key = alias_resolve(skill)
        if not key or key in seen:
            continue
        seen.add(key)
        keys.append(key)

    if not keys:
        return {}

    embeddings: dict[str, list[float]] = {}
    needed: list[str] = []
    for key in keys:
        cached = _cache_get(key)
        if cached is not None:
            embeddings[key] = cached
        else:
            needed.append(key)

    if needed and db is not None:
        db_cached = _load_db_cached_embeddings(db, needed)
        embeddings.update(db_cached)
        needed = [key for key in needed if key not in db_cached]

    if needed:
        fetched = await _fetch_embeddings_from_openai(needed)
        embeddings.update(fetched)
        if fetched and db is not None:
            _persist_embeddings(db, fetched)

    return embeddings


# ---------------------------------------------------------------------------
# Public matching API
# ---------------------------------------------------------------------------
def _dedupe_normalized(values: Iterable[Any]) -> list[str]:
    """Normalize, dedupe (by normalized form) and preserve order."""
    seen: set[str] = set()
    result: list[str] = []
    for raw in parse_skills(values):
        normalized = normalize_skill(raw)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


async def match_skills(
    *,
    required_skills: Iterable[Any],
    user_skills: Iterable[Any],
    threshold: float = SEMANTIC_SIMILARITY_THRESHOLD,
    db: Session | None = None,
) -> SkillMatchResult:
    """Run the two-stage matching pipeline."""
    required_normalized = _dedupe_normalized(required_skills)
    user_normalized = _dedupe_normalized(user_skills)

    # Stage 1: alias-resolved exact match.
    user_alias_lookup: dict[str, str] = {}
    for skill in user_normalized:
        key = alias_resolve(skill)
        user_alias_lookup.setdefault(key, skill)

    result = SkillMatchResult()
    unmatched_required: list[str] = []
    used_user_keys: set[str] = set()

    for required in required_normalized:
        required_key = alias_resolve(required)
        if required_key and required_key in user_alias_lookup:
            logger.info(
                "[skill-match] EXACT %r <-> %r (key=%s)",
                required,
                user_alias_lookup[required_key],
                required_key,
            )
            result.exact_matches.append(required)
            used_user_keys.add(required_key)
        else:
            unmatched_required.append(required)

    unmatched_user = [
        skill
        for skill in user_normalized
        if alias_resolve(skill) not in used_user_keys
    ]

    if not unmatched_required:
        return result

    if not unmatched_user:
        result.missing_skills.extend(unmatched_required)
        return result

    # Stage 2: semantic matching for the leftovers.
    try:
        embeddings = await _load_embeddings(
            [*unmatched_required, *unmatched_user], db=db
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("[skill-match] embeddings failed, falling back to Stage 1 only: %s", exc)
        embeddings = {}

    consumed_user_keys: set[str] = set()
    for required in unmatched_required:
        req_key = alias_resolve(required)
        req_vec = embeddings.get(req_key)
        if not req_vec:
            logger.info("[skill-match] MISSING %r (no embedding)", required)
            result.missing_skills.append(required)
            continue

        best_score = 0.0
        best_user_label: str | None = None
        best_user_key: str | None = None
        for user_skill in unmatched_user:
            user_key = alias_resolve(user_skill)
            if not user_key or user_key in consumed_user_keys:
                continue
            user_vec = embeddings.get(user_key)
            if not user_vec:
                continue
            score = _cosine_similarity(req_vec, user_vec)
            if score > best_score:
                best_score = score
                best_user_label = user_skill
                best_user_key = user_key

        if best_user_key and best_score >= threshold:
            logger.info(
                "[skill-match] SEMANTIC %r <-> %r (similarity=%.4f, threshold=%.2f)",
                required,
                best_user_label,
                best_score,
                threshold,
            )
            consumed_user_keys.add(best_user_key)
            result.semantic_matches.append(
                SemanticMatch(
                    skill=required,
                    matched_with=best_user_label or "",
                    similarity=float(best_score),
                )
            )
        else:
            logger.info(
                "[skill-match] MISSING %r (best=%.4f below threshold=%.2f)",
                required,
                best_score,
                threshold,
            )
            result.missing_skills.append(required)

    return result


async def enhance_with_semantic_matches(
    base_result: dict[str, Any],
    *,
    user_skills: Iterable[Any],
    threshold: float = SEMANTIC_SIMILARITY_THRESHOLD,
    db: Session | None = None,
) -> dict[str, Any]:
    """Augment a ``compute_skill_gap`` result with semantic matches.

    Stage 1 outputs (``matched_skills``, ``missing_skills``, weighted score)
    are preserved.  Skills in ``missing_skills`` are then re-evaluated against
    the user's leftover skills using OpenAI embeddings; matches above
    ``threshold`` are promoted from "missing" to "semantic_matches" and the
    weighted score is recomputed accordingly.
    """
    missing_skills: list[str] = list(base_result.get("missing_skills") or [])
    matched_skills: list[str] = list(base_result.get("matched_skills") or [])
    matched_weights: dict[str, float] = dict(
        base_result.get("matched_skills_with_weights") or {}
    )
    categorized: dict[str, list[str]] = {
        priority: list(values or [])
        for priority, values in (base_result.get("categorized") or {}).items()
    }

    # Mark exact matches: everything currently in ``matched_skills`` is exact
    # (Stage 1).  ``semantic_matches`` is layered on top by this function.
    base_result.setdefault("exact_matches", list(matched_skills))
    base_result.setdefault("semantic_matches", [])

    if not missing_skills:
        return base_result

    user_keys_already_used = {alias_resolve(skill) for skill in matched_skills}
    leftover_user_skills = [
        skill
        for skill in _dedupe_normalized(user_skills)
        if alias_resolve(skill) not in user_keys_already_used
    ]

    if not leftover_user_skills:
        return base_result

    semantic_result = await match_skills(
        required_skills=missing_skills,
        user_skills=leftover_user_skills,
        threshold=threshold,
        db=db,
    )

    if not semantic_result.semantic_matches:
        return base_result

    weights_map = {"high": 3.0, "medium": 2.0, "low": 1.0}
    promoted_skills = {match.skill for match in semantic_result.semantic_matches}
    total_weight = float(base_result.get("total_weight") or 0.0)
    matched_weight = float(base_result.get("matched_weight") or 0.0)

    for priority, skills in categorized.items():
        kept = []
        for skill in skills:
            if skill in promoted_skills:
                weight = weights_map.get(priority, 1.0)
                matched_weight += weight
                matched_weights[skill] = weight
            else:
                kept.append(skill)
        categorized[priority] = kept

    new_missing = [skill for skill in missing_skills if skill not in promoted_skills]
    matched_skills_with_semantic = [
        *matched_skills,
        *(match.skill for match in semantic_result.semantic_matches),
    ]

    score = (
        round((matched_weight / total_weight) * 100, 2)
        if total_weight > 0
        else float(base_result.get("score") or 0.0)
    )

    base_result.update(
        {
            "matched_skills": matched_skills_with_semantic,
            "matched_skills_with_weights": matched_weights,
            "matched_weight": matched_weight,
            "missing_skills": new_missing,
            "categorized": categorized,
            "score": score,
            "semantic_matches": [
                match.to_dict() for match in semantic_result.semantic_matches
            ],
        }
    )
    return base_result


__all__ = [
    "EMBEDDING_MODEL",
    "SEMANTIC_SIMILARITY_THRESHOLD",
    "SKILL_ALIASES",
    "SemanticMatch",
    "SkillMatchResult",
    "alias_resolve",
    "enhance_with_semantic_matches",
    "match_skills",
]
