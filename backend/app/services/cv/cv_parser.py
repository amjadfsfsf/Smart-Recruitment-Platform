from __future__ import annotations

import logging
import re
from typing import Iterable, List, Optional

import pdfplumber
import spacy

from app.services.jobs.role_utils import infer_desired_job_title

logger = logging.getLogger(__name__)
SKILL_SPLIT_PATTERN = re.compile(r"[\n,;/|•]+")


def _safe_load_summarizer():
    """
    Lazy import of transformers pipeline. If anything fails (no model, missing torch, etc.),
    we degrade gracefully and return None.
    """
    try:
        from transformers import pipeline

        return pipeline("summarization", device=-1, model="facebook/bart-large-cnn")
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("Falling back to simple summary because transformer pipeline is unavailable: %s", exc)
        return None


class CVParser:
    """
    CV parsing helper adapted from the provided reference class. It keeps the same core
    extraction helpers but adds resilience (fallbacks, safe defaults, paths) for API use.
    """

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.text = self.read_cv(file_path)
        self.email = self.extract_email()

        self.nlp = self._load_nlp()
        self.summarizer = _safe_load_summarizer()

    # ----------------------------
    # Loading helpers
    # ----------------------------
    def _load_nlp(self):
        try:
            return spacy.load("en_core_web_sm")
        except Exception:  # pragma: no cover - model might be missing in some environments
            logger.warning("spaCy model en_core_web_sm not found; using blank English model.")
            return spacy.blank("en")

    # ----------------------------
    # Base reference methods (adapted)
    # ----------------------------
    def read_cv(self, file: str) -> str:
        text = ""
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text

    def extract_email(self) -> Optional[str]:
        emails = re.findall(r"\S+@\S+", self.text)
        return emails[0] if emails else None

    def education_matches(self) -> list[str]:
        return re.findall(r"(Bachelor|Master|BSc|MSc|PhD|Diploma|High School).*?(?:\d{4}.*?\d{4})?", self.text, re.IGNORECASE)

    def extract_skill_section(self, text: str) -> str:
        pattern = r"(technical skills|skills|tools)(.*?)(education|projects|experience)"
        match = re.search(pattern, text.lower(), re.DOTALL)
        if match:
            return match.group(2)
        return ""

    def clean_skills(self, skills: Iterable[str]) -> list[str]:
        bad_words = {
            "tools",
            "tool",
            "skills",
            "technical",
            "experience",
            "project",
            "projects",
            "location",
            "e.g",
        }

        clean = []
        for skill in skills:
            skill = skill.strip().lower()
            skill = re.sub(r"[^a-zA-Z0-9\-\+\. ]", "", skill)
            if skill in bad_words or not skill:
                continue
            clean.append(skill)
        return clean

    def _extract_skill_candidates(self, text: str) -> list[str]:
        candidates: list[str] = []

        for fragment in SKILL_SPLIT_PATTERN.split(text):
            cleaned = fragment.strip().lower()
            cleaned = re.sub(r"^[\-\*\u2022]+", "", cleaned).strip()
            cleaned = re.sub(r"[^a-zA-Z0-9\-\+\.# ]", "", cleaned)
            cleaned = re.sub(
                r"^(experience with|experience in|proficiency in|knowledge of|familiarity with)\s+",
                "",
                cleaned,
            )
            cleaned = " ".join(cleaned.split())
            if not cleaned:
                continue

            if " and " in cleaned and cleaned.count(" and ") == 1 and len(cleaned.split()) <= 6:
                candidates.extend(part.strip() for part in cleaned.split(" and ") if part.strip())
                continue

            if len(cleaned.split()) <= 4 and len(cleaned) <= 40:
                candidates.append(cleaned)

        return candidates

    def Skills_Extraction(self) -> list[str]:
        if not self.text:
            return []

        section_text = self.extract_skill_section(self.text)
        candidate_source = section_text or self.text
        found_skills = self._extract_skill_candidates(candidate_source)
        if not found_skills and section_text != self.text:
            found_skills = self._extract_skill_candidates(self.text)

        return sorted(set(self.clean_skills(found_skills)))

    def extract_summary_section(self):
        start_headers = [
            "professional summary",
            "summary",
            "profile",
            "about me",
            "about",
            "objective",
            "career objective",
            "personal statement",
            "professional profile",
        ]
        end_headers = [
            "work experience",
            "experience",
            "education",
            "skills",
            "projects",
            "certifications",
            "languages",
            "employment history",
            "internships",
            "training",
            "volunteering",
            "qualifications",
        ]
        start_pattern = "|".join(re.escape(h) for h in start_headers)
        end_pattern = "|".join(re.escape(h) for h in end_headers)
        pattern = rf"""
            ^\s*(?:{start_pattern})\s*$      
            (.*?)                           
            (?=^\s*(?:{end_pattern})\s*$|\Z)
        """
        match = re.search(pattern, self.text, re.IGNORECASE | re.DOTALL | re.MULTILINE | re.VERBOSE)
        if match:
            return match.group(1).strip(), True

        return self.text[:500], False

    def clean_text(self, text: str) -> str:
        text = re.sub(r"\S+@\S+", " ", text)
        text = re.sub(r"http\S+|www\S+", " ", text)
        text = re.sub(r"\b\d{7,}\b", " ", text)
        text = re.sub(r"[^a-zA-Z0-9\.\,\-\+\#\s]", " ", text)
        text = re.sub(r"(.)\1{2,}", r"\1\1", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    def remove_sections(self, text: str) -> str:
        sections = [
            "education",
            "experience",
            "skills",
            "projects",
            "summary",
            "contact",
        ]

        for sec in sections:
            text = re.sub(sec, " ", text, flags=re.IGNORECASE)

        return text

    def summarize_long_text(self, text: str, chunk_size: int = 800) -> str:
        if not self.summarizer:
            return text[:500]

        chunks = [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]
        summaries = []
        for chunk in chunks:
            try:
                summary = self.summarizer(chunk, max_length=120, min_length=30)
                summaries.append(summary[0]["summary_text"])
            except Exception as exc:  # pragma: no cover - fallback
                logger.warning("Summarizer chunk failed: %s", exc)
                summaries.append(chunk[:200])

        return " ".join(summaries)

    def Summarizer(self) -> str:
        if not self.text:
            return ""

        text, is_summary = self.extract_summary_section()
        text = self.clean_text(text)
        if is_summary:
            return text

        text = self.remove_sections(text)
        summary = self.summarize_long_text(text)
        return summary

    # ----------------------------
    # Additional helpers for API response
    # ----------------------------
    def extract_name(self) -> Optional[str]:
        if not self.text:
            return None
        doc = self.nlp(self.text[:500])
        candidates = [
            ent.text.strip()
            for ent in getattr(doc, "ents", [])
            if ent.label_ == "PERSON" and 2 <= len(ent.text.split()) <= 4
        ]
        if candidates:
            return candidates[0]

        for line in self.text.splitlines():
            cleaned = line.strip()
            if not cleaned or len(cleaned.split()) > 5:
                continue
            if 4 <= len(cleaned) <= 60:
                return cleaned
        return None

   

    def extract_experience_level(self) -> Optional[str]:
        text_lower = self.text.lower()
        mapping = [
            ("senior", "Senior"),
            ("lead", "Senior"),
            ("mid-level", "Mid-Level"),
            ("mid level", "Mid-Level"),
            ("midlevel", "Mid-Level"),
            ("junior", "Junior"),
            ("entry level", "Entry-Level"),
            ("intern", "Entry-Level"),
        ]
        for key, value in mapping:
            if key in text_lower:
                return value
        return None
        
    def education(self):
        matches = re.findall(r"(Bachelor|Master|BSc|MSc).*?(?:\d{4}.*?\d{4})", self.text, re.IGNORECASE)

        if not matches:
            return ""

        level = matches[0].lower()

        if "bachelor" in level or "bsc" in level:
            return "Bachelor"
        if "master" in level or "msc" in level:
            return "Master"

        return ""

    def to_response(self) -> dict:
        summary = self.Summarizer() or ""
        return {
            "full_name": self.extract_name() or "",
            "email": self.email or "",
            "experience_level": self.education() or "",
            "desired_job_title": infer_desired_job_title(summary, default=""),
            "target_role": summary,
            "skills": self.Skills_Extraction(),
            "summary": summary,
        }
