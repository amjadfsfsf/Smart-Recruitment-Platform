"""
Heuristic extraction of likely skills from free text without a static catalog.
"""

from __future__ import annotations

import re
from typing import Iterable

from app.services.jobs.skill_source import normalize_skill_name

SECTION_PATTERN = re.compile(
    r"(requirements|qualifications|skills|tech stack|technologies|what you'll need|what you bring)\s*:?(.*)",
    re.IGNORECASE | re.DOTALL,
)
SPLIT_PATTERN = re.compile(r"[\n,;/|•]+")
NON_SKILL_PREFIXES = (
    "experience with ",
    "experience in ",
    "proficiency in ",
    "knowledge of ",
    "familiarity with ",
    "hands-on experience with ",
    "strong understanding of ",
    "understanding of ",
    "ability to ",
)
STOPWORDS = {
    "and",
    "or",
    "the",
    "with",
    "for",
    "using",
    "work",
    "team",
    "teams",
    "experience",
    "requirements",
    "qualifications",
    "responsibilities",
    "preferred",
    "required",
    "plus",
}


def _dedupe_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    for item in items:
        key = item.lower()
        if key in seen:
            continue

        seen.add(key)
        ordered.append(item)

    return ordered


def _select_candidate_text(text: str) -> str:
    match = SECTION_PATTERN.search(text)
    if match:
        return match.group(2)
    return text


def _strip_prefixes(value: str) -> str:
    cleaned = value
    lower = cleaned.lower()
    prefix_removed = True

    while prefix_removed:
        prefix_removed = False
        for prefix in NON_SKILL_PREFIXES:
            if lower.startswith(prefix):
                cleaned = cleaned[len(prefix) :].strip()
                lower = cleaned.lower()
                prefix_removed = True

    return cleaned


def _split_fragment(fragment: str) -> list[str]:
    cleaned = normalize_skill_name(fragment).strip(" -:.")
    cleaned = _strip_prefixes(cleaned)
    if not cleaned:
        return []

    if " and " in cleaned and cleaned.count(" and ") == 1 and len(cleaned.split()) <= 6:
        return [part.strip() for part in cleaned.split(" and ") if part.strip()]

    return [cleaned]


def _is_skill_candidate(value: str) -> bool:
    normalized = value.lower()
    words = normalized.split()

    if not words or len(words) > 4:
        return False

    if len(normalized) > 40 or not re.search(r"[a-z0-9]", normalized):
        return False

    if all(word in STOPWORDS for word in words):
        return False

    if normalized.startswith(("must ", "should ", "will ", "ability ", "strong ")):
        return False

    return True


def extract_skills(text: str) -> list[str]:
    """
    Extract likely skills from bullet lists and requirement-heavy prose.
    """
    if not text:
        return []

    candidate_text = _select_candidate_text(text)
    results: list[str] = []

    for fragment in SPLIT_PATTERN.split(candidate_text):
        for part in _split_fragment(fragment):
            normalized = normalize_skill_name(part).lower()
            if not _is_skill_candidate(normalized):
                continue
            results.append(normalized)

    return _dedupe_preserve_order(results)


__all__ = ["extract_skills"]
