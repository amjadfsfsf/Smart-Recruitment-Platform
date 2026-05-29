"""
Job service backed by multiple RapidAPI job sources.
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from math import ceil
from pathlib import Path
from typing import NotRequired, TypedDict

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

RAPIDAPI_KEY = os.getenv("7d702a87b8msh6f3e311d8c0954cp1e49b8jsn1ccdf7c51777", "ef4e507bcfmshf6995b35cb3a9c4p11b4c7jsn6a36938eeadc")

JSEARCH_URL = "https://jsearch.p.rapidapi.com/search"
JSEARCH_HOST = os.getenv("RAPIDAPI_HOST", "jsearch.p.rapidapi.com")
JSEARCH_COUNTRY = os.getenv("RAPIDAPI_COUNTRY", "us")

LINKEDIN_JOBS_BASE_URL = "https://linkedin-job-search-api.p.rapidapi.com"
LINKEDIN_JOBS_HOST = "linkedin-job-search-api.p.rapidapi.com"
LINKEDIN_JOBS_ENDPOINT = os.getenv("LINKEDIN_JOBS_ENDPOINT", "/active-jb-24h")

QUERY_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9+#.]+")


class JobResult(TypedDict):
    external_job_id: str
    title: str
    company: str
    location: str
    url: str
    description: str
    posted_at: str
    publisher: NotRequired[str]
    source: NotRequired[str]


def _headers(host: str) -> dict[str, str]:
    return {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": host,
    }


def _condense_query_text(text: str, max_tokens: int = 512) -> str:
    tokens = QUERY_TOKEN_PATTERN.findall(text or "")
    return " ".join(tokens[:max_tokens]).strip()


def _build_query(role: str, skills: list[str] | None = None, field_of_study: str | None = None) -> str:
    parts = [_condense_query_text(role)]
    if field_of_study and field_of_study.strip():
        parts.append(_condense_query_text(field_of_study, max_tokens=512))
    parts.extend(skill.strip() for skill in (skills or [])[:4] if skill and skill.strip())
    query = " ".join(parts).strip()
    return query 


def _tokenize_text(text: str) -> set[str]:
    return {token.lower() for token in QUERY_TOKEN_PATTERN.findall(text or "") if len(token) > 1}


def _format_jsearch_location(item: dict) -> str:
    parts = [
        item.get("job_city"),
        item.get("job_state"),
        item.get("job_country"),
    ]
    location = ", ".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
    return location


def _format_linkedin_location(item: dict) -> str:
    if item.get("remote_derived"):
        return "Remote"

    for key in ("locations_derived", "cities_derived", "countries_derived"):
        values = item.get(key)
        if isinstance(values, list):
            cleaned = [str(value).strip() for value in values if str(value).strip()]
            if cleaned:
                return ", ".join(cleaned)

    return "Remote / Not specified"


def _normalize_jsearch_job(item: dict) -> JobResult:
    posted_at = item.get("job_posted_at_datetime_utc")
    if not isinstance(posted_at, str) or not posted_at.strip():
        posted_at = datetime.utcnow().isoformat() + "Z"

    return {
        "external_job_id": str(item.get("job_id") or ""),
        "title": (item.get("job_title") or "Unknown title").strip(),
        "company": (item.get("employer_name") or "Unknown company").strip(),
        "location": _format_jsearch_location(item),
        "url": (
            item.get("job_apply_link")
            or item.get("job_google_link")
            or item.get("employer_website")
            or "#"
        ),
        "description": (item.get("job_description") or "").strip(),
        "posted_at": posted_at,
        "publisher": (item.get("job_publisher") or "").strip(),
        "source": "jsearch",
    }


def _normalize_linkedin_job(item: dict) -> JobResult:
    posted_at = item.get("date_posted") or item.get("date_created")
    if not isinstance(posted_at, str) or not posted_at.strip():
        posted_at = datetime.utcnow().isoformat() + "Z"

    return {
        "external_job_id": str(item.get("id") or item.get("linkedin_id") or ""),
        "title": (item.get("title") or "Unknown title").strip(),
        "company": (item.get("organization") or "Unknown company").strip(),
        "location": _format_linkedin_location(item),
        "url": (
            item.get("url")
            or item.get("external_apply_url")
            or item.get("organization_url")
            or "#"
        ),
        "description": (
            item.get("description_text")
            or item.get("linkedin_org_description")
            or ""
        ).strip(),
        "posted_at": posted_at,
        "publisher": (item.get("source") or "LinkedIn").strip(),
        "source": "linkedin-job-search-api",
    }


def _fetch_jsearch_jobs(query: str, max_results: int) -> list[JobResult]:
    num_pages = max(1, min(10, ceil(max_results / 10)))
    params = {
        "query": query,
        "page": "1",
        "num_pages": str(num_pages),
        "country": JSEARCH_COUNTRY,
        "date_posted": "all",
    }

    try:
        response = httpx.get(
            JSEARCH_URL,
            headers=_headers(JSEARCH_HOST),
            params=params,
            timeout=30.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Failed to fetch JSearch jobs: {exc}") from exc

    payload = response.json()
    raw_jobs = payload.get("data", [])
    if not isinstance(raw_jobs, list):
        raise RuntimeError("Unexpected response format from JSearch.")

    jobs = [_normalize_jsearch_job(item) for item in raw_jobs[: max(1, max_results)]]
    return [job for job in jobs if job["external_job_id"] or job["title"] != "Unknown title"]


def _fetch_linkedin_jobs(max_results: int) -> list[JobResult]:
    endpoint = LINKEDIN_JOBS_ENDPOINT.strip() or "/active-jb-24h"
    if not endpoint.startswith("/"):
        endpoint = f"/{endpoint}"

    params = {
        "limit": min(max(1, max_results), 100),
        "offset": 0,
        "description_type": "text",
    }

    try:
        response = httpx.get(
            f"{LINKEDIN_JOBS_BASE_URL}{endpoint}",
            headers=_headers(LINKEDIN_JOBS_HOST),
            params=params,
            timeout=30.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Failed to fetch LinkedIn RapidAPI jobs: {exc}") from exc

    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected response format from LinkedIn Job Search API.")

    jobs = [_normalize_linkedin_job(item) for item in payload[: max(1, max_results)]]
    return [job for job in jobs if job["external_job_id"] or job["title"] != "Unknown title"]


def _rank_linkedin_jobs(
    jobs: list[JobResult],
    role: str,
    skills: list[str] | None,
    field_of_study: str | None,
    limit: int,
) -> list[JobResult]:
    query_text = _build_query(role, skills, field_of_study)
    query_tokens = _tokenize_text(query_text)

    if not query_tokens:
        return jobs[:limit]

    ranked: list[tuple[float, JobResult]] = []
    for job in jobs:
        title = job.get("title", "")
        description = job.get("description", "")
        location = job.get("location", "")

        title_tokens = _tokenize_text(title)
        body_tokens = _tokenize_text(f"{title} {description} {location}")

        title_overlap = len(query_tokens & title_tokens)
        body_overlap = len(query_tokens & body_tokens)

        phrase_bonus = 0.0
        lowered_query = query_text.lower()
        lowered_title = title.lower()
        lowered_description = description.lower()
        if lowered_query and lowered_query in lowered_title:
            phrase_bonus += 4.0
        elif lowered_query and lowered_query in lowered_description:
            phrase_bonus += 2.0

        lexical_score = (title_overlap * 3.0) + body_overlap + phrase_bonus
        ranked.append((lexical_score, job))

    ranked.sort(key=lambda item: item[0], reverse=True)

    filtered = [job for score, job in ranked if score > 0]
    if filtered:
        return filtered[:limit]

    return [job for _, job in ranked[:limit]]


def _search_jsearch_jobs(
    role: str,
    skills: list[str] | None,
    field_of_study: str | None,
    max_results: int,
) -> list[JobResult]:
    normalized_role = role.strip()
    queries = [
        _build_query(normalized_role, skills, field_of_study),
        normalized_role,
        f"{normalized_role} jobs" if normalized_role else "",
    ]

    jobs: list[JobResult] = []
    seen_keys: set[str] = set()

    for query in queries:
        cleaned_query = query.strip()
        if not cleaned_query:
            continue

        for job in _fetch_jsearch_jobs(cleaned_query, max_results=max_results):
            key = job["external_job_id"] or f'{job["title"]}|{job["company"]}|{job["url"]}'
            if key in seen_keys:
                continue

            seen_keys.add(key)
            jobs.append(job)

            if len(jobs) >= max(1, max_results):
                return jobs[:max_results]

    if not jobs and normalized_role.lower() != "software engineer":
        return _search_jsearch_jobs(
            "software engineer",
            skills=skills,
            field_of_study=field_of_study,
            max_results=max_results,
        )

    return jobs[: max(1, max_results)]


def _append_unique_jobs(target: list[JobResult], seen_keys: set[str], incoming: list[JobResult], limit: int) -> None:
    for job in incoming:
        key = job["external_job_id"] or f'{job["title"]}|{job["company"]}|{job["url"]}'
        if key in seen_keys:
            continue

        seen_keys.add(key)
        target.append(job)

        if len(target) >= limit:
            return


def search_jobs(
    role: str,
    skills: list[str] | None = None,
    field_of_study: str | None = None,
    max_results: int = 100,
) -> list[JobResult]:
    if not RAPIDAPI_KEY:
        raise ValueError("RapidAPI key is missing. Set RAPIDAPI_KEY before searching jobs.")

    total_limit = max(1, max_results)
    jsearch_target = max(1, total_limit // 2)
    linkedin_target = max(0, total_limit - jsearch_target)

    jobs: list[JobResult] = []
    seen_keys: set[str] = set()
    errors: list[str] = []

    try:
        _append_unique_jobs(
            jobs,
            seen_keys,
            _search_jsearch_jobs(role, skills, field_of_study, max_results=jsearch_target),
            total_limit,
        )
    except Exception as exc:
        errors.append(str(exc))

    if len(jobs) < total_limit and linkedin_target:
        try:
            _append_unique_jobs(
                jobs,
                seen_keys,
                _rank_linkedin_jobs(
                    _fetch_linkedin_jobs(max_results=max(total_limit, linkedin_target)),
                    role=role,
                    skills=skills,
                    field_of_study=field_of_study,
                    limit=linkedin_target,
                ),
                total_limit,
            )
        except Exception as exc:
            errors.append(str(exc))

    if len(jobs) < total_limit:
        remaining = total_limit - len(jobs)

        try:
                _append_unique_jobs(
                    jobs,
                    seen_keys,
                    _search_jsearch_jobs(role, skills, field_of_study, max_results=total_limit),
                    total_limit,
                )
        except Exception as exc:
            errors.append(str(exc))

        if len(jobs) < total_limit and remaining:
            try:
                _append_unique_jobs(
                    jobs,
                    seen_keys,
                    _rank_linkedin_jobs(
                        _fetch_linkedin_jobs(max_results=total_limit),
                        role=role,
                        skills=skills,
                        field_of_study=field_of_study,
                        limit=remaining,
                    ),
                    total_limit,
                )
            except Exception as exc:
                errors.append(str(exc))

    if not jobs and errors:
        raise RuntimeError(" | ".join(dict.fromkeys(errors)))

    return jobs[:total_limit]
