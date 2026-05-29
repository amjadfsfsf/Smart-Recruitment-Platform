"""
Unified job fetching layer that talks to multiple providers (JSearch, Jooble, Adzuna)
and normalizes everything into a single shape. Credentials stay hard-coded as
requested (no environment variables).
"""

from __future__ import annotations

from typing import List, Tuple
from collections import Counter

DEBUG = True

import httpx

# -----------------------------
# RapidAPI configuration (hard-coded)
# -----------------------------
RAPIDAPI_KEY = "0318d24596mshe06d9de54c94314p1e33d3jsnbd716db3640d"
RAPIDAPI_HOST = "jsearch.p.rapidapi.com"
BASE_URL = "https://jsearch.p.rapidapi.com/search"
DETAILS_URL = "https://jsearch.p.rapidapi.com/job-details"

# Jooble configuration (hard-coded)
JOOBLE_API_KEY = "51a74f2d-0309-4437-be56-47672d3c742d"
JOOBLE_BASE_URL = "https://jooble.org/api"

# Adzuna configuration (hard-coded)
ADZUNA_APP_ID = "5b272637"
ADZUNA_APP_KEY = "6b19e48e6416c75f015750b722d1fa04"
ADZUNA_COUNTRY = "us"
ADZUNA_BASE_URL = f"https://api.adzuna.com/v1/api/jobs/{ADZUNA_COUNTRY}/search/1"


class JobFetchError(RuntimeError):
    """Raised when the upstream job search API fails."""


def _log_first_job(raw_jobs: list[dict]) -> None:
    """
    Emit the first raw job object and its description-related fields for debugging.
    """
    if not raw_jobs:
        print("[jobs-api] search returned no jobs")
        return

    first = raw_jobs[0]
    try:
        import json

        print("[jobs-api] first_raw_job=", json.dumps(first, indent=2))
        desc_fields = {k: first.get(k) for k in ("description", "job_description", "summary", "snippet")}
        print("[jobs-api] first_raw_job_description_fields=", desc_fields)
    except Exception as exc:  # pragma: no cover - logging should never break the flow
        print(f"[jobs-api] failed to log first raw job: {exc}")


def _fetch_job_details(job_id: str, headers: dict) -> dict:
    """
    Fetch a single job's details (full description) when the search payload is missing it.
    """
    if not job_id:
        return {}

    try:
        response = httpx.get(DETAILS_URL, params={"job_id": job_id}, headers=headers, timeout=20.0)
        response.raise_for_status()
        payload = response.json()
        details = payload.get("data")
        if isinstance(details, list) and details:
            return details[0] or {}
    except httpx.HTTPError as exc:  # pragma: no cover - network failure
        print(f"[jobs-api] job-details fetch failed job_id={job_id}: {exc}")
    except Exception as exc:  # pragma: no cover - defensiveness
        print(f"[jobs-api] unexpected error in job-details fetch job_id={job_id}: {exc}")

    return {}


def _pick_description(source: dict | None, details: dict | None = None) -> str:
    """
    Apply the fallback priority:
    description ?? job_description ?? summary ?? snippet ?? details.description ?? "".
    """
    def _extract(obj: dict | None, key: str) -> str:
        if not isinstance(obj, dict):
            return ""
        value = obj.get(key)
        return value.strip() if isinstance(value, str) else ""

    candidates = [
        _extract(source, "description"),
        _extract(source, "job_description"),
        _extract(source, "summary"),
        _extract(source, "snippet"),
    ]

    detail_value = ""
    if isinstance(details, dict):
        detail_value = (
            _extract(details, "description")
            or _extract(details, "job_description")
            or _extract(details.get("details") if isinstance(details.get("details"), dict) else {}, "description")
        )
    candidates.append(detail_value)

    for value in candidates:
        if value:
            return value
    return ""


def _normalize_job(item: dict, details: dict | None = None) -> dict:
    """
    Map the raw JSearch record to the normalized shape required by the app.
    """
    if not isinstance(item, dict):
        return {}

    location_parts = [
        part
        for part in [
            item.get("job_city"),
            item.get("job_state"),
            item.get("job_country"),
        ]
        if isinstance(part, str) and part.strip()
    ]
    location = ", ".join(location_parts) if location_parts else item.get("job_is_remote", "any")

    description = _pick_description(item, details=details)
    if not description:
        description = "No description available"

    apply_url = (
        item.get("job_apply_link")
        or item.get("job_google_link")
        or item.get("employer_website")
        or ""
    )

    return {
        "job_id": str(item.get("job_id") or item.get("id") or ""),
        "title": (item.get("job_title") or "Unknown title").strip(),
        "company": (item.get("employer_name") or "Unknown company").strip(),
        "location": location or "any",
        "description": description,
        "apply_url": apply_url,
        "apply_link": apply_url,  # alias for frontend consumers expecting apply_link
        "source": "jsearch",
    }


def fetch_jobs_jsearch(query: str, location: str = "any", page: int = 1) -> List[dict]:
    """
    Fetch jobs from the RapidAPI JSearch endpoint and return normalized results.
    """
    try:
        page_number = int(page)
    except (TypeError, ValueError):
        page_number = 1

    page_number = max(1, page_number)

    if DEBUG:
        print(f"[jsearch] fetching page={page_number} query='{query}' location='{location}'")

    params = {
        "query": query,
        "location": location,
        "page": page_number,
    }
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

    try:
        response = httpx.get(BASE_URL, params=params, headers=headers, timeout=20.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - network failure
        raise JobFetchError(f"RapidAPI JSearch request failed: {exc}") from exc

    payload = response.json()
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise JobFetchError("Unexpected response format from RapidAPI JSearch.")

    if DEBUG:
        print(f"[jsearch] received {len(data) if isinstance(data, list) else 0} jobs for page={page_number}")

    _log_first_job(data)

    normalized: list[dict] = []
    details_cache: dict[str, dict] = {}

    for item in data:
        normalized_job = _normalize_job(item)

        if not normalized_job.get("description") or normalized_job.get("description") == "No description available":
            job_id = normalized_job.get("job_id") or item.get("job_id") or ""
            details = details_cache.get(job_id)
            if details is None:
                details = _fetch_job_details(job_id, headers)
                details_cache[job_id] = details

            normalized_job = _normalize_job(item, details=details)

        normalized.append(normalized_job)

    filtered = [job for job in normalized if job.get("job_id") or job.get("title")]
  
    return filtered


def _normalize_jooble_job(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    description = (item.get("snippet") or item.get("description") or "").strip()

    normalized = {
        "job_id": str(item.get("id") or item.get("jobid") or item.get("guid") or ""),
        "title": (item.get("title") or "Unknown title").strip(),
        "company": (item.get("company") or item.get("companyName") or "Unknown company").strip(),
        "location": (item.get("location") or item.get("region") or "any").strip(),
        "description": description or "No description available",
        "apply_url": item.get("link") or item.get("applyUrl") or "",
        "source": "jooble",
    }
    normalized["apply_link"] = normalized["apply_url"]
    return normalized


def fetch_jobs_jooble(query: str, location: str = "any") -> List[dict]:
    """
    Fetch jobs from Jooble's API.
    Docs: https://jooble.org/api/about
    """
    url = f"{JOOBLE_BASE_URL}/{JOOBLE_API_KEY}"
    payload = {"keywords": query, "location": location}

    try:
        response = httpx.post(url, json=payload, timeout=20.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - network failure
        raise JobFetchError(f"Jooble request failed: {exc}") from exc

    data = response.json()
    jobs = data.get("jobs") if isinstance(data, dict) else None
    if not isinstance(jobs, list):
        raise JobFetchError("Unexpected response format from Jooble API.")



    normalized = [_normalize_jooble_job(item) for item in jobs]
    filtered = [job for job in normalized if job.get("job_id") or job.get("title")]
    if DEBUG:
        print(f"[jooble] normalized count={len(filtered)}")
        if filtered:
            print(f"[jooble] sample job: {filtered[0]}")
        print(f"[jobs] jooble returned {len(filtered)} jobs")
    return filtered


def _normalize_adzuna_job(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    company = item.get("company") or {}
    location_obj = item.get("location") or {}

    description = (item.get("description") or "").strip()
    salary_min = item.get("salary_min")
    salary_max = item.get("salary_max")
    contract_time = item.get("contract_time")

    normalized: dict = {
        "job_id": str(item.get("id") or item.get("adref") or ""),
        "title": (item.get("title") or "Unknown title").strip(),
        "company": (company.get("display_name") if isinstance(company, dict) else company or "Unknown company").strip(),
        "location": (location_obj.get("display_name") if isinstance(location_obj, dict) else location_obj or "any"),
        "description": description or "No description available",
        "apply_url": item.get("redirect_url") or item.get("apply_url") or "",
        "source": "adzuna",
    }
    normalized["apply_link"] = normalized["apply_url"]

    if salary_min or salary_max:
        normalized["salary_range"] = {
            "min": salary_min,
            "max": salary_max,
        }

    if contract_time:
        normalized["contract_type"] = contract_time

    return normalized


def fetch_jobs_adzuna(query: str, location: str = "any") -> List[dict]:
    """
    Fetch jobs from Adzuna's public API using app_id/app_key credentials.
    """
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_APP_KEY,
        "what": query,
        "where": location,
        "results_per_page": 20,
        "content-type": "application/json",
    }

    try:
        response = httpx.get(ADZUNA_BASE_URL, params=params, timeout=20.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - network failure
        raise JobFetchError(f"Adzuna request failed: {exc}") from exc

    data = response.json()
    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        raise JobFetchError("Unexpected response format from Adzuna API.")

    if DEBUG:
        if not results:
            print("[adzuna] WARNING: API returned 0 results")

    normalized = [_normalize_adzuna_job(item) for item in results]
    filtered = [job for job in normalized if job.get("job_id") or job.get("title")]
 
    return filtered


def _dedup_key(job: dict) -> Tuple[str, str, str]:
    apply_url = (job.get("apply_url") or job.get("apply_link") or "").strip().lower()
    if apply_url:
        return (apply_url, "", "")

    title = (job.get("title") or "").strip().lower()
    company = (job.get("company") or "").strip().lower()
    location = (job.get("location") or "").strip().lower()
    # Using location here avoids collapsing similarly named jobs across regions when apply_url is missing.
    if title or company or location:
        return (title, company, location)

    # Last resort: keep unique by job_id to avoid accidental merges.
    return (str(job.get("job_id") or ""), "", "")


def _pick_richer_job(existing: dict, incoming: dict) -> dict:
    """
    Keep the job with more detail (longer description / has apply_url). Merge sources.
    """
    if not existing:
        return incoming

    desc_existing = len(existing.get("description") or "")
    desc_incoming = len(incoming.get("description") or "")
    has_apply_existing = bool(existing.get("apply_url"))
    has_apply_incoming = bool(incoming.get("apply_url"))

    keep_incoming = False
    if has_apply_incoming and not has_apply_existing:
        keep_incoming = True
    elif desc_incoming > desc_existing:
        keep_incoming = True

    winner = incoming if keep_incoming else existing

    sources = set()
    for job in (existing, incoming):
        if isinstance(job, dict):
            src = job.get("source")
            if src:
                sources.add(src)
            for extra in job.get("sources", []) if isinstance(job.get("sources"), list) else []:
                sources.add(extra)

    if sources:
        winner["sources"] = sorted(sources)
        # keep primary source stable but ensure it is in the list
        if not winner.get("source") and winner["sources"]:
            winner["source"] = winner["sources"][0]

    return winner


def _deduplicate_jobs(jobs: list[dict]) -> list[dict]:
    unique: dict[Tuple[str, str, str], dict] = {}
    for job in jobs:
        key = _dedup_key(job)
        if key in unique:
            unique[key] = _pick_richer_job(unique[key], job)
        else:
            unique[key] = job
    return list(unique.values())


def fetch_all_jobs(query: str, location: str = "any", page: int = 1) -> list[dict]:
    """
    Aggregate jobs from JSearch, Jooble, and Adzuna. Continues on provider failure.
    """
    jsearch_jobs: list[dict] = []
    jooble_jobs: list[dict] = []
    adzuna_jobs: list[dict] = []

    try:
        jsearch_jobs = fetch_jobs_jsearch(query, location=location, page=page)
    except Exception as exc:  # pragma: no cover - defensive logging only
        if DEBUG:
            print(f"[jobs] jsearch failed: {exc}")

    try:
        jooble_jobs = fetch_jobs_jooble(query, location=location)
    except Exception as exc:  # pragma: no cover - defensive logging only
        if DEBUG:
            print(f"[jobs] jooble failed: {exc}")

    try:
        adzuna_jobs = fetch_jobs_adzuna(query, location=location)
    except Exception as exc:  # pragma: no cover - defensive logging only
        if DEBUG:
            print(f"[jobs] adzuna failed: {exc}")


    merged: list[dict] = jsearch_jobs + jooble_jobs + adzuna_jobs



    deduped = _deduplicate_jobs(merged)
    # Ensure every job carries sources + primary source
    for job in deduped:
        if isinstance(job.get("sources"), list) and job["sources"]:
            pass
        elif job.get("source"):
            job["sources"] = [job["source"]]
        else:
            job["sources"] = ["unknown"]
            job["source"] = "unknown"

        if not job.get("source"):
            job["source"] = job["sources"][0] if job["sources"] else "unknown"

    counts: Counter[str] = Counter()
    for job in deduped:
        for src in job.get("sources", []):
            counts[src] += 1


    return deduped


def get_fallback_jobs(query: str, count: int = 5) -> List[dict]:
    """
    Return a minimal, deterministic fallback list so the caller never gets an empty response.
    """
    base = [
        {
            "job_id": "fallback_1",
            "title": "Backend Developer",
            "company": "Demo Company",
            "location": "Remote",
            "description": "Sample backend role for testing.",
            "apply_url": "#",
            "apply_link": "#",
            "skills": ["python", "api"],
            "source": "fallback",
        },
        {
            "job_id": "fallback_2",
            "title": "Fullstack Engineer",
            "company": "Example Corp",
            "location": "Remote",
            "description": "Sample fullstack role for testing.",
            "apply_url": "#",
            "apply_link": "#",
            "skills": ["javascript", "react"],
            "source": "fallback",
        },
        {
            "job_id": "fallback_3",
            "title": "Data Engineer",
            "company": "Sample Inc",
            "location": "Remote",
            "description": "Sample data role for testing.",
            "apply_url": "#",
            "apply_link": "#",
            "skills": ["sql", "python"],
            "source": "fallback",
        },
        {
            "job_id": "fallback_4",
            "title": "Machine Learning Engineer",
            "company": "AI Labs",
            "location": "Remote",
            "description": "Sample ML role for testing.",
            "apply_url": "#",
            "apply_link": "#",
            "skills": ["pytorch", "ml"],
            "source": "fallback",
        },
        {
            "job_id": "fallback_5",
            "title": "DevOps Engineer",
            "company": "CloudOps",
            "location": "Remote",
            "description": "Sample DevOps role for testing.",
            "apply_url": "#",
            "apply_link": "#",
            "skills": ["docker", "kubernetes"],
            "source": "fallback",
        },
    ]

    # Keep deterministic order but allow trimming/extension.
    if count <= len(base):
        return base[:count]

    extra = []
    for idx in range(len(base) + 1, count + 1):
        extra.append(
            {
                "job_id": f"fallback_{idx}",
                "title": f"{query or 'General'} Role",
                "company": "Demo Company",
                "location": "Remote",
                "description": "Generated fallback role.",
                "apply_url": "#",
                "apply_link": "#",
                "skills": ["general"],
                "source": "fallback",
            }
        )
    return base + extra


# Backwards-compatible alias for existing call sites
fetch_jobs = fetch_jobs_jsearch

__all__ = [
    "fetch_jobs_jsearch",
    "fetch_jobs_jooble",
    "fetch_jobs_adzuna",
    "fetch_all_jobs",
    "fetch_jobs",
    "JobFetchError",
    "get_fallback_jobs",
]
