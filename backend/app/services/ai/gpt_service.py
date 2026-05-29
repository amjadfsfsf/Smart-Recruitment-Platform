"""
OpenAI-backed GPT analysis for role benchmark skill inference.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI

from app.services.skill_gap.skill_gap_utils import (
    clean_text,
    normalize_missing_skills,
    normalize_priority_groups,
)

ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(ENV_PATH)

logger = logging.getLogger(__name__)

GPT_MODEL = 'gpt-4.1'
GPT_TIMEOUT_SECONDS = float(os.getenv("GPT_TIMEOUT_SECONDS", "20"))
GPT_MAX_RETRIES = max(1, int(os.getenv("OPENAI_SKILL_GAP_MAX_RETRIES", "3")))


@dataclass(slots=True)
class SkillGapGptContext:
    education: str
    field_of_study: str
    current_skills: list[str]
    desired_job_title: str
    target_role: str
    experience_level: str = ""
    previous_skills: list[str] = field(default_factory=list)
    added_skills: list[str] = field(default_factory=list)
    removed_skills: list[str] = field(default_factory=list)


@dataclass(slots=True)
class SkillGapGptResult:
    role_required_skills: dict[str, list[str]]
    skill_priority: dict[str, list[str]]
    analysis_summary: str


@lru_cache(maxsize=1)
def _get_openai_client() -> AsyncOpenAI:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set.")
    return AsyncOpenAI(api_key=api_key, timeout=GPT_TIMEOUT_SECONDS)


def _build_prompt(context: SkillGapGptContext) -> str:
    payload = {
        "education": clean_text(context.education),
        "field_of_study": clean_text(context.field_of_study),
        "desired_job_title": clean_text(context.desired_job_title),
        "target_role": clean_text(context.target_role),
        "experience_level": clean_text(context.experience_level),
    }

    return f"""
You must generate a STRICT benchmark skill set.

IMPORTANT:
- Follow ALL rules from system prompt EXACTLY
- Especially priority distribution (CRITICAL)

Focus on:
- Core responsibilities from desired_job_title
- Skills mentioned in target_role
- Industry expectations for this level

STRICT REQUIREMENTS:
- High priority MUST contain at least 4 skills
- Do NOT return only 2 high skill
- Maintain balanced distribution

Context:
{json.dumps(payload, ensure_ascii=False, indent=2)}
"""


def _normalize_result(payload: dict) -> SkillGapGptResult:
    if not isinstance(payload, dict):
        raise ValueError("GPT response payload must be a JSON object.")

    role_required_skills = payload.get("role_required_skills")
    if not isinstance(role_required_skills, dict):
        # Backward-compatible fallback in case the model returns the legacy field.
        role_required_skills = payload.get("missing_skills")

    return SkillGapGptResult(
        role_required_skills=normalize_missing_skills(role_required_skills),
        skill_priority=normalize_priority_groups(payload.get("skill_priority")),
        analysis_summary=clean_text(payload.get("analysis_summary")),
    )


async def analyze_skill_gap_with_gpt(context: SkillGapGptContext) -> SkillGapGptResult:
    client = _get_openai_client()
    system_prompt =  """
You are a backend AI service for generating benchmark skills for a job role.

Return ONLY valid JSON.

----------------------------------
GOAL
----------------------------------
Generate required skills for a role based on:
- desired_job_title (PRIMARY)
- target_role
- education
- field_of_study
- experience_level

Do NOT consider any user skills.

----------------------------------
OUTPUT FORMAT
----------------------------------
{
  "role_required_skills": {
    "technical": [],
    "tools": [],
    "soft": []
  },
  "skill_priority": {
    "high": [],
    "medium": [],
    "low": []
  },
  "analysis_summary": ""
}

----------------------------------
SKILL RULES
----------------------------------

- Use standard industry skill names
- Each skill: max 3 words
- No duplicates
- Each skill appears in ONE category only

Technical → concepts  
Tools → technologies  
Soft → behaviors  

- Use Title Case
- Avoid generic skills

----------------------------------
SKILL COUNT
----------------------------------

Entry-level: 6–10 skills  
Mid-level: 8–14 skills  
Senior-level: 10–18 skills  

----------------------------------
PRIORITY LOGIC
----------------------------------

- High: core essential skills
- Medium: supporting skills
- Low: optional skills

- Ensure High has multiple skills (2+)
- Keep distribution balanced naturally
- Do NOT force exact numbers

----------------------------------
CONSISTENCY
----------------------------------

- All priority skills must exist in role_required_skills
- Sort lists alphabetically
- No duplicates

----------------------------------
SUMMARY
----------------------------------

analysis_summary:
- 1–2 short sentences
- Focus on role expectations
"""

    last_error: Exception | None = None
    for attempt in range(1, GPT_MAX_RETRIES + 1):
        response = await client.chat.completions.create(
            model=GPT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": _build_prompt(context)},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        raw_content = response.choices[0].message.content or "{}"
        try:
            parsed = json.loads(raw_content)
            return _normalize_result(parsed if isinstance(parsed, dict) else {})
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            last_error = exc
            logger.warning(
                "Invalid Skill Gap GPT response on attempt %s/%s: %s",
                attempt,
                GPT_MAX_RETRIES,
                exc,
            )

    raise RuntimeError("Failed to obtain a valid Skill Gap GPT response.") from last_error
