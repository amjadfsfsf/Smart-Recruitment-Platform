from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from textwrap import dedent
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI

logger = logging.getLogger(__name__)

ENV_PATH = Path(__file__).resolve().parents[4] / ".env"
load_dotenv(ENV_PATH)

DEFAULT_DB_PATH = Path(__file__).resolve().parents[4] / "resume-builder.db"
RESUME_DB_PATH = Path(
    os.getenv("RESUME_DB_PATH", "").strip() or str(DEFAULT_DB_PATH),
).resolve()

REWRITE_MODEL = (
    os.getenv("OPENAI_REWRITE_MODEL")
    or os.getenv("RESUME_OPENAI_MODEL")
    or "gpt-4o"
)
GENERATE_MODEL = os.getenv("RESUME_OPENAI_MODEL") or REWRITE_MODEL
SUMMARY_MODEL = os.getenv("RESUME_SUMMARY_MODEL") or "gpt-4o-mini"
OPENAI_TIMEOUT_SECONDS = float(os.getenv("GPT_TIMEOUT_SECONDS", "20"))
EXPERIENCE_LEVELS = {"Junior", "Mid", "Senior"}
SUMMARY_MAX_WORDS = 80
SUMMARY_MIN_WORDS = 12
SUMMARY_RETRY_LIMIT = 2
SUMMARY_RETRY_REQUIREMENT = "IMPORTANT: Each summary must be 2–3 lines max, under 80 words, and clearly different."
SUMMARY_BANNED_PHRASES = {
    "collaborative environment",
    "strategic decisions",
    "proven ability",
    "proven track record",
}
SUMMARY_BANNED_SENTENCE_STARTS = {"developed", "built", "implemented"}
SUMMARY_STYLE_HINTS = (
    "with experience in",
    "specializing in",
    "focused on",
    "skilled in",
    "experienced in",
    "expertise in",
    "proficient in",
)
ROLE_GUIDANCE = {
    "frontend": (
        "Prioritize frontend hiring language. Focus on React, JavaScript, TypeScript, UI, performance, "
        "accessibility, CSS, Tailwind, and REST API integration when they are present in the job description "
        "or candidate background. Minimize unrelated BI, heavy ML, or data tooling unless the job requires them."
    ),
    "backend": (
        "Prioritize backend hiring language. Focus on APIs, Python, FastAPI, Node.js, SQL, databases, "
        "performance, reliability, and services when they are present in the job description or candidate background."
    ),
    "data": (
        "Prioritize data-role language. Focus on Python, SQL, dashboards, analytics, reporting, Tableau, "
        "Power BI, and data quality when they are present in the job description or candidate background."
    ),
    "ml": (
        "Prioritize ML and AI role language. Focus on machine learning, model development, Python, data pipelines, "
        "evaluation, and deployment when they are present in the job description or candidate background."
    ),
    "general": (
        "Prioritize the target job description keywords first, then the strongest relevant skills from the candidate background."
    ),
}
ROLE_KEYWORD_LIBRARY = {
    "frontend": [
        "react",
        "next.js",
        "javascript",
        "typescript",
        "ui",
        "user interface",
        "performance",
        "accessibility",
        "rest api",
        "tailwind",
        "css",
        "responsive",
    ],
    "backend": [
        "python",
        "fastapi",
        "node.js",
        "api",
        "sql",
        "postgresql",
        "microservices",
        "performance",
        "backend",
    ],
    "data": [
        "python",
        "sql",
        "tableau",
        "power bi",
        "dashboard",
        "dashboarding",
        "reporting",
        "analytics",
        "data analysis",
    ],
    "ml": [
        "machine learning",
        "tensorflow",
        "pytorch",
        "scikit-learn",
        "nlp",
        "deep learning",
        "modeling",
        "python",
    ],
}
FRONTEND_DEEMPHASIZE_TERMS = {
    "power bi",
    "tableau",
    "machine learning",
    "deep learning",
    "tensorflow",
    "pytorch",
    "scikit-learn",
}
SUMMARY_VARIATION_STOPWORDS = {
    "a",
    "an",
    "and",
    "for",
    "in",
    "of",
    "on",
    "the",
    "to",
    "with",
    "using",
    "specializing",
    "experience",
    "experienced",
    "skilled",
    "developer",
    "engineer",
    "analyst",
    "professional",
}
SUMMARY_IMPACT_TERMS = {
    "impact",
    "improve",
    "improving",
    "improvement",
    "outcomes",
    "performance",
    "efficiency",
    "reliability",
    "results",
    "optimization",
    "optimize",
    "optimized",
}
SUMMARY_TECHNICAL_TERMS = {
    "react",
    "javascript",
    "typescript",
    "api",
    "apis",
    "rest",
    "sql",
    "python",
    "tailwind",
    "css",
    "frontend",
    "backend",
    "fastapi",
    "node.js",
    "node",
}

BUILT_IN_SECTIONS = [
    {"id": "personal", "type": "personal", "title": "Personal Information", "sortOrder": 0},
    {"id": "summary", "type": "summary", "title": "Summary", "sortOrder": 1},
    {"id": "education", "type": "education", "title": "Education", "sortOrder": 2},
    {"id": "experience", "type": "experience", "title": "Experience", "sortOrder": 3},
    {"id": "skills", "type": "skills", "title": "Skills", "sortOrder": 4},
    {"id": "projects", "type": "projects", "title": "Projects", "sortOrder": 5},
    {"id": "certifications", "type": "certifications", "title": "Certifications", "sortOrder": 6},
    {"id": "languages", "type": "languages", "title": "Languages", "sortOrder": 7},
]
BUILT_IN_SECTION_LOOKUP = {section["type"]: section for section in BUILT_IN_SECTIONS}
SECTION_TABLES = {
    "personal": "resume_personal_info",
    "summary": "resume_summary",
    "education": "resume_education",
    "experience": "resume_experience",
    "skills": "resume_skills",
    "projects": "resume_projects",
    "certifications": "resume_certifications",
    "languages": "resume_languages",
    "custom": "resume_custom_sections",
}


class ResumeBuilderError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@lru_cache(maxsize=1)
def _get_client() -> OpenAI:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ResumeBuilderError("OPENAI_API_KEY is not configured.", 500)

    return OpenAI(api_key=api_key, timeout=OPENAI_TIMEOUT_SECONDS)


def _connect() -> sqlite3.Connection:
    RESUME_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(RESUME_DB_PATH, timeout=30, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode = WAL;")
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection


def _init_database() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS resume_section_settings (
              id TEXT NOT NULL,
              user_id INTEGER NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              visible INTEGER NOT NULL DEFAULT 1,
              sort_order INTEGER NOT NULL DEFAULT 0,
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(user_id, id)
            );

            CREATE TABLE IF NOT EXISTS resume_personal_info (
              user_id INTEGER PRIMARY KEY,
              full_name TEXT NOT NULL DEFAULT '',
              email TEXT NOT NULL DEFAULT '',
              phone TEXT NOT NULL DEFAULT '',
              location TEXT NOT NULL DEFAULT '',
              linkedin TEXT NOT NULL DEFAULT '',
              links_json TEXT NOT NULL DEFAULT '[]',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_summary (
              user_id INTEGER PRIMARY KEY,
              content TEXT NOT NULL DEFAULT '',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_education (
              user_id INTEGER PRIMARY KEY,
              items_json TEXT NOT NULL DEFAULT '[]',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_experience (
              user_id INTEGER PRIMARY KEY,
              items_json TEXT NOT NULL DEFAULT '[]',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_skills (
              user_id INTEGER PRIMARY KEY,
              items_json TEXT NOT NULL DEFAULT '[]',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_projects (
              user_id INTEGER PRIMARY KEY,
              items_json TEXT NOT NULL DEFAULT '[]',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_certifications (
              user_id INTEGER PRIMARY KEY,
              items_json TEXT NOT NULL DEFAULT '[]',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_languages (
              user_id INTEGER PRIMARY KEY,
              items_json TEXT NOT NULL DEFAULT '[]',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resume_custom_sections (
              id TEXT NOT NULL,
              user_id INTEGER NOT NULL,
              content TEXT NOT NULL DEFAULT '',
              is_deleted INTEGER NOT NULL DEFAULT 0,
              deleted_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(user_id, id)
            );

            CREATE TABLE IF NOT EXISTS resume_preferences (
              user_id INTEGER PRIMARY KEY,
              template_id TEXT NOT NULL DEFAULT 'classic-ats',
              job_title TEXT NULL,
              job_description TEXT NULL,
              ai_generated_json TEXT NOT NULL DEFAULT '{}',
              optimized_sections_json TEXT NOT NULL DEFAULT '{}',
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        try:
            connection.execute("ALTER TABLE resume_personal_info ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]'")
        except sqlite3.OperationalError:
            pass


def _normalize_text(value: str | None) -> str:
    return (value or "").replace("\r\n", "\n").strip()


def _normalize_string(value: Any, fallback: str = "") -> str:
    return value.strip() if isinstance(value, str) else fallback


def _normalize_nullable_text(value: Any) -> str | None:
    normalized = _normalize_string(value)
    return normalized or None


def _normalize_boolean(value: Any, fallback: bool = False) -> bool:
    return value if isinstance(value, bool) else fallback


def _normalize_bullet_text(value: Any) -> str:
    return "\n".join(
        line.strip()
        for line in _normalize_text(str(value or "")).split("\n")
        if line.strip()
    )


def _normalize_bullet_list(value: Any, fallback: list[str] | None = None) -> list[str]:
    if isinstance(value, list):
        normalized = [
            re.sub(r"^[\s\u2022*-]+", "", _normalize_string(item)).strip()
            for item in value
        ]
        cleaned = [item for item in normalized if item]
        if cleaned:
            return cleaned
    elif isinstance(value, str):
        split_lines = [
            re.sub(r"^[\s\u2022*-]+", "", line).strip()
            for line in _normalize_text(value).split("\n")
            if line.strip()
        ]
        if split_lines:
            return split_lines

    return list(fallback or [])


def _parse_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return fallback

    return fallback if parsed is None else parsed


def _normalize_string_array(value: Any, field_name: str, status_code: int = 502) -> list[str]:
    if not isinstance(value, list):
        raise ResumeBuilderError(f'The AI service returned an invalid "{field_name}" field.', status_code)

    return [item for item in (_normalize_string(entry) for entry in value) if item]


def _truncate_for_log(value: Any, limit: int = 500) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = text.replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


def _normalize_summary_skills(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in (_normalize_string(entry) for entry in value) if item]


def _normalize_summary_experience(value: Any) -> str:
    if isinstance(value, str):
        return _normalize_text(value)

    if not isinstance(value, list):
        return ""

    lines: list[str] = []
    for item in value:
        if isinstance(item, str):
            normalized = _normalize_text(item)
            if normalized:
                lines.append(normalized)
            continue

        if not isinstance(item, dict):
            continue

        combined = " ".join(
            part
            for part in [
                _normalize_string(item.get("jobTitle")),
                _normalize_string(item.get("companyName")),
                _normalize_bullet_text(item.get("description")),
            ]
            if part
        ).strip()

        if combined:
            lines.append(combined)

    return "\n".join(lines)


def _detect_summary_role_family(*text_parts: str) -> str:
    combined = " ".join(part for part in text_parts if part).lower()

    if any(term in combined for term in ["frontend", "front-end", "react", "javascript", "typescript", "ui"]):
        return "frontend"
    if any(term in combined for term in ["backend", "back-end", "fastapi", "api", "server", "microservices"]):
        return "backend"
    if any(term in combined for term in ["machine learning", "ml ", " ai ", "deep learning", "nlp", "model"]):
        return "ml"
    if any(term in combined for term in ["data analyst", "analytics", "reporting", "dashboard", "sql", "tableau", "power bi"]):
        return "data"

    return "general"


def _extract_priority_summary_keywords(
    job_title: str,
    job_description: str,
    summary_text: str,
    experience_text: str,
    skills: list[str],
    role_family: str,
) -> list[str]:
    search_text = f"{job_title}\n{job_description}\n{summary_text}\n{experience_text}\n{' '.join(skills)}"
    search_space = search_text.lower()
    keywords: list[str] = []

    source_terms = skills if job_description else skills[:]

    for skill in source_terms:
        normalized_skill = _normalize_string(skill)
        if normalized_skill and normalized_skill.lower() in search_space:
            keywords.append(normalized_skill)

    for keyword in ROLE_KEYWORD_LIBRARY.get(role_family, []):
        if keyword in search_space:
            keywords.append(keyword)

    if role_family != "general":
        for keyword in ROLE_KEYWORD_LIBRARY.get(role_family, [])[:4]:
            if keyword not in [item.lower() for item in keywords]:
                keywords.append(keyword)

    seen: set[str] = set()
    normalized_keywords: list[str] = []
    for keyword in keywords:
        normalized_keyword = _normalize_string(keyword)
        lowered_keyword = normalized_keyword.lower()
        if not normalized_keyword or lowered_keyword in seen:
            continue
        seen.add(lowered_keyword)
        normalized_keywords.append(normalized_keyword)

    return normalized_keywords[:8]


def _build_role_summary_guidance(role_family: str) -> str:
    return ROLE_GUIDANCE.get(role_family, ROLE_GUIDANCE["general"])


def _split_summary_sentences(summary: str) -> list[str]:
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", summary) if sentence.strip()]


def _count_summary_words(summary: str) -> int:
    return len(re.findall(r"[A-Za-z0-9+#./-]+", summary))


def _extract_summary_tokens(summary: str) -> list[str]:
    return [token.lower() for token in re.findall(r"[A-Za-z0-9+#./-]+", summary)]


def _extract_distinctive_summary_tokens(summary: str) -> set[str]:
    return {
        token
        for token in _extract_summary_tokens(summary)
        if len(token) > 2 and token not in SUMMARY_VARIATION_STOPWORDS
    }


def _count_keyword_mentions(summary: str, keywords: list[str]) -> int:
    lowered_summary = summary.lower()
    return sum(1 for keyword in keywords if keyword and keyword.lower() in lowered_summary)


def _get_summary_opening_signature(summary: str, token_count: int = 5) -> str:
    tokens = _extract_summary_tokens(summary)
    return " ".join(tokens[:token_count])


def _get_repeated_summary_phrases(summaries: list[dict[str, Any]], min_words: int = 5) -> set[str]:
    phrase_counts: dict[str, int] = {}
    for summary_option in summaries:
        tokens = _extract_summary_tokens(summary_option.get("summary", ""))
        seen_for_summary: set[str] = set()
        for index in range(0, max(len(tokens) - min_words + 1, 0)):
            phrase = " ".join(tokens[index : index + min_words])
            if phrase in seen_for_summary:
                continue
            seen_for_summary.add(phrase)
            phrase_counts[phrase] = phrase_counts.get(phrase, 0) + 1

    return {
        phrase
        for phrase, count in phrase_counts.items()
        if count > 1 and not all(token in SUMMARY_VARIATION_STOPWORDS for token in phrase.split())
    }


def _get_version_specific_summary_violations(
    summary_id: str,
    summary: str,
    skills: list[str],
    prioritized_keywords: list[str],
) -> list[str]:
    violations: list[str] = []
    lowered_summary = summary.lower()
    skill_keywords = [
        _normalize_string(skill).lower()
        for skill in skills
        if _normalize_string(skill)
    ]
    priority_terms = [keyword.lower() for keyword in prioritized_keywords if keyword]
    tool_matches = _count_keyword_mentions(
        summary,
        list(dict.fromkeys(skill_keywords + priority_terms + list(SUMMARY_TECHNICAL_TERMS))),
    )
    skill_tool_matches = _count_keyword_mentions(summary, list(dict.fromkeys(skill_keywords)))
    combined_skill_matches = _count_keyword_mentions(summary, list(dict.fromkeys(skill_keywords + priority_terms)))

    if summary_id == "balanced":
        if not any(
            term in lowered_summary
            for term in ["with experience in", "specializing in", "background in", "focused on", "expertise in", "proficient in", "experienced in"]
        ):
            violations.append("Balanced summary should use a neutral professional introduction.")
        if combined_skill_matches < 2:
            violations.append("Balanced summary should include a mix of role and relevant skills.")

    if summary_id == "impact":
        if not any(term in lowered_summary for term in SUMMARY_STYLE_HINTS + ("background in", "expertise in", "proficient in")):
            violations.append('Impact-driven summary should still use summary-style phrasing such as "with experience in" or "focused on".')
        if not any(term in lowered_summary for term in SUMMARY_IMPACT_TERMS):
            violations.append("Impact-driven summary should emphasize results, performance, or improvement.")
        if skill_tool_matches > 3:
            violations.append("Impact-driven summary should avoid listing too many tools.")

    if summary_id == "technical":
        if not any(term in lowered_summary for term in ["proficient in", "specializing in", "with experience in", "technical "]):
            violations.append("Technical summary should still read like a concise professional summary.")
        if combined_skill_matches < 2:
            violations.append("Technical summary should feature tools and technologies more clearly.")
        if not any(term in lowered_summary for term in SUMMARY_TECHNICAL_TERMS):
            violations.append("Technical summary should use more technical wording.")

    return violations


def _get_cross_summary_violations(summaries: list[dict[str, Any]]) -> dict[str, list[str]]:
    violations: dict[str, list[str]] = {}
    openings: dict[str, str] = {
        summary_option.get("id", "unknown"): _get_summary_opening_signature(summary_option.get("summary", ""))
        for summary_option in summaries
    }

    for current_id, opening in openings.items():
        if opening and list(openings.values()).count(opening) > 1:
            violations.setdefault(current_id, []).append("Opening structure is too similar to another version.")

    repeated_phrases = _get_repeated_summary_phrases(summaries)
    for summary_option in summaries:
        current_id = summary_option.get("id", "unknown")
        lowered_summary = summary_option.get("summary", "").lower()
        repeated_hits = [phrase for phrase in repeated_phrases if phrase in lowered_summary]
        if repeated_hits:
            violations.setdefault(current_id, []).append("Summary repeats the same phrase pattern used in another version.")

    token_sets = {
        summary_option.get("id", "unknown"): _extract_distinctive_summary_tokens(summary_option.get("summary", ""))
        for summary_option in summaries
    }
    summary_ids = [summary_option.get("id", "unknown") for summary_option in summaries]
    for index, left_id in enumerate(summary_ids):
        for right_id in summary_ids[index + 1 :]:
            left_tokens = token_sets.get(left_id, set())
            right_tokens = token_sets.get(right_id, set())
            union = left_tokens | right_tokens
            if not union:
                continue
            overlap_ratio = len(left_tokens & right_tokens) / len(union)
            if overlap_ratio > 0.68:
                violations.setdefault(left_id, []).append(f"Summary is too close in wording to {right_id}.")
                violations.setdefault(right_id, []).append(f"Summary is too close in wording to {left_id}.")

    return violations


def _get_summary_violations(
    summary: str,
    job_title: str,
    prioritized_keywords: list[str],
    role_family: str,
    job_description: str,
) -> list[str]:
    violations: list[str] = []
    normalized_summary = _normalize_text(summary)
    lowered_summary = normalized_summary.lower()
    word_count = _count_summary_words(normalized_summary)
    sentences = _split_summary_sentences(normalized_summary)

    if word_count < SUMMARY_MIN_WORDS:
        violations.append("Summary is too short.")
    if word_count > SUMMARY_MAX_WORDS:
        violations.append("Summary exceeds the 80-word limit.")
    if len(sentences) < 2 or len(sentences) > 3:
        violations.append("Summary must contain 2 to 3 short sentences.")

    for sentence in sentences:
        sentence_words = re.findall(r"[A-Za-z0-9+#./-]+", sentence.lower())
        if sentence_words and sentence_words[0] in SUMMARY_BANNED_SENTENCE_STARTS:
            violations.append('Summary must not read like experience bullets starting with "Developed", "Built", or "Implemented".')
            break

    for phrase in SUMMARY_BANNED_PHRASES:
        if phrase in lowered_summary:
            violations.append(f'Summary uses banned generic phrase "{phrase}".')

    if job_title:
        job_title_tokens = [token for token in re.findall(r"[A-Za-z0-9+#./-]+", job_title.lower()) if len(token) > 2]
        if job_title_tokens and not any(token in lowered_summary for token in job_title_tokens[:2]):
            violations.append("Summary should align more clearly to the target role.")

    if job_description and prioritized_keywords and not any(keyword.lower() in lowered_summary for keyword in prioritized_keywords):
        violations.append("Summary should prioritize target job keywords more clearly.")

    if role_family == "frontend":
        for keyword in FRONTEND_DEEMPHASIZE_TERMS:
            if keyword in lowered_summary and keyword not in job_description.lower():
                violations.append("Frontend summary includes unrelated skills that should be minimized.")
                break

    return violations


def _build_summary_generation_prompt(
    job_title: str,
    summary_text: str,
    skills: list[str],
    experience_text: str,
    job_description: str,
    role_family: str,
    prioritized_keywords: list[str],
    strict_retry: bool = False,
) -> str:
    retry_requirement = f"\n        {SUMMARY_RETRY_REQUIREMENT}\n" if strict_retry else ""
    mode_instruction = (
        "Optimize this summary for the following job description. Extract the strongest relevant keywords and align each version to that target role."
        if job_description
        else "Improve this summary to be stronger, clearer, and more impactful. Generate 3 versions (General, Results, Tools) using only the summary, skills, and experience."
    )
    job_description_label = "Target job description" if job_description else "Job description mode"
    job_description_value = job_description or "Not provided. Use smart optimize mode without job-specific keywords."
    keyword_guidance = (
        ", ".join(prioritized_keywords)
        if prioritized_keywords
        else (
            "Use the strongest role-relevant keywords from the job description."
            if job_description
            else "Use the strongest relevant skills and role language from the candidate background."
        )
    )
    return dedent(
        f"""
        Generate exactly 3 professional resume summaries and return JSON only.

        Mode:
        - {mode_instruction}

        JSON shape:
        {{
          "summaries": [
            {{
              "id": "balanced",
              "label": "Version 1: Balanced",
              "tone": "General ATS-ready summary",
              "summary": "...",
              "keywordsUsed": ["..."]
            }},
            {{
              "id": "impact",
              "label": "Version 2: Impact-driven",
              "tone": "Results-oriented summary",
              "summary": "...",
              "keywordsUsed": ["..."]
            }},
            {{
              "id": "technical",
              "label": "Version 3: Technical",
              "tone": "Tools and skills focused",
              "summary": "...",
              "keywordsUsed": ["..."]
            }}
          ]
        }}

        Candidate inputs:
        - Job title: {job_title or "Not provided"}
        - Current summary:
        {summary_text or "Not provided"}
        - Skills: {", ".join(skills) if skills else "Not provided"}
        - Experience:
        {experience_text or "Not provided"}

        {job_description_label}:
        {job_description_value}

        Priority keywords to favor:
        {keyword_guidance}

        Role alignment guidance:
        {_build_role_summary_guidance(role_family)}
        {retry_requirement}

        Hard requirements:
        - Generate all 3 versions.
        - Each summary must be 2 to 3 short sentences only.
        - Each summary must stay between 60 and 80 words maximum, and shorter is better if the content stays clear.
        - Compress aggressively. Never expand the input into a long paragraph.
        - If a current summary is provided, rewrite and sharpen it instead of drifting away from the candidate background.
        - Use summary-style phrasing such as "Frontend developer with experience in..." or "Data analyst specializing in...".
        - Do NOT write experience-bullet phrasing such as "Developed...", "Built...", or "Implemented..." at the start of a sentence.
        - Include relevant skills naturally.
        - Avoid generic phrases like hardworking, team player, passionate, go-getter.
        - Also avoid collaborative environment, strategic decisions, proven ability, and proven track record.
        - Keep language ATS-friendly, simple, and specific.
        - Do not invent employers, metrics, certifications, dates, or tools not supported by the input.
        - If a job description is provided, prioritize its keywords over unrelated background details.
        - If no job description is provided, improve clarity, strength, wording, and impact without mentioning job keywords.
        - Every version should include at least one relevant priority keyword when job description keywords are available.
        - If the target role is frontend, emphasize React, JavaScript, UI, and performance when relevant and minimize unrelated BI or ML content.
        - Make the 3 versions meaningfully different in emphasis.
        - Version 1 must be Balanced: neutral, clean, and professional with a mix of role and skills.
        - Version 2 must be Impact-focused: emphasize performance, improvement, efficiency, outcomes, or impact with fewer tool mentions.
        - Version 3 must be Technical: emphasize tools, technologies, APIs, frameworks, and technical depth with less storytelling.
        - The 3 versions must feel clearly different in tone and structure.
        - Do not reuse the same opening phrase, sentence pattern, or repeated 4-word phrase across versions.
        - Do not make the versions minor rewrites of each other.
        - keywordsUsed must contain only keywords actually reflected in the summary.
        - Return JSON only with no markdown and no extra commentary.
        """
    ).strip()


def _build_summary_repair_prompt(
    job_title: str,
    summary_text: str,
    skills: list[str],
    experience_text: str,
    job_description: str,
    role_family: str,
    prioritized_keywords: list[str],
    current_summaries: list[dict[str, Any]],
    violations_by_id: dict[str, list[str]],
    strict_retry: bool = False,
) -> str:
    retry_requirement = f"\n        {SUMMARY_RETRY_REQUIREMENT}\n" if strict_retry else ""
    mode_instruction = (
        "Repair these summaries so they stay aligned to the job description while following every rule."
        if job_description
        else "Repair these summaries so they read stronger and clearer without introducing job-description keyword logic."
    )
    keyword_guidance = (
        ", ".join(prioritized_keywords)
        if prioritized_keywords
        else (
            "Use the strongest role-relevant keywords from the job description."
            if job_description
            else "Use the strongest relevant skills and role language from the candidate background."
        )
    )
    return dedent(
        f"""
        Repair these resume summaries so they follow every rule exactly. Return JSON only with the same structure.

        Mode:
        - {mode_instruction}

        Candidate inputs:
        - Job title: {job_title or "Not provided"}
        - Current summary:
        {summary_text or "Not provided"}
        - Skills: {", ".join(skills) if skills else "Not provided"}
        - Experience:
        {experience_text or "Not provided"}
        - Job description:
        {job_description or "Not provided. Use smart optimize mode without job-specific keywords."}
        - Priority keywords:
        {keyword_guidance}
        - Role guidance:
        {_build_role_summary_guidance(role_family)}
        {retry_requirement}

        Current summaries:
        {json.dumps(current_summaries, ensure_ascii=False)}

        Violations to fix:
        {json.dumps(violations_by_id, ensure_ascii=False)}

        Rules:
        - Return exactly 3 summaries: Balanced, Impact-focused, Technical.
        - Each summary must be 2 to 3 short sentences.
        - Each summary must stay under 80 words.
        - Keep summary-style phrasing, not experience-bullet phrasing.
        - If a current summary exists, keep the rewrite grounded in it while making it sharper and shorter.
        - Do not start any sentence with Developed, Built, or Implemented.
        - Avoid collaborative environment, strategic decisions, proven ability, proven track record, and other generic filler.
        - Prioritize job description keywords over unrelated background details.
        - If no job description exists, improve clarity, strength, wording, and impact without forcing job keywords.
        - Every version should include at least one relevant priority keyword when job description keywords are available.
        - Balanced must feel neutral and clean.
        - Impact-focused must center results, performance, improvement, efficiency, or outcomes while avoiding tool lists.
        - Technical must focus on tools, technologies, APIs, frameworks, and technical wording.
        - The 3 versions must have clearly different openings, sentence patterns, and emphasis.
        - Compress and shorten. Never expand.
        """
    ).strip()


def _normalize_summary_option(item: Any, expected_id: str, expected_label: str, expected_tone: str, optimized: bool) -> dict[str, Any]:
    if isinstance(item, str):
        item = {"summary": item}

    if not isinstance(item, dict):
        raise ResumeBuilderError("The AI service returned an invalid summary option.", 502)

    summary = _normalize_text(item.get("summary"))
    if not summary:
        raise ResumeBuilderError(f'The AI service returned an empty "{expected_id}" summary.', 502)

    keywords = _normalize_summary_skills(item.get("keywordsUsed"))

    return {
        "id": expected_id,
        "label": expected_label,
        "tone": expected_tone,
        "optimized": optimized,
        "summary": summary,
        "keywordsUsed": keywords[:6],
    }


def _normalize_generated_summaries(payload: Any, optimized: bool) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise ResumeBuilderError("The AI service returned an invalid summary payload.", 502)

    expected_versions = [
        ("balanced", "Version 1: Balanced", "General ATS-ready summary"),
        ("impact", "Version 2: Impact-driven", "Results-oriented summary"),
        ("technical", "Version 3: Technical", "Tools and skills focused"),
    ]

    summaries = payload.get("summaries")
    if isinstance(summaries, list) and len(summaries) >= 3:
        source_items = summaries[:3]
    else:
        fallback_keys = [
            payload.get("general") or payload.get("balanced"),
            payload.get("results") or payload.get("impact"),
            payload.get("tools") or payload.get("technical"),
        ]
        if all(isinstance(item, str) and _normalize_text(item) for item in fallback_keys):
            source_items = [{"summary": item} for item in fallback_keys]
        else:
            raise ResumeBuilderError("The AI service did not return exactly 3 summary versions.", 502)

    return [
        _normalize_summary_option(item, expected_id, expected_label, expected_tone, optimized)
        for item, (expected_id, expected_label, expected_tone) in zip(source_items, expected_versions, strict=False)
    ]


def _validate_generated_summaries(
    summaries: list[dict[str, Any]],
    job_title: str,
    skills: list[str],
    prioritized_keywords: list[str],
    role_family: str,
    job_description: str,
) -> dict[str, list[str]]:
    violations: dict[str, list[str]] = {}

    for summary_option in summaries:
        summary_violations = _get_summary_violations(
            summary=summary_option.get("summary", ""),
            job_title=job_title,
            prioritized_keywords=prioritized_keywords,
            role_family=role_family,
            job_description=job_description,
        )
        summary_violations.extend(
            _get_version_specific_summary_violations(
                summary_id=summary_option.get("id", "unknown"),
                summary=summary_option.get("summary", ""),
                skills=skills,
                prioritized_keywords=prioritized_keywords,
            )
        )
        if summary_violations:
            violations[summary_option.get("id", "unknown")] = summary_violations

    cross_summary_violations = _get_cross_summary_violations(summaries)
    for summary_id, summary_violations in cross_summary_violations.items():
        violations.setdefault(summary_id, []).extend(summary_violations)

    return violations


def _build_summary_response_map(summaries: list[dict[str, Any]]) -> dict[str, str]:
    lookup = {item.get("id"): item.get("summary", "") for item in summaries}
    return {
        "general": lookup.get("balanced", ""),
        "results": lookup.get("impact", ""),
        "tools": lookup.get("technical", ""),
    }


def _build_summary_role_phrase(job_title: str, role_family: str) -> str:
    if job_title:
        return job_title

    return {
        "frontend": "Frontend developer",
        "backend": "Backend developer",
        "data": "Data professional",
        "ml": "Machine learning professional",
    }.get(role_family, "Professional")


def _select_summary_terms(prioritized_keywords: list[str], skills: list[str], limit: int = 4) -> list[str]:
    selected_terms: list[str] = []
    for term in prioritized_keywords + skills:
        normalized_term = _normalize_string(term)
        if not normalized_term:
            continue
        if normalized_term.lower() in {item.lower() for item in selected_terms}:
            continue
        selected_terms.append(normalized_term)
        if len(selected_terms) >= limit:
            break
    return selected_terms


def _join_summary_terms(terms: list[str]) -> str:
    filtered_terms = [term for term in terms if term]
    if not filtered_terms:
        return "relevant tools"
    if len(filtered_terms) == 1:
        return filtered_terms[0]
    if len(filtered_terms) == 2:
        return f"{filtered_terms[0]} and {filtered_terms[1]}"
    return f"{', '.join(filtered_terms[:-1])}, and {filtered_terms[-1]}"


def _ensure_summary_punctuation(text: str) -> str:
    normalized = _normalize_text(text).rstrip(",;:-")
    if not normalized:
        return ""
    if normalized[-1] not in ".!?":
        return f"{normalized}."
    return normalized


def _truncate_summary_to_words(text: str, limit: int) -> str:
    if _count_summary_words(text) <= limit:
        return _normalize_text(text)

    pieces = re.findall(r"\S+", text)
    trimmed: list[str] = []
    word_count = 0

    for piece in pieces:
        if re.search(r"[A-Za-z0-9+#./-]+", piece):
            word_count += 1
        if word_count > limit:
            break
        trimmed.append(piece)

    return _ensure_summary_punctuation(" ".join(trimmed))


def _build_summary_fallback_seed(
    summary_id: str,
    job_title: str,
    role_family: str,
    prioritized_keywords: list[str],
    skills: list[str],
) -> str:
    role_phrase = _build_summary_role_phrase(job_title, role_family)
    primary_terms = _select_summary_terms(prioritized_keywords, skills, limit=4)
    technical_terms = primary_terms[:3] or skills[:3]

    if summary_id == "impact":
        return (
            f"{role_phrase} focused on performance, improvement, and practical results. "
            f"Uses {_join_summary_terms(primary_terms[:2] or technical_terms[:2])} to support clear, efficient delivery."
        )

    if summary_id == "technical":
        return (
            f"{role_phrase} proficient in {_join_summary_terms(technical_terms)}. "
            f"Experienced with APIs, implementation quality, and maintainable technical execution."
        )

    return (
        f"{role_phrase} with experience in {_join_summary_terms(primary_terms[:2] or technical_terms[:2])}. "
        f"Brings concise, role-aligned work supported by relevant tools and day-to-day experience."
    )


def compressSummary(
    text: str,
    *,
    summary_id: str,
    job_title: str,
    role_family: str,
    prioritized_keywords: list[str],
    skills: list[str],
) -> str:
    fallback_seed = _build_summary_fallback_seed(
        summary_id=summary_id,
        job_title=job_title,
        role_family=role_family,
        prioritized_keywords=prioritized_keywords,
        skills=skills,
    )
    normalized = _normalize_text(text) or fallback_seed

    for phrase in SUMMARY_BANNED_PHRASES:
        normalized = re.sub(re.escape(phrase), "", normalized, flags=re.IGNORECASE)

    normalized = re.sub(r"\b(?:hardworking|team player|passionate|go-getter)\b", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+", " ", normalized).strip(" ,;:-")

    raw_sentences = _split_summary_sentences(normalized) or _split_summary_sentences(fallback_seed)
    cleaned_sentences: list[str] = []
    seen_signatures: set[str] = set()

    for sentence in raw_sentences:
        candidate = re.sub(r"\s+", " ", sentence).strip(" ,;:-")
        if not candidate:
            continue

        tokens = re.findall(r"[A-Za-z0-9+#./-]+", candidate)
        if tokens and tokens[0].lower() in SUMMARY_BANNED_SENTENCE_STARTS:
            candidate = " ".join(tokens[1:]).strip()
            tokens = re.findall(r"[A-Za-z0-9+#./-]+", candidate)

        if not tokens:
            continue

        signature = " ".join(token.lower() for token in tokens[:6])
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)

        candidate = _truncate_summary_to_words(candidate, 18)
        candidate = _ensure_summary_punctuation(candidate)
        if candidate:
            cleaned_sentences.append(candidate)
        if len(cleaned_sentences) >= 3:
            break

    fallback_sentences = _split_summary_sentences(fallback_seed)
    while len(cleaned_sentences) < 2 and fallback_sentences:
        candidate = _ensure_summary_punctuation(_truncate_summary_to_words(fallback_sentences.pop(0), 18))
        if candidate and candidate not in cleaned_sentences:
            cleaned_sentences.append(candidate)

    if not cleaned_sentences:
        cleaned_sentences = [_ensure_summary_punctuation(_truncate_summary_to_words(fallback_seed, 24))]

    compressed = " ".join(cleaned_sentences[:3])
    if not any(hint in compressed.lower() for hint in SUMMARY_STYLE_HINTS):
        compressed = f"{_ensure_summary_punctuation(_split_summary_sentences(fallback_seed)[0])} {compressed}"

    compressed = _truncate_summary_to_words(compressed, SUMMARY_MAX_WORDS)
    sentences = _split_summary_sentences(compressed)
    if len(sentences) > 3:
        compressed = " ".join(sentences[:3])
    elif len(sentences) < 2:
        fallback_tail = _split_summary_sentences(fallback_seed)
        for sentence in fallback_tail:
            if sentence not in sentences:
                sentences.append(_ensure_summary_punctuation(_truncate_summary_to_words(sentence, 18)))
            if len(sentences) >= 2:
                break
        compressed = " ".join(sentences[:3])

    return _ensure_summary_punctuation(compressed)


def _extract_summary_keywords(summary: str, prioritized_keywords: list[str], skills: list[str]) -> list[str]:
    lowered_summary = summary.lower()
    keywords: list[str] = []
    for keyword in prioritized_keywords + skills:
        normalized_keyword = _normalize_string(keyword)
        if normalized_keyword and normalized_keyword.lower() in lowered_summary:
            keywords.append(normalized_keyword)

    seen: set[str] = set()
    unique_keywords: list[str] = []
    for keyword in keywords:
        lowered_keyword = keyword.lower()
        if lowered_keyword in seen:
            continue
        seen.add(lowered_keyword)
        unique_keywords.append(keyword)

    return unique_keywords[:6]


def _build_summary_fallback_versions(
    *,
    summaries: list[dict[str, Any]] | None,
    job_title: str,
    skills: list[str],
    prioritized_keywords: list[str],
    role_family: str,
    optimized: bool,
) -> list[dict[str, Any]]:
    expected_versions = [
        ("balanced", "Version 1: Balanced", "General ATS-ready summary"),
        ("impact", "Version 2: Impact-driven", "Results-oriented summary"),
        ("technical", "Version 3: Technical", "Tools and skills focused"),
    ]
    source_lookup = {item.get("id"): item for item in (summaries or [])}
    fallback_versions: list[dict[str, Any]] = []

    for summary_id, label, tone in expected_versions:
        source_summary = _normalize_text(source_lookup.get(summary_id, {}).get("summary"))
        compressed_summary = compressSummary(
            source_summary,
            summary_id=summary_id,
            job_title=job_title,
            role_family=role_family,
            prioritized_keywords=prioritized_keywords,
            skills=skills,
        )
        fallback_versions.append(
            {
                "id": summary_id,
                "label": label,
                "tone": tone,
                "optimized": optimized,
                "summary": compressed_summary,
                "keywordsUsed": _extract_summary_keywords(compressed_summary, prioritized_keywords, skills),
            }
        )

    return fallback_versions


def _request_summary_completion(*, system_message: str, user_prompt: str, temperature: float) -> Any:
    response = _get_client().chat.completions.create(
        model=SUMMARY_MODEL,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_prompt},
        ],
    )

    output_text = _normalize_text(response.choices[0].message.content)
    print(f"[resume-summary] OpenAI response: {_truncate_for_log(output_text)}")
    if not output_text:
        raise ResumeBuilderError("The AI service returned an empty summary response.", 502)

    try:
        return json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise ResumeBuilderError("The AI service returned invalid JSON for summary generation.", 502) from exc


def build_experience_prompt() -> str:
     return """
You are a strict resume editor.

Your job is to REWRITE work experience bullets into clean, professional, ATS-friendly bullets.

---

CRITICAL RULES:

1. Each bullet MUST start with ONE strong action verb only
   (Built, Developed, Optimized, Designed, Implemented, Improved)

2. NEVER use double verbs:
   ❌ "Achieved completed"
   ❌ "Built gained"

3. REMOVE filler phrases completely:
   - "while supporting"
   - "while also"
   - "helping to"
   - "in order to"

4. SIMPLIFY aggressively:
   - Keep only the most important idea
   - Remove repetition
   - Remove duplicated phrases

---

LENGTH RULE:

- Each bullet MUST be 8–14 words MAX
- If longer → rewrite shorter

---

STRUCTURE RULE:

- Keep SAME number of bullets
- One bullet = one clear idea
- NO paragraphs

---

QUALITY RULE:

Each bullet must follow this pattern:
👉 Action Verb + What you did + (optional tool/tech)

Example:
✔ Developed machine learning models using TensorFlow and Python  
✔ Optimized data processing pipelines to improve performance  

---

SELF-CHECK (MANDATORY):

Before returning:
- Ensure NO repeated phrases
- Ensure NO "while" sentences
- Ensure NO double verbs
- Ensure ALL bullets are short and clean

---

OUTPUT:

Return ONLY the rewritten bullet points.
No explanations.
"""


def build_experience_root_prompt() -> str:
    return """
You are a strict resume formatter.

Your job is NOT to rewrite sentences.
Your job is to CONVERT messy text into clean resume bullet points.

---

CORE RULE:

For each bullet:
1. Extract the MAIN IDEA only
2. Rewrite it as a NEW clean bullet

---

STRICT RULES:

- DO NOT reuse original sentence structure
- DO NOT keep phrases like:
  "while", "also", "helping", "supporting"
- DO NOT copy long sentences

---

FORMAT RULE:

Each bullet MUST follow:
Action Verb + Task + Tool/Skill (optional)

Examples:
Developed machine learning models using Python and TensorFlow
Optimized data processing pipelines to improve performance

---

LENGTH RULE:

- Max 12 words per bullet
->  If longer -rewrite shorter

---

STRUCTURE:

- Keep SAME number of bullets
- One bullet = one idea
- No paragraphs

---

QUALITY RULE:

- Remove repetition completely
- Keep only meaningful content
- If sentence is messy -> SIMPLIFY it

---

OUTPUT:

Return ONLY clean bullet points.
No explanations.
"""


def build_experience_final_prompt(field_label: str = "") -> str:
    target_label = field_label or "experience bullets"
    return f"""
You are a strict resume bullet generator.

Your job is to UPGRADE weak {target_label} into stronger, more specific, professional bullet points.

CORE RULE:
- Do NOT only rephrase the text.
- Upgrade it with realistic, job-relevant technical detail when the input is weak.
- Keep additions believable and consistent with the original text.

CRITICAL RULES:
- Remove generic words like motivated, hardworking, responsible, passionate, committed, dedicated.
- Remove vague phrases like various technologies, system improvements, worked on things.
- Replace personality wording with real skills, tools, and actions.
- Prefer strong verbs such as Built, Developed, Optimized, Implemented, Designed.
- Never use filler like while, also, helping, supporting, in order to.

SPECIFICITY RULE:
Every bullet must include:
1. WHAT was built, improved, or delivered
2. HOW it was done using a tool, platform, framework, or technical approach
3. WHY it mattered through a practical outcome or impact

ENRICHMENT RULE:
- If the input is weak, add realistic technical detail that fits the context.
- For web or software work, prefer concrete wording like React, JavaScript, APIs, SQL, dashboards, automation, responsive UI, data pipelines, or testing when appropriate.
- Preserve any metrics already present in the input.
- If no metric is provided, strengthen the impact with grounded results such as reduced load time, improved reliability, enhanced usability, faster delivery, or better performance.
- Do NOT invent employers, dates, percentages, certifications, or tools that directly conflict with the text.
- If the product or domain is not specified, use neutral terms like web application, dashboard, interface, API endpoint, automation script, or database query.
- Do NOT invent domains or business outcomes such as e-commerce, sales, or revenue unless the input clearly supports them.

LENGTH RULE:
- One bullet per line
- Max 12 to 16 words per bullet
- Keep every bullet short and strong

STRUCTURE RULE:
- Keep the same number of bullets or lines
- One bullet = one clear idea
- No paragraphs

OUTPUT:
Return only the upgraded bullet points.
No explanations.
"""


def build_summary_upgrade_prompt(field_label: str = "", skills: str = "", experience: str = "") -> str:
    target_label = field_label or "professional summary"
    skills_context = f"Skills: {skills}" if skills else ""
    experience_context = f"Experience: {experience}" if experience else ""
    context = "\n".join([skills_context, experience_context]).strip()
    additional_context = f"\nADDITIONAL CONTEXT (use only if relevant and supported by input):\n{context}" if context else ""
    return f"""
You are a strict resume summary writer.

Your job is to UPGRADE a weak {target_label} into a concise, professional summary.

CORE RULE:
- Do NOT only rephrase the text.
- Replace weak personality wording with a role-based professional opening.

CRITICAL RULES:
- Remove words like motivated, passionate, dedicated, hardworking, responsible, committed.
- Use a role-based opening such as "Frontend developer with experience in..." or "Backend engineer with experience in...".
- Replace vague language with concrete skills, tools, and focus areas.
- Do not use filler phrases or generic claims.

SPECIFICITY RULE:
- Mention relevant technologies or capabilities naturally.
- Mention practical impact such as performance, reliability, usability, delivery speed, or user experience.
- Keep the summary grounded in the input and avoid fabricated employers, dates, or exact percentages.

LENGTH RULE:
- Keep it concise and professional.
- Return 2 to 3 short sentences maximum.{additional_context}

OUTPUT:
Return only the upgraded summary text.
No explanations.
"""


def _is_upgrade_rewrite_target(section: str, field_name: str) -> bool:
    normalized_section = _normalize_string(section).lower()
    normalized_field = _normalize_string(field_name).lower()
    if normalized_field:
        return normalized_field in {"description", "content", "summary"}
    return normalized_section in {"experience", "projects", "custom", "summary"}


def _build_rewrite_prompt(section: str, field_name: str = "", field_label: str = "", skills: str = "", experience: str = "") -> str:
    normalized_section = (section or "resume").strip() or "resume"
    normalized_field = _normalize_string(field_name).lower()
    normalized_label = _normalize_string(field_label) or normalized_field or normalized_section

    if normalized_field == "summary" or normalized_section == "summary":
        return build_summary_upgrade_prompt(normalized_label, skills, experience)

    if _is_upgrade_rewrite_target(normalized_section, normalized_field):
        return build_experience_final_prompt(normalized_label)

    return dedent(
      f"""
You are an expert resume writer and ATS optimization specialist.

Your task is to upgrade the {normalized_label} text so it sounds stronger, clearer, and more professional.

Guidelines:
- Keep the SAME language as the input
- If the field is a short label such as a title or name, keep it concise and do not expand it into full sentences
- Preserve the same basic structure and formatting
- Remove generic words like motivated, hardworking, responsible, passionate, committed, dedicated
- Remove vague phrases like various technologies, system improvements, and worked on things

Optimization rules:
- Use stronger, more professional wording
- Improve clarity and readability
- Make the text more specific
- Add realistic detail only when it is clearly supported by the input context
- Prefer concrete skills, tools, and actions over personality traits
- Preserve any metrics already present in the input
- If impact is missing, prefer grounded qualitative results such as improved performance, reduced load time, or enhanced user experience
- Do NOT invent employers, dates, certifications, percentages, or unrealistic metrics
- If the domain is unclear, keep the wording neutral instead of inventing business context

Section-specific behavior:
- If the text is a description or paragraph, make it sharper and more specific
- If the text is a short label, polish it without over-expanding it
- If the text describes technical work, favor concrete technologies and actions over vague wording

Output rules:
- Return ONLY the upgraded {normalized_label} text
- Do NOT include explanations, comments, or extra text
"""
    ).strip()




def _normalize_generated_resume(payload: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ResumeBuilderError("The AI service returned an invalid JSON object.", 502)

    summary = _normalize_string(payload.get("summary")) or fallback["summary"]
    if len(summary) < 50:
        summary = fallback["summary"]

    raw_skills = payload.get("skills")
    skills = (
        [item for item in (_normalize_string(entry) for entry in raw_skills) if item]
        if isinstance(raw_skills, list)
        else []
    )
    for fallback_skill in fallback["skills"]:
        if len(skills) >= 3:
            break
        if fallback_skill not in skills:
            skills.append(fallback_skill)

    fallback_education = fallback["education"]
    education_payload = (
        payload.get("education")
        if isinstance(payload.get("education"), list)
        else payload.get("education_history")
        if isinstance(payload.get("education_history"), list)
        else []
    )
    education: list[dict[str, Any]] = []
    for index, item in enumerate(education_payload):
        fallback_item = fallback_education[min(index, len(fallback_education) - 1)]
        item = item or {}
        education.append(
            {
                "school": _normalize_string(item.get("school") or item.get("universityName") or item.get("university"))
                or fallback_item["school"],
                "degree": _normalize_string(item.get("degree") or item.get("title")) or fallback_item["degree"],
                "gpa": _normalize_string(item.get("gpa")) or fallback_item["gpa"],
                "startYear": _normalize_string(item.get("startYear") or item.get("start")) or fallback_item["startYear"],
                "endYear": _normalize_string(item.get("endYear") or item.get("end")) or fallback_item["endYear"],
            }
        )

    if not education:
        education = fallback_education

    fallback_experience = fallback["experience"]
    experience_payload = (
        payload.get("experience")
        if isinstance(payload.get("experience"), list)
        else payload.get("work_experience")
        if isinstance(payload.get("work_experience"), list)
        else payload.get("workExperience")
        if isinstance(payload.get("workExperience"), list)
        else []
    )
    experience: list[dict[str, Any]] = []
    for index, item in enumerate(experience_payload):
        fallback_item = fallback_experience[min(index, len(fallback_experience) - 1)]
        item = item or {}
        description = _normalize_bullet_list(item.get("description"), fallback_item["description"])
        experience.append(
            {
                "jobTitle": _normalize_string(item.get("jobTitle") or item.get("title")) or fallback_item["jobTitle"],
                "company": _normalize_string(item.get("company") or item.get("companyName")) or fallback_item["company"],
                "startDate": _normalize_string(item.get("startDate")) or fallback_item["startDate"],
                "endDate": _normalize_string(item.get("endDate")) or fallback_item["endDate"],
                "description": description or list(fallback_item["description"]),
            }
        )

    if not experience:
        experience = fallback_experience

    fallback_projects = fallback["projects"]
    projects_payload = payload.get("projects") if isinstance(payload.get("projects"), list) else []
    projects: list[dict[str, Any]] = []
    for index, item in enumerate(projects_payload):
        fallback_item = fallback_projects[min(index, len(fallback_projects) - 1)]
        item = item or {}
        technologies = _normalize_bullet_list(item.get("technologies"), fallback_item["technologies"])
        description = _normalize_bullet_list(item.get("description"), fallback_item["description"])
        projects.append(
            {
                "name": _normalize_string(item.get("name")) or fallback_item["name"],
                "technologies": technologies or list(fallback_item["technologies"]),
                "link": _normalize_string(item.get("link")),
                "description": description or list(fallback_item["description"]),
            }
        )

    if not projects:
        projects = fallback_projects

    return {
        "summary": summary,
        "skills": skills[:10],
        "education": education,
        "experience": experience,
        "projects": projects,
    }


def _build_rewrite_user_prompt(text: str, section: str, field_name: str, field_label: str, skills: str = "", experience: str = "") -> str:
    normalized_section = _normalize_string(section) or "resume"
    normalized_field = _normalize_string(field_name) or "content"
    normalized_label = _normalize_string(field_label) or normalized_field

    skills_context = f"Skills: {skills}" if skills else ""
    experience_context = f"Experience: {experience}" if experience else ""
    context = "\n".join([skills_context, experience_context]).strip()

    # ✅ الحل هون
    additional_context = f"- Additional Context:\n{context}" if context else ""

    return dedent(
        f"""
        Upgrade this resume content.

        Context:
        - Section: {normalized_section}
        - Field: {normalized_field}
        - Label: {normalized_label}
        {additional_context}

        Input:
        {text}

        Return only the upgraded result.
        """
    ).strip()


def _remove_invented_numeric_claims(original_text: str, rewritten_text: str) -> str:
    if re.search(r"\d", original_text):
        return rewritten_text

    cleaned = re.sub(r"\bby\s+\d+%", "", rewritten_text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b\d+%", "", cleaned)
    cleaned = re.sub(r"\bby\s+\d+\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r"\s+\.", ".", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    return cleaned.strip()


def _remove_generic_resume_phrases(rewritten_text: str) -> str:
    cleaned = rewritten_text
    banned_patterns = [
        r"\bmotivated\b",
        r"\bpassionate\b",
        r"\bdedicated\b",
        r"\bhardworking\b",
        r"\bresponsible\b",
        r"\bcommitted\b",
        r"\bvarious technologies\b",
        r"\bsystem improvements\b",
        r"\bworked on things\b",
    ]

    for pattern in banned_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    return cleaned.strip(" ,;\n\t")


def rewrite_text(
    text: str,
    section: str = "resume",
    field_name: str = "",
    field_label: str = "",
    skills: str = "",
    experience: str = "",
) -> str:
    normalized_text = _normalize_text(text)
    if not normalized_text:
        raise ResumeBuilderError("Text is required.")

    try:
        response = _get_client().chat.completions.create(
            model=REWRITE_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": _build_rewrite_prompt(section, field_name, field_label, skills, experience)},
                {
                    "role": "user",
                    "content": _build_rewrite_user_prompt(
                        normalized_text,
                        section,
                        field_name,
                        field_label,
                        skills,
                        experience,
                    ),
                },
            ],
        )
    except ResumeBuilderError:
        raise
    except Exception as exc:
        raise ResumeBuilderError(getattr(exc, "message", None) or str(exc), 502) from exc

    rewritten = _normalize_text(response.choices[0].message.content)
    rewritten = _remove_invented_numeric_claims(normalized_text, rewritten)
    rewritten = _remove_generic_resume_phrases(rewritten)
    if not rewritten:
        raise ResumeBuilderError("Rewrite service returned an empty result.", 502)

    return rewritten
def _build_generate_prompt(
    job_title: str, 
    level: str, 
    skills: str, 
    education: str, 
    links: list[dict[str, str]] | None = None,
    current_summary: str = "",
    current_experience: str = "",
    current_projects: str = ""
) -> str:
    links_text = ""
    if links:
        links_text = "\n".join(f"{link.get('label', 'Link')}: {link.get('url', '')}" for link in links if link.get("url"))
        if links_text:
            links_text = f"\nCustom Links:\n{links_text}"

    current_data = ""
    if current_summary or current_experience or current_projects:
        current_data = "\n\nEXISTING USER DATA (Merge and enhance this, DO NOT overwrite completely!):\n"
        if current_summary:
            current_data += f"\nCurrent Summary:\n{current_summary}\n"
        if current_experience:
            current_data += f"\nCurrent Experience:\n{current_experience}\n"
        if current_projects:
            current_data += f"\nCurrent Projects:\n{current_projects}\n"

    return dedent(
        f"""
        Generate a resume draft using the candidate details below.

        Target role: {job_title}
        Experience level: {level}

        Candidate skills:
        {skills or "Not provided"}

        Education:
        {education or "Not provided"}{links_text}{current_data}

        Return ONLY a JSON object that matches this exact shape:
        {{
          "summary": "string",
          "skills": ["React", "Node.js", "SQL"],
          "education": [
            {{
              "school": "string",
              "degree": "string",
              "gpa": "string",
              "startYear": "2020",
              "endYear": "2024"
            }}
          ],
          "experience": [
            {{
              "jobTitle": "string",
              "company": "string",
              "startDate": "2023",
              "endDate": "2024",
              "description": ["bullet 1", "bullet 2", "bullet 3"]
            }}
          ],
          "projects": [
            {{
              "name": "string",
              "technologies": ["React", "Node.js"],
              "link": "",
              "description": ["bullet 1", "bullet 2", "bullet 3"]
            }}
          ]
        }}

        Requirements:
        - Return JSON only with no markdown, prose, or explanations.
        - Reuse and improve the user's existing summary, experience, and projects when provided.
        - Keep all content ATS-friendly, realistic, and concise.
        - Always include summary, skills, education, experience, and projects.
        - Always include at least 3 skills, at least 1 education item, at least 1 experience item, and at least 1 project item.
        - Experience counts: Junior = 1 role, Mid = 2 roles, Senior = 3 roles when enough context is available.
        - Each experience description and project description must be an array of concise bullet strings.
        - Do not invent fake metrics, fake employers, or fake certifications.
        """
    ).strip()

def _get_fallback_resume(job_title: str, level: str, skills: str, education: str) -> dict[str, Any]:
    skill_list = [s.strip() for s in skills.split(",") if s.strip()] if skills else []
    if len(skill_list) < 3:
        defaults = ["Software Development", "Problem Solving", "Communication", "Teamwork"]
        for d in defaults:
            if d not in skill_list:
                skill_list.append(d)

    education_text = _normalize_string(education)
    degree = education_text
    school = ""
    if "," in education_text:
        degree_part, school_part = [part.strip() for part in education_text.split(",", 1)]
        degree = degree_part or degree
        school = school_part

    summary = (
        f"Results-driven {level} {job_title} with experience delivering reliable, ATS-friendly solutions across "
        "collaborative product teams. Strong foundation in building maintainable features, improving user-facing "
        "workflows, and applying relevant tools to support consistent execution and quality outcomes."
    )
    primary_skill = skill_list[0] if skill_list else "Software Development"
    secondary_skill = skill_list[1] if len(skill_list) > 1 else "Communication"

    return {
        "summary": summary,
        "skills": skill_list[:10],
        "education": [
            {
                "school": school or "University / Institution",
                "degree": degree or "Relevant Degree",
                "gpa": "",
                "startYear": "",
                "endYear": "",
            }
        ],
        "experience": [
            {
                "jobTitle": job_title,
                "company": "Current Company",
                "startDate": "2023",
                "endDate": "2024",
                "description": [
                    f"Delivered core {job_title.lower()} features aligned with team priorities and release goals.",
                    "Collaborated with cross-functional teammates to improve execution quality and handoff clarity.",
                    "Maintained reliable day-to-day delivery while strengthening code quality and usability.",
                ],
            }
        ],
        "projects": [
            {
                "name": f"{job_title} Portfolio Project",
                "technologies": [primary_skill, secondary_skill],
                "link": "",
                "description": [
                    "Built a practical project that demonstrates role-relevant technical and delivery skills.",
                    "Implemented structured functionality with a focus on maintainability and clear user outcomes.",
                    "Documented the solution and iterated based on feedback to improve readiness for review.",
                ],
            }
        ],
    }

def _generate_resume_draft_legacy(payload: Any) -> dict[str, Any]:
    source = payload.model_dump() if hasattr(payload, "model_dump") else dict(payload or {})
    job_title = _normalize_string(source.get("jobTitle"))
    level = _normalize_string(source.get("level"))
    skills = _normalize_string(source.get("skills"))
    education = _normalize_string(source.get("education"))
    current_summary = _normalize_string(source.get("currentSummary"))
    current_experience = _normalize_string(source.get("currentExperience"))
    current_projects = _normalize_string(source.get("currentProjects"))
    links = source.get("links", [])

    if not job_title:
        raise ResumeBuilderError("Job Title is required.")

    if level not in EXPERIENCE_LEVELS:
        raise ResumeBuilderError("Experience Level must be Junior, Mid, or Senior.")

    system_prompt = f"""
        You are an expert resume writer and ATS optimization specialist.

        Your task is to generate a high-quality, realistic resume in JSON format.

        STRICT RULES:
        - Output MUST be valid JSON only
        - Do NOT include any explanation or extra text
        - Do NOT invent unrealistic companies or fake achievements
        - Keep everything professional, concise, and ATS-friendly

        STRUCTURE:
        - summary: 3–4 lines, strong and tailored
        - skills: relevant keywords only
        - experience: realistic roles with bullet points
        - education: clean and simple

        EXPERIENCE RULES:
        - Junior → 1 role
        - Mid → 2 roles
        - Senior → 3+ roles

        BULLETS:
        - Use strong action verbs (Built, Developed, Improved)
        - Keep concise and impactful
        - Do NOT add fake metrics

        OUTPUT FORMAT (STRICT):
        {{
        "summary": "...",
        "skills": [...],
        "experience": [...],
        "education": [...]
        }}
    """
    
    max_retries = 2
    last_error = None
    
    for attempt in range(max_retries):
        try:
            response = _get_client().chat.completions.create(
                model=GENERATE_MODEL,
                temperature=0.4,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": _build_generate_prompt(
                            job_title, 
                            level, 
                            skills, 
                            education, 
                            links,
                            current_summary,
                            current_experience,
                            current_projects
                        ),
                    },
                ],
                timeout=OPENAI_TIMEOUT_SECONDS
            )
            
            output_text = _normalize_text(response.choices[0].message.content)
            if not output_text:
                raise ResumeBuilderError("The AI service returned an empty response.", 502)

            parsed_output = json.loads(output_text)
            return _normalize_generated_resume(parsed_output)
            
        except Exception as exc:
            last_error = exc
            print(f"[generate_resume_draft] Attempt {attempt + 1} failed: {exc}")
            if attempt < max_retries - 1:
                time.sleep(1)
                continue

    print(f"[generate_resume_draft] All AI attempts failed, returning fallback. Last Error: {last_error}")
    return _get_fallback_resume(job_title, level, skills, education)


def generate_resume_draft(payload: Any) -> dict[str, Any]:
    source = payload.model_dump() if hasattr(payload, "model_dump") else dict(payload or {})
    job_title = _normalize_string(source.get("jobTitle"))
    level = _normalize_string(source.get("level"))
    skills = _normalize_string(source.get("skills"))
    education = _normalize_string(source.get("education"))
    current_summary = _normalize_string(source.get("currentSummary"))
    current_experience = _normalize_string(source.get("currentExperience"))
    current_projects = _normalize_string(source.get("currentProjects"))
    links = source.get("links", [])

    if not job_title:
        raise ResumeBuilderError("Job Title is required.")

    if level not in EXPERIENCE_LEVELS:
        raise ResumeBuilderError("Experience Level must be Junior, Mid, or Senior.")

    system_prompt = dedent(
        """
        You are an expert resume writer and ATS optimization specialist.

        Return ONLY valid JSON.
        Do NOT return markdown.
        Do NOT return explanations.
        Do NOT wrap the JSON in code fences.

        The JSON must match this exact shape:
        {
          "summary": "string",
          "skills": ["React", "Node.js", "SQL"],
          "education": [
            {
              "school": "string",
              "degree": "string",
              "gpa": "string",
              "startYear": "2020",
              "endYear": "2024"
            }
          ],
          "experience": [
            {
              "jobTitle": "string",
              "company": "string",
              "startDate": "2023",
              "endDate": "2024",
              "description": ["bullet 1", "bullet 2", "bullet 3"]
            }
          ],
          "projects": [
            {
              "name": "string",
              "technologies": ["React", "Node.js"],
              "link": "",
              "description": ["bullet 1", "bullet 2", "bullet 3"]
            }
          ]
        }

        Content rules:
        - Keep the summary professional, concise, and ATS-friendly.
        - Keep skills role-relevant.
        - Keep education concise and realistic based on the provided background.
        - Keep experience and projects realistic and grounded in the provided input.
        - Do not invent fake metrics or unrealistic employers.
        - Every description field must be an array of bullet strings, not a paragraph.
        - Always populate summary, skills, education, experience, and projects.
        """
    ).strip()
    fallback_resume = _get_fallback_resume(job_title, level, skills, education)
    max_retries = 2
    last_error = None

    for attempt in range(max_retries):
        try:
            response = _get_client().chat.completions.create(
                model=GENERATE_MODEL,
                temperature=0.4,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": _build_generate_prompt(
                            job_title,
                            level,
                            skills,
                            education,
                            links,
                            current_summary,
                            current_experience,
                            current_projects,
                        ),
                    },
                ],
                timeout=OPENAI_TIMEOUT_SECONDS,
            )

            output_text = _normalize_text(response.choices[0].message.content)
            if not output_text:
                raise ResumeBuilderError("The AI service returned an empty response.", 502)

            logger.info("[resume-generate] AI raw response: %s", _truncate_for_log(output_text, 2000))

            try:
                parsed_output = json.loads(output_text)
            except json.JSONDecodeError:
                logger.exception("[resume-generate] Failed to parse AI response as JSON. Returning fallback.")
                return fallback_resume

            logger.info("[resume-generate] Parsed JSON: %s", _truncate_for_log(parsed_output, 2000))
            normalized_output = _normalize_generated_resume(parsed_output, fallback_resume)
            logger.info("[resume-generate] Mapping result: %s", _truncate_for_log(normalized_output, 2000))
            return normalized_output

        except Exception as exc:
            last_error = exc
            logger.warning("[resume-generate] Attempt %s failed: %s", attempt + 1, exc, exc_info=True)
            if attempt < max_retries - 1:
                time.sleep(1)
                continue

    logger.warning("[resume-generate] All AI attempts failed. Returning fallback. Last error: %s", last_error)
    logger.info("[resume-generate] Mapping result: %s", _truncate_for_log(fallback_resume, 2000))
    return fallback_resume


def generate_summary_versions(payload: Any) -> list[dict[str, Any]]:
    source = payload.model_dump() if hasattr(payload, "model_dump") else dict(payload or {})
    job_title = _normalize_string(source.get("jobTitle"))
    summary_text = _normalize_text(source.get("summary"))
    skills = _normalize_summary_skills(source.get("skills"))
    experience_text = _normalize_summary_experience(source.get("experience"))
    job_description = ""  # Ignore job description for summary rewrite to keep it independent

    if not any([job_title, summary_text, skills, experience_text]):
        raise ResumeBuilderError("Summary, job title, skills, or experience is required to generate summaries.")

    request_payload = {
        "jobTitle": job_title,
        "summary": summary_text,
        "skills": skills,
        "experience": experience_text,
        "jobDescription": job_description,
    }
    optimized = bool(job_description)
    role_family = _detect_summary_role_family(
        job_title,
        summary_text,
        experience_text,
        job_description,
        " ".join(skills),
    )
    prioritized_keywords = _extract_priority_summary_keywords(
        job_title=job_title,
        job_description=job_description,
        summary_text=summary_text,
        experience_text=experience_text,
        skills=skills,
        role_family=role_family,
    )

    print("[resume-summary] Request received")
    print(f"[resume-summary] Payload: {_truncate_for_log(request_payload)}")

    latest_summaries: list[dict[str, Any]] = []
    latest_violations: dict[str, list[str]] = {}

    for attempt in range(SUMMARY_RETRY_LIMIT + 1):
        is_retry = attempt > 0
        try:
            print(f"[resume-summary] Sending to OpenAI with model={SUMMARY_MODEL} (attempt {attempt + 1})")
            if is_retry and latest_summaries:
                parsed_output = _request_summary_completion(
                    system_message="You repair resume summaries and return strict JSON only.",
                    user_prompt=_build_summary_repair_prompt(
                        job_title=job_title,
                        summary_text=summary_text,
                        skills=skills,
                        experience_text=experience_text,
                        job_description=job_description,
                        role_family=role_family,
                        prioritized_keywords=prioritized_keywords,
                        current_summaries=latest_summaries,
                        violations_by_id=latest_violations,
                        strict_retry=True,
                    ),
                    temperature=0.2,
                )
            else:
                parsed_output = _request_summary_completion(
                    system_message="You are an expert resume writer who returns strict JSON only and follows length rules exactly.",
                    user_prompt=_build_summary_generation_prompt(
                        job_title=job_title,
                        summary_text=summary_text,
                        skills=skills,
                        experience_text=experience_text,
                        job_description=job_description,
                        role_family=role_family,
                        prioritized_keywords=prioritized_keywords,
                        strict_retry=is_retry,
                    ),
                    temperature=0.45 if attempt == 0 else 0.25,
                )

            latest_summaries = _normalize_generated_summaries(parsed_output, optimized)
            latest_violations = _validate_generated_summaries(
                summaries=latest_summaries,
                job_title=job_title,
                skills=skills,
                prioritized_keywords=prioritized_keywords,
                role_family=role_family,
                job_description=job_description,
            )

            if not latest_violations:
                print(f"[resume-summary] Normalized summary versions: {_truncate_for_log(latest_summaries)}")
                return latest_summaries

            print(f"[resume-summary] Validation failed: {_truncate_for_log(latest_violations)}")
        except Exception as exc:
            latest_violations = {
                "general": [
                    getattr(exc, "message", None)
                    or str(exc)
                    or "Summary generation failed."
                ]
            }
            print(f"[resume-summary] Attempt {attempt + 1} failed: {latest_violations['general'][0]}")

    compressed_fallback = _build_summary_fallback_versions(
        summaries=latest_summaries,
        job_title=job_title,
        skills=skills,
        prioritized_keywords=prioritized_keywords,
        role_family=role_family,
        optimized=optimized,
    )

    print(f"[resume-summary] Using compressed fallback summaries: {_truncate_for_log(compressed_fallback)}")
    return compressed_fallback


def resolve_resume_user_id(raw_user_id: Any) -> int:
    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError) as exc:
        raise ResumeBuilderError("A valid userId is required for resume actions.", 400) from exc

    if user_id <= 0:
        raise ResumeBuilderError("A valid userId is required for resume actions.", 400)

    return user_id


def _normalize_section_input(section: Any, index: int) -> dict[str, Any] | None:
    source = section or {}
    section_type = _normalize_string(source.get("type"))
    built_in_definition = BUILT_IN_SECTION_LOOKUP.get(section_type)
    is_custom = section_type == "custom"

    if not built_in_definition and not is_custom:
        return None

    section_id = _normalize_string(source.get("id"))
    if not section_id and built_in_definition:
        section_id = built_in_definition["id"]
    if is_custom and not section_id:
        section_id = f"custom-{uuid4().hex[:12]}"

    title = _normalize_string(source.get("title"))
    if not title:
        title = built_in_definition["title"] if built_in_definition else "New Section"

    return {
        "id": section_id,
        "type": "custom" if is_custom else built_in_definition["type"],
        "title": title,
        "visible": source.get("visible") is not False,
        "sortOrder": index + 1,
    }


def _normalize_sections_payload(sections: Any) -> list[dict[str, Any]]:
    if not isinstance(sections, list):
        return []

    seen_ids: set[str] = set()
    normalized_sections: list[dict[str, Any]] = []

    for index, section in enumerate(sections):
        normalized = _normalize_section_input(section, index)
        if not normalized or normalized["id"] in seen_ids:
            continue
        seen_ids.add(normalized["id"])
        normalized_sections.append(normalized)

    return normalized_sections


def _normalize_personal_info(personal_info: Any) -> dict[str, Any]:
    source = personal_info or {}
    
    raw_links = source.get("links", [])
    if not isinstance(raw_links, list):
        raw_links = []
        
    links = []
    for link in raw_links:
        if isinstance(link, dict):
            links.append({
                "label": _normalize_string(link.get("label")),
                "url": _normalize_string(link.get("url"))
            })

    # Legacy fallback: convert old linkedin string to links array if links is empty
    legacy_linkedin = _normalize_string(source.get("linkedin"))
    if not links and legacy_linkedin:
        links.append({"label": "LinkedIn", "url": legacy_linkedin})

    return {
        "fullName": _normalize_string(source.get("fullName")),
        "email": _normalize_string(source.get("email")),
        "phone": _normalize_string(source.get("phone")),
        "location": _normalize_string(source.get("location")),
        "links": links,
    }


def _normalize_resume_array(items: Any, mapper: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    return [mapper(item or {}) for item in items]


def _normalize_resume_payload(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    source = payload or {}
    resume_data = source.get("resumeData") or {}
    selected_template = _normalize_string(
        resume_data.get("selected_template") or source.get("templateId"),
        "classic-ats",
    ) or "classic-ats"

    return {
        "sections": _normalize_sections_payload(source.get("sections")),
        "personalSectionDeleted": bool(source.get("personalSectionDeleted")),
        "resumeData": {
            "selected_template": selected_template,
            "personalInfo": _normalize_personal_info(
                resume_data.get("personalInfo") or source.get("personalInfo") or {},
            ),
            "summary": _normalize_string(resume_data.get("summary", source.get("summary", ""))),
            "education": _normalize_resume_array(
                resume_data.get("education", source.get("education", [])),
                lambda item: {
                    "universityName": _normalize_string(item.get("universityName")),
                    "degree": _normalize_string(item.get("degree")),
                    "gpa": _normalize_string(item.get("gpa")),
                    "startYear": _normalize_string(item.get("startYear")),
                    "endYear": _normalize_string(item.get("endYear")),
                },
            ),
            "experience": _normalize_resume_array(
                resume_data.get("experience", source.get("experience", [])),
                lambda item: {
                    "jobTitle": _normalize_string(item.get("jobTitle")),
                    "companyName": _normalize_string(item.get("companyName")),
                    "startDate": _normalize_string(item.get("startDate")),
                    "endDate": _normalize_string(item.get("endDate")),
                    "isPresent": _normalize_boolean(item.get("isPresent")),
                    "description": _normalize_string(item.get("description")),
                },
            ),
            "skills": _normalize_resume_array(
                resume_data.get("skills", source.get("skills", [])),
                lambda item: {"name": _normalize_string(item.get("name"))},
            ),
            "projects": _normalize_resume_array(
                resume_data.get("projects", source.get("projects", [])),
                lambda item: {
                    "name": _normalize_string(item.get("name")),
                    "link": _normalize_string(item.get("link")),
                    "description": _normalize_string(item.get("description")),
                    "technologies": _normalize_string(item.get("technologies")),
                },
            ),
            "certifications": _normalize_resume_array(
                resume_data.get("certifications", source.get("certifications", [])),
                lambda item: {
                    "name": _normalize_string(item.get("name")),
                    "provider": _normalize_string(item.get("provider")),
                    "year": _normalize_string(item.get("year")),
                },
            ),
            "languages": _normalize_resume_array(
                resume_data.get("languages", source.get("languages", [])),
                lambda item: {
                    "language": _normalize_string(item.get("language") or item.get("name")),
                    "level": _normalize_string(item.get("level") or item.get("proficiency")),
                },
            ),
            "customSections": [
                item
                for item in _normalize_resume_array(
                    resume_data.get("customSections", source.get("customSections", [])),
                    lambda item: {
                        "id": _normalize_string(item.get("id")),
                        "content": _normalize_string(item.get("content")),
                    },
                )
                if item["id"]
            ],
        },
        "templateId": selected_template,
        "jobContext": {
            "jobTitle": _normalize_string((source.get("jobContext") or {}).get("jobTitle")),
            "jobDescription": _normalize_string((source.get("jobContext") or {}).get("jobDescription")),
        },
        "aiGenerated": {
            "summary": bool((source.get("aiGenerated") or {}).get("summary")),
            "education": bool((source.get("aiGenerated") or {}).get("education")),
            "skills": bool((source.get("aiGenerated") or {}).get("skills")),
            "experience": bool((source.get("aiGenerated") or {}).get("experience")),
            "projects": bool((source.get("aiGenerated") or {}).get("projects")),
        },
        "optimizedSections": {
            "summary": bool((source.get("optimizedSections") or {}).get("summary")),
            "skills": bool((source.get("optimizedSections") or {}).get("skills")),
            "experience": bool((source.get("optimizedSections") or {}).get("experience")),
        },
    }


def _seed_resume_if_needed(connection: sqlite3.Connection, user_id: int) -> None:
    existing_count = connection.execute(
        "SELECT COUNT(*) AS count FROM resume_section_settings WHERE user_id = ?",
        (user_id,),
    ).fetchone()["count"]

    if not existing_count:
        connection.executemany(
            """
            INSERT INTO resume_section_settings (
              id,
              user_id,
              type,
              title,
              visible,
              sort_order,
              is_deleted,
              deleted_at,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, 1, ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            [
                (
                    section["id"],
                    user_id,
                    section["type"],
                    section["title"],
                    section["sortOrder"],
                )
                for section in BUILT_IN_SECTIONS
            ],
        )

    connection.execute(
        """
        INSERT INTO resume_personal_info (
          user_id,
          full_name,
          email,
          phone,
          location,
          linkedin,
          links_json,
          is_deleted,
          deleted_at,
          updated_at
        )
        VALUES (?, '', '', '', '', '', '[]', 0, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO NOTHING
        """,
        (user_id,),
    )
    connection.execute(
        """
        INSERT INTO resume_summary (user_id, content, is_deleted, deleted_at, updated_at)
        VALUES (?, '', 0, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO NOTHING
        """,
        (user_id,),
    )

    for table_name in (
        "resume_education",
        "resume_experience",
        "resume_skills",
        "resume_projects",
        "resume_certifications",
    ):
        connection.execute(
            f"""
            INSERT INTO {table_name} (user_id, items_json, is_deleted, deleted_at, updated_at)
            VALUES (?, '[]', 0, NULL, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO NOTHING
            """,
            (user_id,),
        )

    connection.execute(
        """
        INSERT INTO resume_preferences (
          user_id,
          template_id,
          job_title,
          job_description,
          ai_generated_json,
          optimized_sections_json,
          updated_at
        )
        VALUES (?, 'classic-ats', NULL, NULL, '{}', '{}', CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO NOTHING
        """,
        (user_id,),
    )


def _serialize_section_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "type": row["type"],
        "title": row["title"],
        "visible": bool(row["visible"]),
        "isDeleted": bool(row["is_deleted"]),
        "deletedAt": row["deleted_at"],
        "sortOrder": int(row["sort_order"] or 0),
    }


def _get_section_rows(
    connection: sqlite3.Connection,
    user_id: int,
    *,
    include_deleted: bool,
) -> list[dict[str, Any]]:
    deleted_clause = "" if include_deleted else "AND is_deleted = 0"
    rows = connection.execute(
        f"""
        SELECT id, type, title, visible, sort_order, is_deleted, deleted_at
        FROM resume_section_settings
        WHERE user_id = ?
          {deleted_clause}
        ORDER BY sort_order ASC, title COLLATE NOCASE ASC
        """,
        (user_id,),
    ).fetchall()
    return [_serialize_section_row(row) for row in rows]


def _get_array_table_items(connection: sqlite3.Connection, table_name: str, user_id: int) -> list[Any]:
    row = connection.execute(
        f"SELECT items_json, is_deleted FROM {table_name} WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if not row or bool(row["is_deleted"]):
        return []
    return _parse_json(row["items_json"], [])


def _get_custom_sections(
    connection: sqlite3.Connection,
    user_id: int,
    *,
    include_deleted: bool,
) -> list[dict[str, Any]]:
    deleted_clause = "" if include_deleted else "AND settings.is_deleted = 0"
    rows = connection.execute(
        f"""
        SELECT
          settings.id,
          settings.title,
          settings.visible,
          settings.sort_order,
          settings.is_deleted,
          settings.deleted_at,
          custom.content
        FROM resume_section_settings AS settings
        LEFT JOIN resume_custom_sections AS custom
          ON custom.user_id = settings.user_id
          AND custom.id = settings.id
        WHERE settings.user_id = ?
          AND settings.type = 'custom'
          {deleted_clause}
        ORDER BY settings.sort_order ASC, settings.title COLLATE NOCASE ASC
        """,
        (user_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "visible": bool(row["visible"]),
            "isDeleted": bool(row["is_deleted"]),
            "deletedAt": row["deleted_at"],
            "sortOrder": int(row["sort_order"] or 0),
            "content": row["content"] or "",
        }
        for row in rows
    ]


def _get_preferences(connection: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    row = connection.execute(
        """
        SELECT template_id, job_title, job_description, ai_generated_json, optimized_sections_json
        FROM resume_preferences
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        return {
            "template_id": "classic-ats",
            "job_title": None,
            "job_description": None,
            "ai_generated_json": "{}",
            "optimized_sections_json": "{}",
        }
    return dict(row)


def _get_personal_info(connection: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    row = connection.execute(
        "SELECT * FROM resume_personal_info WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if not row or bool(row["is_deleted"]):
        return {
            "fullName": "",
            "email": "",
            "phone": "",
            "location": "",
            "links": [],
        }
        
    links = _parse_json(row["links_json"], [])
    legacy_linkedin = row["linkedin"] or ""
    if not links and legacy_linkedin:
        links.append({"label": "LinkedIn", "url": legacy_linkedin})
        
    return {
        "fullName": row["full_name"] or "",
        "email": row["email"] or "",
        "phone": row["phone"] or "",
        "location": row["location"] or "",
        "links": links,
    }


def _get_summary(connection: sqlite3.Connection, user_id: int) -> str:
    row = connection.execute(
        "SELECT content, is_deleted FROM resume_summary WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if not row or bool(row["is_deleted"]):
        return ""
    return row["content"] or ""


def _upsert_section_setting(
    connection: sqlite3.Connection,
    user_id: int,
    section: dict[str, Any],
    *,
    sort_order: int | None = None,
    is_deleted: bool = False,
    deleted_at: str | None = None,
) -> None:
    connection.execute(
        """
        INSERT INTO resume_section_settings (
          id,
          user_id,
          type,
          title,
          visible,
          sort_order,
          is_deleted,
          deleted_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, id) DO UPDATE SET
          type = excluded.type,
          title = excluded.title,
          visible = excluded.visible,
          sort_order = excluded.sort_order,
          is_deleted = excluded.is_deleted,
          deleted_at = excluded.deleted_at,
          updated_at = CURRENT_TIMESTAMP
        """,
        (
            section["id"],
            user_id,
            section["type"],
            section["title"],
            1 if section.get("visible", True) else 0,
            sort_order if sort_order is not None else section.get("sortOrder", 0),
            1 if is_deleted else 0,
            deleted_at,
        ),
    )


def _upsert_personal_info(connection: sqlite3.Connection, user_id: int, personal_info: dict[str, Any]) -> None:
    links_json = json.dumps(personal_info.get("links", []))
    connection.execute(
        """
        INSERT INTO resume_personal_info (
          user_id,
          full_name,
          email,
          phone,
          location,
          linkedin,
          links_json,
          is_deleted,
          deleted_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, '', ?, 0, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          full_name = excluded.full_name,
          email = excluded.email,
          phone = excluded.phone,
          location = excluded.location,
          links_json = excluded.links_json,
          is_deleted = 0,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        """,
        (
            user_id,
            personal_info["fullName"],
            personal_info["email"],
            personal_info["phone"],
            personal_info["location"],
            links_json,
        ),
    )


def _upsert_text_section(connection: sqlite3.Connection, table_name: str, user_id: int, content: str) -> None:
    connection.execute(
        f"""
        INSERT INTO {table_name} (user_id, content, is_deleted, deleted_at, updated_at)
        VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          content = excluded.content,
          is_deleted = 0,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        """,
        (user_id, content),
    )


def _upsert_array_section(
    connection: sqlite3.Connection,
    table_name: str,
    user_id: int,
    items: list[dict[str, Any]],
) -> None:
    connection.execute(
        f"""
        INSERT INTO {table_name} (user_id, items_json, is_deleted, deleted_at, updated_at)
        VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          items_json = excluded.items_json,
          is_deleted = 0,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        """,
        (user_id, json.dumps(items)),
    )


def _upsert_custom_section(
    connection: sqlite3.Connection,
    user_id: int,
    section_config: dict[str, Any],
    content: str,
) -> None:
    _upsert_section_setting(
        connection,
        user_id,
        section_config,
        sort_order=section_config.get("sortOrder", 0),
        is_deleted=False,
        deleted_at=None,
    )
    connection.execute(
        """
        INSERT INTO resume_custom_sections (
          id,
          user_id,
          content,
          is_deleted,
          deleted_at,
          updated_at
        )
        VALUES (?, ?, ?, 0, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, id) DO UPDATE SET
          content = excluded.content,
          is_deleted = 0,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        """,
        (section_config["id"], user_id, content),
    )


def _upsert_preferences(connection: sqlite3.Connection, user_id: int, payload: dict[str, Any]) -> None:
    connection.execute(
        """
        INSERT INTO resume_preferences (
          user_id,
          template_id,
          job_title,
          job_description,
          ai_generated_json,
          optimized_sections_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          template_id = excluded.template_id,
          job_title = excluded.job_title,
          job_description = excluded.job_description,
          ai_generated_json = excluded.ai_generated_json,
          optimized_sections_json = excluded.optimized_sections_json,
          updated_at = CURRENT_TIMESTAMP
        """,
        (
            user_id,
            payload["templateId"],
            _normalize_nullable_text(payload["jobContext"]["jobTitle"]),
            _normalize_nullable_text(payload["jobContext"]["jobDescription"]),
            json.dumps(payload["aiGenerated"]),
            json.dumps(payload["optimizedSections"]),
        ),
    )


def _resolve_section_for_action(
    connection: sqlite3.Connection,
    user_id: int,
    section_key: str,
) -> dict[str, Any]:
    if section_key == "personal":
        return {
            "id": "personal",
            "type": "personal",
            "title": "Personal Information",
        }

    row = connection.execute(
        """
        SELECT id, type, title
        FROM resume_section_settings
        WHERE user_id = ?
          AND (id = ? OR type = ?)
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
        LIMIT 1
        """,
        (user_id, section_key, section_key, section_key),
    ).fetchone()
    if not row:
        raise ResumeBuilderError("Section not found.", 404)
    return dict(row)


def _mark_section_deleted(
    connection: sqlite3.Connection,
    user_id: int,
    section: dict[str, Any],
    next_deleted_state: bool,
) -> dict[str, Any]:
    deleted_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z") if next_deleted_state else None

    if section["type"] == "personal":
        connection.execute(
            """
            UPDATE resume_personal_info
            SET is_deleted = ?, deleted_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (1 if next_deleted_state else 0, deleted_at, user_id),
        )
    elif section["type"] == "custom":
        connection.execute(
            """
            UPDATE resume_custom_sections
            SET is_deleted = ?, deleted_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND id = ?
            """,
            (1 if next_deleted_state else 0, deleted_at, user_id, section["id"]),
        )
    elif section["type"] == "summary":
        connection.execute(
            """
            UPDATE resume_summary
            SET is_deleted = ?, deleted_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (1 if next_deleted_state else 0, deleted_at, user_id),
        )
    else:
        table_name = SECTION_TABLES.get(section["type"])
        if not table_name:
            raise ResumeBuilderError("Section type is not supported.", 400)
        connection.execute(
            f"""
            UPDATE {table_name}
            SET is_deleted = ?, deleted_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (1 if next_deleted_state else 0, deleted_at, user_id),
        )

    connection.execute(
        """
        UPDATE resume_section_settings
        SET is_deleted = ?, deleted_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND id = ?
        """,
        (1 if next_deleted_state else 0, deleted_at, user_id, section["id"]),
    )

    return {
        **section,
        "isDeleted": next_deleted_state,
        "deletedAt": deleted_at,
    }


def get_resume_builder_state(user_id: int) -> dict[str, Any]:
    with _connect() as connection:
        _seed_resume_if_needed(connection, user_id)
        active_sections = [
            section
            for section in _get_section_rows(connection, user_id, include_deleted=False)
            if section["type"] != "personal"
        ]
        deleted_sections = [
            section
            for section in _get_section_rows(connection, user_id, include_deleted=True)
            if section["isDeleted"]
        ]
        preferences = _get_preferences(connection, user_id)
        custom_sections = _get_custom_sections(connection, user_id, include_deleted=False)

        return {
            "sections": [
                {
                    "id": section["id"],
                    "type": section["type"],
                    "title": section["title"],
                    "visible": section["visible"],
                    "sortOrder": section["sortOrder"],
                }
                for section in active_sections
            ],
            "deletedSections": [
                {
                    "id": section["id"],
                    "type": section["type"],
                    "title": section["title"],
                    "deletedAt": section["deletedAt"],
                }
                for section in deleted_sections
            ],
            "personalSectionDeleted": any(section["type"] == "personal" for section in deleted_sections),
            "resumeData": {
                "selected_template": preferences["template_id"] or "classic-ats",
                "personalInfo": _get_personal_info(connection, user_id),
                "summary": _get_summary(connection, user_id),
                "education": _get_array_table_items(connection, "resume_education", user_id),
                "experience": _get_array_table_items(connection, "resume_experience", user_id),
                "skills": _get_array_table_items(connection, "resume_skills", user_id),
                "projects": _get_array_table_items(connection, "resume_projects", user_id),
                "certifications": _get_array_table_items(connection, "resume_certifications", user_id),
                "languages": _get_array_table_items(connection, "resume_languages", user_id),
                "customSections": [
                    {
                        "id": section["id"],
                        "content": section["content"],
                    }
                    for section in custom_sections
                ],
            },
            "templateId": preferences["template_id"] or "classic-ats",
            "jobContext": {
                "jobTitle": preferences["job_title"] or "",
                "jobDescription": preferences["job_description"] or "",
            },
            "aiGenerated": _parse_json(
                preferences["ai_generated_json"],
                {"summary": False, "education": False, "skills": False, "experience": False, "projects": False},
            ),
            "optimizedSections": _parse_json(
                preferences["optimized_sections_json"],
                {"summary": False, "skills": False, "experience": False},
            ),
        }


def save_resume_builder_state(user_id: int, raw_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = _normalize_resume_payload(raw_payload)

    with _connect() as connection:
        _seed_resume_if_needed(connection, user_id)
        with connection:
            if not payload["personalSectionDeleted"]:
                _upsert_section_setting(connection, user_id, BUILT_IN_SECTION_LOOKUP["personal"])
                _upsert_personal_info(connection, user_id, payload["resumeData"]["personalInfo"])

            active_built_in_types = {
                section["type"]
                for section in payload["sections"]
                if section["type"] != "custom"
            }
            active_custom_section_ids = {
                section["id"]
                for section in payload["sections"]
                if section["type"] == "custom"
            }

            for section in payload["sections"]:
                _upsert_section_setting(
                    connection,
                    user_id,
                    section,
                    sort_order=section["sortOrder"],
                    is_deleted=False,
                    deleted_at=None,
                )

            if "summary" in active_built_in_types:
                _upsert_text_section(connection, "resume_summary", user_id, payload["resumeData"]["summary"])
            if "education" in active_built_in_types:
                _upsert_array_section(connection, "resume_education", user_id, payload["resumeData"]["education"])
            if "experience" in active_built_in_types:
                _upsert_array_section(connection, "resume_experience", user_id, payload["resumeData"]["experience"])
            if "skills" in active_built_in_types:
                _upsert_array_section(connection, "resume_skills", user_id, payload["resumeData"]["skills"])
            if "projects" in active_built_in_types:
                _upsert_array_section(connection, "resume_projects", user_id, payload["resumeData"]["projects"])
            if "certifications" in active_built_in_types:
                _upsert_array_section(
                    connection,
                    "resume_certifications",
                    user_id,
                    payload["resumeData"]["certifications"],
                )
            if "languages" in active_built_in_types:
                _upsert_array_section(
                    connection,
                    "resume_languages",
                    user_id,
                    payload["resumeData"]["languages"],
                )

            for index, custom_section in enumerate(payload["resumeData"]["customSections"]):
                if custom_section["id"] not in active_custom_section_ids:
                    continue

                section_config = next(
                    (
                        section
                        for section in payload["sections"]
                        if section["id"] == custom_section["id"]
                    ),
                    {
                        "id": custom_section["id"],
                        "type": "custom",
                        "title": "Custom Section",
                        "visible": True,
                        "sortOrder": len(payload["sections"]) + index + 1,
                    },
                )
                _upsert_custom_section(connection, user_id, section_config, custom_section["content"])

            _upsert_preferences(connection, user_id, payload)

    return get_resume_builder_state(user_id)


def soft_delete_resume_section(user_id: int, section_key: str) -> dict[str, Any]:
    with _connect() as connection:
        _seed_resume_if_needed(connection, user_id)
        with connection:
            section = _resolve_section_for_action(connection, user_id, section_key)
            return _mark_section_deleted(connection, user_id, section, True)


def restore_resume_section(user_id: int, section_key: str) -> dict[str, Any]:
    with _connect() as connection:
        _seed_resume_if_needed(connection, user_id)
        with connection:
            section = _resolve_section_for_action(connection, user_id, section_key)
            return _mark_section_deleted(connection, user_id, section, False)


def get_deleted_resume_sections(user_id: int) -> list[dict[str, Any]]:
    with _connect() as connection:
        _seed_resume_if_needed(connection, user_id)
        return [
            {
                "id": section["id"],
                "type": section["type"],
                "title": section["title"],
                "deletedAt": section["deletedAt"],
            }
            for section in _get_section_rows(connection, user_id, include_deleted=True)
            if section["isDeleted"]
        ]


_init_database()
