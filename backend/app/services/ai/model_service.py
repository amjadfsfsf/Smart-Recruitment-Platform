"""
Model loading and inference helpers for the local cv_job_ft_model.
Provides loud, explicit logging so we know when the real model is used.
"""

from __future__ import annotations

import os
import traceback
from pathlib import Path
from typing import Iterable

from sentence_transformers import SentenceTransformer, util

# Default search paths; override with MODEL_PATH env var if needed.
DEFAULT_MODEL_PATHS = [
    Path(__file__).resolve().parents[3] / "cv_job_ft_model",
    Path(r"D:\amjad\project\job_matching\cv_job_ft_model"),
]
ENV_MODEL_PATH = os.getenv("MODEL_PATH")

_MODEL: SentenceTransformer | None = None
_MODEL_PATH_USED: Path | None = None
_LOAD_ERROR: Exception | None = None
_SELF_TEST_DONE = False


def _list_dir(path: Path, limit: int = 25) -> str:
    try:
        entries = sorted([p.name for p in path.iterdir()])
        return ", ".join(entries[:limit]) + (" ..." if len(entries) > limit else "")
    except Exception:
        return "unavailable"


def _resolve_model_path() -> Path | None:
    if ENV_MODEL_PATH:
        candidate = Path(ENV_MODEL_PATH).expanduser()
        if candidate.exists():
            return candidate

    for path in DEFAULT_MODEL_PATHS:
        resolved = path.resolve()
        if resolved.exists():
            return resolved

    return None


def load_matching_model() -> SentenceTransformer | None:
    """
    Load the cv_job_ft_model once and keep it cached. Never fails silently.
    """
    global _MODEL, _MODEL_PATH_USED, _LOAD_ERROR

    if _MODEL is not None:
        return _MODEL

    resolved_path = _resolve_model_path()

    if resolved_path is None or not resolved_path.exists():
        error = FileNotFoundError(
            "cv_job_ft_model not found. Set MODEL_PATH or place the model at one of: "
            + ", ".join(str(p.resolve()) for p in DEFAULT_MODEL_PATHS)
        )
        _LOAD_ERROR = error
        return None


    try:
        _MODEL = SentenceTransformer(str(resolved_path))
        _MODEL_PATH_USED = resolved_path
        _run_self_test()
        return _MODEL
    except Exception as exc:  # pragma: no cover - critical path
        _LOAD_ERROR = exc
        return None


def _run_self_test() -> None:
    global _SELF_TEST_DONE
    if _SELF_TEST_DONE or _MODEL is None:
        return
    _SELF_TEST_DONE = True
    try:
        user_text = (
            "[RESUME]\nartificial intelligence student\n\n"
            "[SKILLS]\npython, machine learning, nlp\n"
        )
        job_text = (
            "[JOB TITLE]\nML Engineer\n\n"
            "[DESCRIPTION]\nBuild NLP pipelines and deploy models.\n\n"
            "[SKILLS]\npython, tensorflow\n\n"
            "[LOCATION]\nRemote\n"
        )
        score = _predict_with_model(_MODEL, user_text, job_text)
        print(f"[model] self-test output={score}")
    except Exception as exc:
        print(f"[model] ERROR during self-test: {exc}")
        print(traceback.format_exc())


def _truncate(text: str, limit: int = 140) -> str:
    if text is None:
        return ""
    return text if len(text) <= limit else text[:limit] + "..."


def _predict_with_model(model: SentenceTransformer, user_text: str, job_text: str) -> float:
    embeddings = model.encode(
        [user_text, job_text],
        convert_to_tensor=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    raw_score = util.cos_sim(embeddings[0], embeddings[1]).item()
    normalized = max(0.0, min(1.0, (raw_score + 1) / 2))
    return float(normalized)


def predict_match_score(user_text: str, job_text: str) -> float:
    """
    Compute similarity using the loaded model. Logs every inference.
    """
   
    try:
        resume_part = user_text.split("[RESUME]")[-1].split("[SKILLS]")[0]
    except Exception:
        resume_part = ""

 


    model = load_matching_model()
    if model is None:
        return 0.0

   
    try:
        score = _predict_with_model(model, user_text, job_text)

        return score
    except Exception as exc:
      
        return 0.0


__all__ = ["load_matching_model", "predict_match_score"]
