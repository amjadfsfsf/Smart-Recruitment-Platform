"""
Shared normalization and matching helpers for skill-gap analysis.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Iterable

CATEGORY_KEYS = ("technical", "tools", "soft")
PRIORITY_KEYS = ("high", "medium", "low")
MAX_SKILL_WORDS = 3
SKILL_SPLIT_PATTERN = re.compile(r"[,;\n\r]+")
SPECIAL_CHARACTER_PATTERN = re.compile(r"[^a-z0-9\s]")
DEFAULT_SKILL_MATCH_THRESHOLD = 0.6
SKILL_TOKEN_STOPWORDS = {
    "a",
    "an",
    "and",
    "for",
    "in",
    "of",
    "on",
    "the",
    "to",
    "using",
    "use",
    "with",
    "experience",
    "experienced",
    "knowledge",
    "proficiency",
    "proficient",
    "hands",
    "handson",
    "plus",
    "skill",
    "skills",
}
RAW_CANONICAL_SKILL_MAP = {
    "tensorflow": "ml frameworks",
    "pytorch": "ml frameworks",
    "scikit-learn": "ml frameworks",
    "scikit learn": "ml frameworks",
    "sklearn": "ml frameworks",
    "keras": "ml frameworks",
    "ml frameworks": "ml frameworks",
    "machine learning frameworks": "ml frameworks",
    "docker": "containerization",
    "containers": "containerization",
    "containerization": "containerization",
    "kubernetes": "container orchestration",
    "k8s": "container orchestration",
    "container orchestration": "container orchestration",
    "aws": "aws",
    "amazon web services": "aws",
    "gcp": "gcp",
    "google cloud": "gcp",
    "google cloud platform": "gcp",
    "azure": "azure",
    "microsoft azure": "azure",
    "cloud platforms": "cloud platforms",
    "cloud platform": "cloud platforms",
    "sql": "databases",
    "mysql": "databases",
    "postgres": "databases",
    "postgresql": "databases",
    "sqlite": "databases",
    "sql server": "databases",
    "mssql": "databases",
    "oracle": "databases",
    "databases": "databases",
    "problem solving": "problem solving",
    "problem-solving": "problem solving",
    "communication": "communication",
    "collaboration": "collaboration",
    "teamwork": "collaboration",
    "team work": "collaboration",
    "ci/cd": "cicd pipelines",
    "ci cd": "cicd pipelines",
    "ci/cd pipelines": "cicd pipelines",
    "ci cd pipelines": "cicd pipelines",
    "cicd": "cicd pipelines",
    "cicd pipelines": "cicd pipelines",
    "continuous integration": "cicd pipelines",
    "continuous delivery": "cicd pipelines",
    "continuous deployment": "cicd pipelines",
}


def clean_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def normalize_skill_name(value: Any) -> str:
    return clean_text(value)


_CAMEL_LOWER_UPPER_PATTERN = re.compile(r"([a-z\d])([A-Z])")
_CAMEL_UPPER_RUN_PATTERN = re.compile(r"([A-Z]+)([A-Z][a-z])")


def split_camel_case(value: str) -> str:
    """Insert spaces at camelCase / PascalCase boundaries.

    Examples:
        "DataAnalysis"             -> "Data Analysis"
        "NaturalLanguageProcessing"-> "Natural Language Processing"
        "ABTesting"                -> "AB Testing"
        "Already Spaced"           -> "Already Spaced"
    """
    if not value:
        return ""
    spaced = _CAMEL_UPPER_RUN_PATTERN.sub(r"\1 \2", value)
    spaced = _CAMEL_LOWER_UPPER_PATTERN.sub(r"\1 \2", spaced)
    return spaced


def normalize_skill(value: Any) -> str:
    normalized = clean_text(value).lower()
    normalized = (
        normalized.replace("\u2019", "")
        .replace("'", "")
        .replace("\u2013", " ")
        .replace("\u2014", " ")
        .replace("/", "")
        .replace("_", " ")
        .replace("-", " ")
        .replace("&", " and ")
    )
    normalized = SPECIAL_CHARACTER_PATTERN.sub("", normalized)
    return " ".join(normalized.split())


def normalize_skill_key(value: Any) -> str:
    return normalize_skill(value)


GENERIC_MEMBER_SKILLS = {
    "cloud platforms": frozenset({"aws", "gcp", "azure"}),
}
CLOUD_PROVIDER_COMPACT_ALIASES = (
    ("amazonwebservices", "aws"),
    ("googlecloudplatform", "gcp"),
    ("googlecloud", "gcp"),
    ("microsoftazure", "azure"),
    ("aws", "aws"),
    ("gcp", "gcp"),
    ("azure", "azure"),
)
CLOUD_PROVIDER_EXACT_ALIASES = frozenset(
    {
        "aws",
        "amazon web services",
        "gcp",
        "google cloud",
        "google cloud platform",
        "azure",
        "microsoft azure",
    }
)


def _skill_word_count(value: Any) -> int:
    normalized = normalize_skill(value)
    return len(normalized.split()) if normalized else 0


def _expand_cloud_skill(value: Any) -> list[str]:
    normalized = normalize_skill(value)
    if not normalized:
        return []

    compact = re.sub(r"[^a-z0-9]", "", normalized)
    if not compact:
        return []

    saw_generic_label = False
    for generic_label in ("cloudplatforms", "cloudplatform"):
        if compact.startswith(generic_label):
            compact = compact[len(generic_label) :]
            saw_generic_label = True
            break

    for generic_label in ("cloudplatforms", "cloudplatform"):
        if compact.endswith(generic_label):
            compact = compact[: -len(generic_label)]
            saw_generic_label = True
            break

    if not compact:
        return []

    expanded: list[str] = []
    remaining = compact
    while remaining:
        match = next(
            (
                (alias, canonical)
                for alias, canonical in CLOUD_PROVIDER_COMPACT_ALIASES
                if remaining.startswith(alias)
            ),
            None,
        )
        if match is None:
            return []

        alias, canonical = match
        expanded.append(canonical)
        remaining = remaining[len(alias) :]

    if saw_generic_label or len(expanded) > 1 or normalized in CLOUD_PROVIDER_EXACT_ALIASES:
        return expanded

    return []


def _split_long_skill_phrase(value: str) -> list[str]:
    lowered = value.lower()
    if " and " not in lowered:
        return [value]

    parts = [part.strip() for part in re.split(r"\band\b", value, flags=re.IGNORECASE) if part.strip()]
    if len(parts) < 2:
        return [value]

    if any(_skill_word_count(part) > MAX_SKILL_WORDS for part in parts):
        return [value]

    return parts


def _expand_skill_value(value: Any) -> list[str]:
    cleaned = clean_text(value)
    if not cleaned:
        return []

    cloud_skills = _expand_cloud_skill(cleaned)
    if cloud_skills:
        return cloud_skills

    split_values = _split_long_skill_phrase(cleaned)
    if len(split_values) > 1:
        expanded: list[str] = []
        for split_value in split_values:
            expanded.extend(_expand_skill_value(split_value))
        return expanded

    if _skill_word_count(cleaned) > MAX_SKILL_WORDS:
        return []

    return [cleaned]


def parse_skills(values: Any) -> list[str]:
    if values is None:
        return []

    if isinstance(values, str):
        parsed_values: list[str] = []
        for value in SKILL_SPLIT_PATTERN.split(values):
            parsed_values.extend(_expand_skill_value(value))
        return parsed_values

    if isinstance(values, Iterable) and not isinstance(values, (bytes, dict)):
        parsed_values: list[str] = []
        for value in values:
            if value is None:
                continue

            if isinstance(value, str):
                for split_value in SKILL_SPLIT_PATTERN.split(value):
                    parsed_values.extend(_expand_skill_value(split_value))
            else:
                parsed_values.extend(_expand_skill_value(value))
        return parsed_values

    return [str(values)]


def tokenize_skill(value: Any) -> tuple[str, ...]:
    normalized = normalize_skill(value)
    if not normalized:
        return ()

    tokens = [
        token
        for token in normalized.split()
        if token and token not in SKILL_TOKEN_STOPWORDS
    ]
    return tuple(tokens)


CANONICAL_SKILL_MAP = {
    normalize_skill(alias): normalize_skill(canonical)
    for alias, canonical in RAW_CANONICAL_SKILL_MAP.items()
}
CANONICAL_ALIAS_ITEMS = tuple(
    sorted(
        CANONICAL_SKILL_MAP.items(),
        key=lambda item: (-len(item[0].split()), -len(item[0])),
    )
)


@dataclass(frozen=True, slots=True)
class SkillDescriptor:
    original: str
    normalized: str
    canonical: str
    semantic_key: str
    tokens: tuple[str, ...]


def _redundant_generic_skill_keys(present_keys: set[str]) -> set[str]:
    return {
        generic_key
        for generic_key, member_keys in GENERIC_MEMBER_SKILLS.items()
        if generic_key in present_keys and bool(present_keys & member_keys)
    }


def _prune_redundant_generic_skills(skills: list[str]) -> list[str]:
    present_keys = {
        describe_skill(skill).semantic_key
        for skill in skills
        if describe_skill(skill).semantic_key
    }
    redundant_keys = _redundant_generic_skill_keys(present_keys)
    if not redundant_keys:
        return skills

    pruned: list[str] = []
    seen: set[str] = set()
    for skill in skills:
        key = describe_skill(skill).semantic_key
        if not key or key in redundant_keys or key in seen:
            continue

        seen.add(key)
        pruned.append(skill)

    return pruned


def _prune_redundant_generic_priority_groups(
    priority_groups: dict[str, list[str]],
) -> dict[str, list[str]]:
    present_keys = {
        describe_skill(skill).semantic_key
        for priority in PRIORITY_KEYS
        for skill in priority_groups[priority]
        if describe_skill(skill).semantic_key
    }
    redundant_keys = _redundant_generic_skill_keys(present_keys)
    if not redundant_keys:
        return priority_groups

    return {
        priority: [
            skill
            for skill in priority_groups[priority]
            if describe_skill(skill).semantic_key not in redundant_keys
        ]
        for priority in PRIORITY_KEYS
    }


def canonicalize_skill(skill: Any) -> str:
    normalized = normalize_skill(skill)
    if not normalized:
        return ""

    direct_match = CANONICAL_SKILL_MAP.get(normalized)
    if direct_match:
        return direct_match

    # camelCase / PascalCase fallback: a label like "DataAnalysis" lowercases
    # straight to "dataanalysis", which would never match the canonical map
    # key "data analysis".  We re-attempt the lookup using a camelCase-split
    # form (and its space-stripped variant) so users can write skills in
    # either spelling.
    raw = clean_text(skill)
    spaced = split_camel_case(raw).lower()
    spaced_normalized = " ".join(spaced.split())
    if spaced_normalized and spaced_normalized != normalized:
        match = CANONICAL_SKILL_MAP.get(spaced_normalized)
        if match:
            return match
    joined = normalized.replace(" ", "")
    if joined != normalized:
        match = CANONICAL_SKILL_MAP.get(joined)
        if match:
            return match

    tokens = set(tokenize_skill(spaced_normalized or normalized))
    if not tokens:
        return normalized

    for alias, canonical in CANONICAL_ALIAS_ITEMS:
        alias_tokens = set(alias.split())
        if alias_tokens and alias_tokens.issubset(tokens):
            return canonical

    return normalized


def describe_skill(skill: Any) -> SkillDescriptor:
    original = normalize_skill_name(skill)
    normalized = normalize_skill(skill)
    canonical = canonicalize_skill(normalized)
    semantic_key = canonical or normalized
    tokens = tokenize_skill(normalized)

    return SkillDescriptor(
        original=original,
        normalized=normalized,
        canonical=canonical,
        semantic_key=semantic_key,
        tokens=tokens,
    )


def choose_preferred_skill_label(
    current_label: str,
    candidate_label: str,
    semantic_key: str,
) -> str:
    current_normalized = normalize_skill(current_label)
    candidate_normalized = normalize_skill(candidate_label)

    if not current_normalized:
        return candidate_normalized
    if not candidate_normalized:
        return current_normalized

    if current_normalized == semantic_key and candidate_normalized != semantic_key:
        return current_normalized
    if candidate_normalized == semantic_key and current_normalized != semantic_key:
        return candidate_normalized

    if len(candidate_normalized) < len(current_normalized):
        return candidate_normalized

    return current_normalized


def normalize_skill_list(values: Any) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for value in parse_skills(values):
        skill = normalize_skill(value)
        if not skill:
            continue

        if skill in seen:
            continue

        seen.add(skill)
        normalized.append(skill)

    return _prune_redundant_generic_skills(normalized)


def normalize_skill_list_semantic(values: Any) -> list[str]:
    normalized: list[str] = []
    semantic_indices: dict[str, int] = {}

    for value in parse_skills(values):
        descriptor = describe_skill(value)
        if not descriptor.normalized:
            continue

        existing_index = semantic_indices.get(descriptor.semantic_key)
        if existing_index is None:
            semantic_indices[descriptor.semantic_key] = len(normalized)
            normalized.append(descriptor.normalized)
            continue

        normalized[existing_index] = choose_preferred_skill_label(
            normalized[existing_index],
            descriptor.normalized,
            descriptor.semantic_key,
        )

    return _prune_redundant_generic_skills(normalized)


def semantic_skill_signatures(values: Any) -> list[str]:
    return [
        describe_skill(skill).semantic_key
        for skill in normalize_skill_list_semantic(values)
        if describe_skill(skill).semantic_key
    ]


def _has_generic_member_match(
    left_descriptor: SkillDescriptor,
    right_descriptor: SkillDescriptor,
) -> bool:
    for generic_key, member_keys in GENERIC_MEMBER_SKILLS.items():
        if (
            left_descriptor.semantic_key == generic_key
            and right_descriptor.semantic_key in member_keys
        ):
            return True
        if (
            right_descriptor.semantic_key == generic_key
            and left_descriptor.semantic_key in member_keys
        ):
            return True

    return False


def keyword_overlap_score(left_tokens: Iterable[str], right_tokens: Iterable[str]) -> float:
    left = set(left_tokens)
    right = set(right_tokens)

    if not left or not right:
        return 0.0

    overlap = left & right
    if not overlap:
        return 0.0

    return len(overlap) / min(len(left), len(right))


def fuzzy_string_score(left: str, right: str) -> float:
    if not left or not right:
        return 0.0

    substring_score = 0.0

    if left in right or right in left:
        substring_score = min(len(left), len(right)) / max(len(left), len(right))

    return substring_score


def skill_similarity(left_skill: Any, right_skill: Any) -> float:
    left_descriptor = describe_skill(left_skill)
    right_descriptor = describe_skill(right_skill)

    if not left_descriptor.normalized or not right_descriptor.normalized:
        return 0.0

    if left_descriptor.normalized == right_descriptor.normalized:
        return 1.0

    if left_descriptor.semantic_key == right_descriptor.semantic_key:
        return 1.0

    if _has_generic_member_match(left_descriptor, right_descriptor):
        return 1.0

    normalized_score = fuzzy_string_score(
        left_descriptor.normalized,
        right_descriptor.normalized,
    )
    canonical_score = fuzzy_string_score(
        left_descriptor.semantic_key,
        right_descriptor.semantic_key,
    )
    overlap_score = keyword_overlap_score(
        left_descriptor.tokens,
        right_descriptor.tokens,
    )
    if overlap_score > 0 or normalized_score > 0 or canonical_score > 0:
        sequence_score = max(
            SequenceMatcher(
                None,
                left_descriptor.normalized,
                right_descriptor.normalized,
            ).ratio(),
            SequenceMatcher(
                None,
                left_descriptor.semantic_key,
                right_descriptor.semantic_key,
            ).ratio(),
        )
    else:
        sequence_score = 0.0

    return max(normalized_score, canonical_score, overlap_score, sequence_score)


def skills_match(
    user_skill: Any,
    required_skill: Any,
    *,
    threshold: float = DEFAULT_SKILL_MATCH_THRESHOLD,
) -> bool:
    return skill_similarity(user_skill, required_skill) >= threshold


def matches_any_skill(
    candidates: Any,
    required_skill: Any,
    *,
    threshold: float = DEFAULT_SKILL_MATCH_THRESHOLD,
) -> bool:
    return any(
        skills_match(candidate, required_skill, threshold=threshold)
        for candidate in parse_skills(candidates)
    )


def normalize_missing_skills(payload: Any) -> dict[str, list[str]]:
    normalized = {category: [] for category in CATEGORY_KEYS}

    if not isinstance(payload, dict):
        return normalized

    for category in CATEGORY_KEYS:
        normalized[category] = normalize_skill_list_semantic(payload.get(category))

    return normalized


def flatten_missing_skills(grouped_skills: Any) -> list[str]:
    normalized = normalize_missing_skills(grouped_skills)
    flattened: list[str] = []
    seen: set[str] = set()

    for category in CATEGORY_KEYS:
        for skill in normalized[category]:
            key = describe_skill(skill).semantic_key
            if key in seen:
                continue

            seen.add(key)
            flattened.append(skill)

    return flattened


def normalize_priority_groups(payload: Any) -> dict[str, list[str]]:
    normalized = {priority: [] for priority in PRIORITY_KEYS}

    if not isinstance(payload, dict):
        return normalized

    seen: set[str] = set()
    for priority in PRIORITY_KEYS:
        for value in parse_skills(payload.get(priority)):
            skill = normalize_skill(value)
            if not skill or skill in seen:
                continue

            seen.add(skill)
            normalized[priority].append(skill)

    return _prune_redundant_generic_priority_groups(normalized)


def normalize_priority_groups_semantic(payload: Any) -> dict[str, list[str]]:
    normalized = {priority: [] for priority in PRIORITY_KEYS}

    if not isinstance(payload, dict):
        return normalized

    semantic_locations: dict[str, tuple[str, int]] = {}

    for priority in PRIORITY_KEYS:
        for value in parse_skills(payload.get(priority)):
            descriptor = describe_skill(value)
            if not descriptor.normalized:
                continue

            existing_location = semantic_locations.get(descriptor.semantic_key)
            if existing_location is None:
                semantic_locations[descriptor.semantic_key] = (priority, len(normalized[priority]))
                normalized[priority].append(descriptor.normalized)
                continue

            existing_priority, existing_index = existing_location
            normalized[existing_priority][existing_index] = choose_preferred_skill_label(
                normalized[existing_priority][existing_index],
                descriptor.normalized,
                descriptor.semantic_key,
            )

    return _prune_redundant_generic_priority_groups(normalized)


def build_skill_signature(values: Any) -> tuple[str, ...]:
    return tuple(sorted(normalize_skill_key(skill) for skill in normalize_skill_list(values)))
