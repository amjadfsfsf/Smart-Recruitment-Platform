"""
Job skill analysis service.

For a given job (title + description) and user, calls OpenAI GPT to determine
the required skills and which ones the user is missing.  Results are cached
in-memory so repeated requests for the same (job, user) pair skip the API.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import AsyncOpenAI
from sqlalchemy.orm import Session, selectinload

from app.data.models import User, UserSkill

ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(ENV_PATH)

logger = logging.getLogger(__name__)

GPT_MODEL = "gpt-4.1"
GPT_TIMEOUT_SECONDS = float(os.getenv("GPT_TIMEOUT_SECONDS", "20"))
GPT_MAX_RETRIES = max(1, int(os.getenv("OPENAI_SKILL_GAP_MAX_RETRIES", "3")))
MAX_DESCRIPTION_LENGTH = 3000

# ---------------------------------------------------------------------------
# In-memory cache: key = hash(user_id + job_title + truncated description)
# ---------------------------------------------------------------------------
_analysis_cache: dict[str, dict[str, Any]] = {}


@lru_cache(maxsize=1)
def _get_openai_client() -> AsyncOpenAI:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set.")
    return AsyncOpenAI(api_key=api_key, timeout=GPT_TIMEOUT_SECONDS)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_skill(skill: str) -> str:
    """Lowercase and strip a skill name."""
    return skill.strip().lower()


def _truncate_description(text: str) -> str:
    """Limit job description to MAX_DESCRIPTION_LENGTH characters."""
    if not text:
        return ""
    return text[:MAX_DESCRIPTION_LENGTH]


def _cache_key(user_id: int, job_title: str, job_description: str) -> str:
    """Deterministic cache key for a (user, job) pair."""
    raw = f"{user_id}|{_normalize_skill(job_title)}|{_normalize_skill(_truncate_description(job_description))}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _fetch_user_skills(db: Session, user_id: int) -> list[str]:
    """Fetch the user's skill names from the database, normalized."""
    user = (
        db.query(User)
        .options(selectinload(User.skills))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise ValueError(f"User {user_id} not found.")
    return [_normalize_skill(s.skill_name) for s in user.skills if s.skill_name]


# ---------------------------------------------------------------------------
# GPT interaction
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """
You are a senior technical recruiter.

Your goal is to extract ONLY the most important and core skills required for the job.

Given:
- job_title
- job_description
- user_skills

Return ONLY JSON:
{
  "required_skills": [],
  "missing_skills": []
}

STRICT RULES:

1. required_skills:
- Include ONLY the most critical skills (top 5–8 max).
- Focus on MUST-HAVE skills, not nice-to-have.
- Prefer technical skills (languages, frameworks, tools).
- Do not include role titles (e.g., "full stack", "devops") as skills.
- Prefer concrete tools, libraries, or technologies.
- Avoid abstract or broad terms (e.g., "apis", "deployment pipelines").
- Prefer specific technologies (e.g., "rest api", "docker", "ci/cd").
- If a skill is broad, convert it to a more concrete equivalent.
- Each skill must be directly mentioned or clearly required in the job description.
- Avoid generic skills like:
  teamwork, communication, documentation, problem solving
- Avoid duplicate or overlapping skills.
- Each skill max 2 words.
- Lowercase only.
- Avoid vague terms like "cloud"; prefer specific platforms if mentioned.
- Do not infer unrelated technologies not clearly tied to the role.
- If job_skills is provided and not empty:
  → Treat it as the PRIMARY source of truth.
  → Use it first before job_description.
  → Only use job_description to refine or complete missing important skills.

2. missing_skills:
- Must be computed ONLY from required_skills.
- Do NOT invent new skills.

3. Prioritization:
- If job mentions many skills → pick the MOST REPEATED or MOST IMPORTANT ones.
- If unclear → prefer common industry core stack.

4. Sort alphabetically.

Return only JSON. No text.
"""

 
def _build_user_prompt(
    job_title: str,
    job_description: str,
    user_skills: list[str],
    job_skills: list[str] = None
) -> str:
    return f"""
You must strictly follow the rules.

Analyze the job and extract ONLY the most important core technical skills.

Job Title:
{job_title}

Job Description:
{_truncate_description(job_description)}

Job Skills (if available):
{job_skills if job_skills else "None"}

User Skills:
{user_skills}

Instructions:

- If job_skills is provided and not empty:
  → Use it as the PRIMARY source of required_skills.
  → Clean and normalize it.
  → Only add missing critical skills from the description if necessary.

- If job_skills is empty:
  → Extract skills from job_description.

General Rules:
- Extract ONLY 5 to 7 core technical skills.
- Only include skills explicitly mentioned or clearly required.
- Do NOT infer or guess additional skills.
- Do NOT include role titles (e.g., full stack, devops).
- Do NOT include vague terms (e.g., cloud, software).
- Prefer specific tools, programming languages, or frameworks.
- Each skill must be concise (1–2 words).
- Avoid duplicates.

Return ONLY JSON. No text.
"""


def _validate_gpt_response(parsed: dict) -> dict[str, list[str]]:
    """Ensure the GPT response has the expected shape and normalize skills."""
    required = parsed.get("required_skills", [])
    missing = parsed.get("missing_skills", [])

    if not isinstance(required, list):
        required = []
    if not isinstance(missing, list):
        missing = []

    required_normalized = sorted(set(_normalize_skill(s) for s in required if isinstance(s, str) and s.strip()))
    missing_normalized = sorted(set(_normalize_skill(s) for s in missing if isinstance(s, str) and s.strip()))

    # Ensure missing is a subset of required
    required_set = set(required_normalized)
    missing_normalized = [s for s in missing_normalized if s in required_set]

    return {
        "required_skills": required_normalized,
        "missing_skills": missing_normalized,
    }

async def _call_gpt(
    job_title: str,
    job_description: str,
    user_skills: list[str],
    job_skills: list[str] = None
) -> dict[str, list[str]]:
    client = _get_openai_client()
    last_error: Exception | None = None

    # 🔥 normalize job_skills
    job_skills = [s.lower().strip() for s in job_skills] if job_skills else None

    for attempt in range(1, GPT_MAX_RETRIES + 1):
        try:
            response = await client.chat.completions.create(
                model=GPT_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": _build_user_prompt(
                            job_title,
                            job_description,
                            user_skills,
                            job_skills
                        ),
                    },
                ],
                temperature=0,
                response_format={"type": "json_object"},
            )

            raw = response.choices[0].message.content or "{}"
            parsed = json.loads(raw)

            return _validate_gpt_response(parsed if isinstance(parsed, dict) else {})

        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            last_error = exc
            logger.warning(
                "Invalid job-analysis GPT response (attempt %s/%s): %s",
                attempt,
                GPT_MAX_RETRIES,
                exc,
            )

    raise RuntimeError("Failed to obtain a valid job-analysis GPT response.") from last_error


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def analyze_job(
    db: Session,
    user_id: int,
    job_title: str,
    job_description: str,
    job_skills: list[str] | None = None,
) -> dict[str, Any]:
    """
    Analyse a single job against the user's skills.

    Returns:
        {
            "job_title": str,
            "required_skills": [str, ...],
            "missing_skills": [str, ...],
            "cached": bool,
        }
    """
    key = _cache_key(user_id, job_title, job_description)

    # Return cached result if available
    if key in _analysis_cache:
        return {**_analysis_cache[key], "cached": True}

    user_skills = _fetch_user_skills(db, user_id)
    result = await _call_gpt(job_title, job_description, user_skills, job_skills)

    entry: dict[str, Any] = {
        "job_title": job_title,
        "required_skills": result["required_skills"],
        "missing_skills": result["missing_skills"],
    }

    _analysis_cache[key] = entry
    return {**entry, "cached": False}
