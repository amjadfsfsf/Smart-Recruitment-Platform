from __future__ import annotations

import re
from typing import Any

DEFAULT_DESIRED_JOB_TITLE = "Data Analyst"
JOB_TITLE_MAX_LENGTH = 50
DESCRIPTIVE_TITLE_MARKERS = (
    " i ",
    " my ",
    " aspiring ",
    " looking ",
    " interested ",
    " want ",
    " focused ",
    " with ",
    " background ",
    " foundation ",
    " experience ",
)

ROLE_PATTERNS: list[tuple[str, str]] = [
    ("machine learning engineer", "Machine Learning Engineer"),
    ("ml engineer", "Machine Learning Engineer"),
    ("data scientist", "Data Scientist"),
    ("data analyst", "Data Analyst"),
    ("data engineer", "Data Engineer"),
    ("business analyst", "Business Analyst"),
    ("product manager", "Product Manager"),
    ("project manager", "Project Manager"),
    ("software engineer", "Software Engineer"),
    ("software developer", "Software Engineer"),
    ("backend engineer", "Backend Engineer"),
    ("backend developer", "Backend Developer"),
    ("frontend engineer", "Frontend Engineer"),
    ("frontend developer", "Frontend Developer"),
    ("full stack engineer", "Full Stack Engineer"),
    ("full stack developer", "Full Stack Developer"),
    ("devops engineer", "DevOps Engineer"),
    ("qa engineer", "QA Engineer"),
    ("qa analyst", "QA Analyst"),
    ("cybersecurity analyst", "Cybersecurity Analyst"),
    ("security analyst", "Security Analyst"),
    ("mobile developer", "Mobile Developer"),
    ("mobile engineer", "Mobile Engineer"),
    ("ux designer", "UX Designer"),
    ("ui designer", "UI Designer"),
]


def clean_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def sanitize_job_title(value: Any, *, max_length: int = JOB_TITLE_MAX_LENGTH) -> str:
    cleaned = clean_text(value)
    if not cleaned:
        return ""

    concise = cleaned.split(".", 1)[0].split(",", 1)[0]
    concise = clean_text(concise)
    return concise[:max_length].strip()


def _looks_like_descriptive_text(value: str) -> bool:
    lowered = f" {value.lower()} "
    return len(value.split()) > 6 or any(marker in lowered for marker in DESCRIPTIVE_TITLE_MARKERS)


def infer_desired_job_title(source_text: Any, default: str = DEFAULT_DESIRED_JOB_TITLE) -> str:
    cleaned = clean_text(source_text)
    if not cleaned:
        return default

    lowered = cleaned.lower()
    for pattern, canonical_title in ROLE_PATTERNS:
        if pattern in lowered:
            return canonical_title

    explicit_match = re.search(
        r"(?:become|as|for|into|toward|towards|role as|position as|job title)\s+(?:an?\s+)?([a-z][a-z\s/&-]{2,80})",
        lowered,
    )
    if explicit_match:
        candidate = clean_text(explicit_match.group(1))
        if 1 <= len(candidate.split()) <= 6:
            return candidate.title()

    concise_candidate = re.split(r"[.!?\n,:;]", cleaned, maxsplit=1)[0].strip()
    if concise_candidate and len(concise_candidate) <= 80 and 1 <= len(concise_candidate.split()) <= 6:
        return concise_candidate.title()

    return default


def resolve_desired_job_title(
    desired_job_title: Any,
    target_role: Any = None,
    default: str = DEFAULT_DESIRED_JOB_TITLE,
) -> str:
    cleaned_title = sanitize_job_title(desired_job_title)
    if cleaned_title and not _looks_like_descriptive_text(cleaned_title):
        return cleaned_title

    inferred_from_title = sanitize_job_title(
        infer_desired_job_title(desired_job_title, default=""),
    )
    if inferred_from_title:
        return inferred_from_title

    if cleaned_title:
        return cleaned_title

    inferred_from_target_role = sanitize_job_title(
        infer_desired_job_title(target_role, default=""),
    )
    if inferred_from_target_role:
        return inferred_from_target_role

    return sanitize_job_title(default)
