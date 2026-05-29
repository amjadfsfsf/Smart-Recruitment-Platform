import os
import json
import time
import uuid
import subprocess
import logging
import re
import traceback
from typing import Optional, Dict, Any, List
from datetime import datetime
from pathlib import Path
from collections import Counter
import cv2
import numpy as np
import mediapipe as mp
from dotenv import load_dotenv

from openai import OpenAI, OpenAIError
from app.services.interview.transcribe import AudioPipelineService
from app.services.interview.speech import SpeakingAssessment
from app.services.face_processing.face import VideoBehaviorAssessment
from app.services.media.ffmpeg_utils import resolve_ffmpeg_path

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

SUPPORTED_LANGUAGES = {
    "en": {
        "label": "English",
        "azure_locale": "en-US",
        "tts_lang": "en",
    },
    "ar": {
        "label": "Arabic",
        "azure_locale": "ar-SA",
        "tts_lang": "ar",
    },
}
DEFAULT_LANGUAGE = "en"

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

class InterviewService:
    def __init__(
        self,
        base_upload_dir: str = "uploads",
        speech_assessment: Optional[SpeakingAssessment] = None,
        video_assessment: Optional[VideoBehaviorAssessment] = None,
        audio_pipeline: Optional[AudioPipelineService] = None,
    ):
        api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY environment variable is not set.")

        try:
            self.client = OpenAI(api_key=api_key)
        except Exception:
            traceback.print_exc()
            raise
        self.model = "gpt-4o"
        print(f"[InterviewService] OpenAI client initialized with model={self.model}")

        default_lang_meta = SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE]
        self.audio = audio_pipeline or AudioPipelineService(
            default_locale=default_lang_meta["azure_locale"],
            default_tts_lang=default_lang_meta["tts_lang"],
        )
        self.speech = speech_assessment or SpeakingAssessment(language=default_lang_meta["azure_locale"])
        self.video = video_assessment or VideoBehaviorAssessment()
        self.base_upload_dir = base_upload_dir
        self.ffmpeg_path = resolve_ffmpeg_path()
        self.sessions = {}
        
    def _resolve_language(self, language: Optional[str] = None, speech_locale: Optional[str] = None) -> Dict[str, str]:
        code = (language or DEFAULT_LANGUAGE).lower()
        meta = SUPPORTED_LANGUAGES.get(code, SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE])
        return {
            "language": code,
            "azure_locale": speech_locale or meta["azure_locale"],
            "tts_lang": meta["tts_lang"],
            "label": meta["label"],
        }

    def generate_question(
        self,
        interview_type=None,
        experience_level=None,
        desired_job_title=None,
        target_role=None,
        field_of_study=None,
        skills=None,
        previous_questions: Optional[List[str]] = None,
        language: Optional[str] = None,
    ):
        lang_meta = self._resolve_language(language)
        lang_label = "Arabic" if lang_meta["language"] == "ar" else "English"
        interview_type = interview_type or "general"
        experience_level = experience_level or "Entry-Level"
        desired_job_title = desired_job_title or "Data Analyst"
        target_role = target_role or "No additional career context provided."
        field_of_study = field_of_study or "a relevant field"
        skills = skills or []
        if isinstance(skills, str):
            skills_text = skills
        else:
            skills_text = ", ".join(skills)
        previous_questions = previous_questions or []
        prev_text = "\n".join(f"- {q}" for q in previous_questions) if previous_questions else "None provided."

        system_prompt = (
            "You are a professional job interviewer.\n"
            f"Your task is to generate exactly ONE realistic interview question in {lang_label}.\n"
            "The question must be tailored to the candidate's profile.\n\n"
            "Rules:\n"
            "- Return exactly one interview question only.\n"
            "- Do not include explanations, numbering, headings, or multiple questions.\n"
            "- The tone should be natural, professional, and suitable for a real interview.\n"
            "- Adapt the difficulty to the candidate's experience level.\n"
            "- Use desired_job_title as the main interview role.\n"
            "- Use target_role only as additional context about the candidate's interests and direction.\n"
            "- Adapt the topic to the candidate's desired job title, field of study, skills, and context.\n"
            "- Prefer questions that assess practical understanding, problem-solving, and job relevance.\n"
            "- Avoid repeating any previously asked questions in this interview session.\n"
            f"- All output must stay strictly in {lang_label}; do not mix languages or transliterations.\n"
        )

        user_prompt = (
            f"Interview type: {interview_type}\n"
            f"Experience level: {experience_level}\n"
            f"Desired job title: {desired_job_title}\n"
            f"Field of study: {field_of_study}\n"
            f"Skills: {skills_text}\n"
            f"Target role context: {target_role}\n"
            f"Previous questions (do not repeat):\n{prev_text}\n\n"
            f"Generate exactly one interview question in {lang_label} that matches this candidate.\n"
            "If the candidate is beginner or entry-level, make the question simpler and more foundational.\n"
            "If the candidate is junior or above, make the question a bit more practical and role-focused.\n"
            "The question must be directly relevant to the desired job title."
        )
        logger.info(
            "[generate_question] type=%s level=%s desired_job_title=%s field=%s skills=%s prev_count=%d",
            interview_type,
            experience_level,
            desired_job_title,
            field_of_study,
            skills_text,
            len(previous_questions),
        )

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {"role": "user", "content": user_prompt},
            ],
             temperature=1.1,
             max_tokens=80,
        )
        print(response.choices[0].message.content)
        return (response.choices[0].message.content or "").strip()
      


    def ask_question(
        self,
        interview_type=None,
        experience_level=None,
        desired_job_title=None,
        target_role=None,
        field_of_study=None,
        skills=None,
        previous_questions: Optional[List[str]] = None,
        language: Optional[str] = None,
    ):
        lang_meta = self._resolve_language(language)
        question = self.generate_question(
            interview_type=interview_type,
            experience_level=experience_level,
            desired_job_title=desired_job_title,
            target_role=target_role,
            field_of_study=field_of_study,
            skills=skills,
            previous_questions=previous_questions,
            language=lang_meta["language"],
        )
        print("Question:", question)

        audio_path = self.audio.text_to_audio(question, lang=lang_meta["tts_lang"])

        audio_url = "/" + audio_path.replace("\\", "/")

        return {
            "question": question,
            "audio_url": audio_url,
            "language": lang_meta["language"],
            "speechLocale": lang_meta["azure_locale"],
        }

    def _session_dir(self, session_id: str) -> str:
        return os.path.join(self.base_upload_dir, "interview", session_id)

    def _metadata_path(self, session_id: str) -> str:
        return os.path.join(self._session_dir(session_id), "metadata.json")

    def _load_session(self, session_id: str):
        metadata_path = self._metadata_path(session_id)
        if os.path.exists(metadata_path):
            with open(metadata_path, "r", encoding="utf-8") as f:
                session = json.load(f)
                self.sessions[session_id] = session
                return session
        return None

    def _persist_session(self, session_id: str, session: dict):
        os.makedirs(self._session_dir(session_id), exist_ok=True)
        with open(self._metadata_path(session_id), "w", encoding="utf-8") as f:
            json.dump(session, f, indent=2)

    def _get_session(self, session_id: str):
        return self.sessions.get(session_id) or self._load_session(session_id)

    def _validate_video_duration(self, video_path: str):
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Missing video: {video_path}")

        cap = cv2.VideoCapture(video_path)
        try:
            if not cap.isOpened():
                raise ValueError(f"Unable to open video for duration check: {video_path}")
            fps = cap.get(cv2.CAP_PROP_FPS) or 0
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
            duration = (frame_count / fps) if fps and frame_count else 0
        finally:
            cap.release()

        if duration <= 0:
            raise ValueError(f"Invalid video duration detected for {video_path}")

        return duration

    def _mark_processing_started(self, session_id: str, session: dict):
        session["processingComplete"] = False
        session["processingStartedAt"] = datetime.utcnow().isoformat() + "Z"
        session["status"] = "processing"
        session["phase"] = "processing_started"
        logger.info("Processing started for session %s", session_id)
        self._persist_session(session_id, session)
        self.sessions[session_id] = session

    def _mark_processing_completed(self, session_id: str, session: dict, final_video_path: str, durations: dict):
        session["processingComplete"] = True
        session["processingCompletedAt"] = datetime.utcnow().isoformat() + "Z"
        session["status"] = "ready_for_analysis"
        session["phase"] = "ready_for_analysis"
        session["finalVideo"] = final_video_path
        session["durations"] = durations
        logger.info("Processing completed for session %s", session_id)
        self._persist_session(session_id, session)
        self.sessions[session_id] = session

    def _ensure_processing_complete_guard(self, session: dict):
        if not session.get("processingComplete"):
            raise ValueError("Analysis cannot run before processing is complete")

    def _set_analysis_status(self, session_id: str, session: dict, status: str, error: Optional[str] = None):
        session.setdefault("analysis", {})
        session["analysis"]["status"] = status
        session["analysis"]["error"] = error
        timestamp_field = "analysisStartedAt" if status == "running" else "analysisCompletedAt" if status == "completed" else "analysisUpdatedAt"
        session["analysis"][timestamp_field] = datetime.utcnow().isoformat() + "Z"
        self._persist_session(session_id, session)
        self.sessions[session_id] = session

    def start_interview(
        self,
        total_questions: int = 4,
        interview_type=None,
        experience_level=None,
        desired_job_title=None,
        target_role=None,
        field_of_study=None,
        skills=None,
        previous_questions: Optional[List[str]] = None,
        language: Optional[str] = None,
        speech_locale: Optional[str] = None,
        custom_questions: Optional[List[Dict[str, Any]]] = None,
        company_interview_session_id: Optional[int] = None,
    ):
        print(f"[InterviewService] start_interview total_questions={total_questions}")
        logger.info(
            "[start_interview] type=%s level=%s desired_job_title=%s field=%s skills=%s",
            interview_type,
            experience_level,
            desired_job_title,
            field_of_study,
            skills,
        )
        lang_meta = self._resolve_language(language, speech_locale)
        self.audio.set_locale(lang_meta["azure_locale"], lang_meta["tts_lang"])
        self.speech.set_language(lang_meta["azure_locale"])

        session_id = str(uuid.uuid4())
        questions = []
        previous_questions = list(previous_questions or [])
        custom_questions = list(custom_questions or [])
        if custom_questions:
            total_questions = len(custom_questions)

        for idx in range(total_questions):
            custom_question = custom_questions[idx] if idx < len(custom_questions) else None
            if custom_question:
                question_text = (
                    custom_question.get("question_text")
                    or custom_question.get("questionText")
                    or custom_question.get("text")
                    or ""
                ).strip()
            else:
                question_text = self.generate_question(
                    interview_type=interview_type,
                    experience_level=experience_level,
                    desired_job_title=desired_job_title,
                    target_role=target_role,
                    field_of_study=field_of_study,
                    skills=skills,
                    previous_questions=previous_questions,
                    language=lang_meta["language"],
                )
                previous_questions.append(question_text)

            if not question_text:
                raise ValueError("Interview question text is required")

            audio_filename = f"question_{idx + 1}.mp3"
            audio_output_dir = os.path.join(
                self.base_upload_dir, "interview", session_id, "questions"
            )
            audio_path = self.audio.text_to_audio(
                question_text, filename=audio_filename, output_dir=audio_output_dir, lang=lang_meta["tts_lang"]
            )
            audio_url = "/" + audio_path.replace("\\", "/")

            questions.append(
                {
                    "index": idx + 1,
                    "questionText": question_text,
                    "audioPath": audio_path,
                    "audioUrl": audio_url,
                    "source": "company" if custom_question else "ai",
                    "questionId": custom_question.get("id") if custom_question else None,
                    "category": custom_question.get("category") if custom_question else None,
                    "difficulty": custom_question.get("difficulty") if custom_question else None,
                    "expectedAnswerKeywords": custom_question.get("expected_answer_keywords", []) if custom_question else [],
                    "required": custom_question.get("required", True) if custom_question else True,
                }
            )

        session = {
            "sessionId": session_id,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "status": "in_progress",
            "phase": "playing_question_audio",
            "totalQuestions": total_questions,
            "questions": questions,
            "responses": [],
            "finalVideo": None,
            "completedQuestions": 0,
            "processingComplete": False,
            "processingStartedAt": None,
            "processingCompletedAt": None,
            "analysis": {"status": "not_started"},
            "durations": {},
            "language": lang_meta["language"],
            "speechLocale": lang_meta["azure_locale"],
            "questionSource": "company" if custom_questions else "ai",
            "companyInterviewSessionId": company_interview_session_id,
        }

        self.sessions[session_id] = session
        self._persist_session(session_id, session)

        return {
            "sessionId": session_id,
            "status": session["status"],
            "phase": session["phase"],
            "completedQuestions": session["completedQuestions"],
            "totalQuestions": total_questions,
            "questions": [
                {
                    "index": q["index"],
                    "questionText": q["questionText"],
                    "audioUrl": q["audioUrl"],
                    "audioPath": q["audioPath"],
                    "source": q.get("source"),
                    "questionId": q.get("questionId"),
                    "category": q.get("category"),
                    "difficulty": q.get("difficulty"),
                    "expectedAnswerKeywords": q.get("expectedAnswerKeywords", []),
                    "required": q.get("required", True),
                }
                for q in questions
            ],
            "language": lang_meta["language"],
            "speechLocale": lang_meta["azure_locale"],
            "questionSource": session["questionSource"],
            "companyInterviewSessionId": company_interview_session_id,
        }

    def convert_to_mp4(self, input_path: str, output_path: str):
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        command = [
            self.ffmpeg_path,
            "-i",
            input_path,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            "-y",
            output_path,
        ]
        subprocess.run(command, check=True)
        return output_path

    async def store_answer(
        self, session_id: str, question_index: int, upload, timing_meta: dict
    ):
        session = self._get_session(session_id)
        if not session:
            raise ValueError("Session not found")
        total_questions = self._get_total_questions(session)
        try:
            question_index = int(question_index)
        except (TypeError, ValueError):
            raise ValueError("question_index must be an integer")

        question_meta = next(
            (q for q in session.get("questions", []) if q["index"] == question_index),
            None,
        )
        if not question_meta:
            raise ValueError("Question metadata missing")

        is_last_question = self._is_last_question(question_index, total_questions)

        videos_dir = os.path.join(self._session_dir(session_id), "videos")
        os.makedirs(videos_dir, exist_ok=True)

        raw_path = os.path.join(videos_dir, f"question_{question_index}.webm")
        with open(raw_path, "wb") as f:
            f.write(await upload.read())

        mp4_path = os.path.join(videos_dir, f"question_{question_index}.mp4")
        self.convert_to_mp4(raw_path, mp4_path)

        def _as_float(value):
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        response_entry = {
            "questionIndex": question_index,
            "questionId": question_meta.get("questionId"),
            "questionText": question_meta.get("questionText"),
            "questionCategory": question_meta.get("category"),
            "questionDifficulty": question_meta.get("difficulty"),
            "expectedAnswerKeywords": question_meta.get("expectedAnswerKeywords", []),
            "questionAudioPath": question_meta.get("audioPath"),
            "questionAudioUrl": question_meta.get("audioUrl"),
            "audioStartTime": timing_meta.get("audioStartTime"),
            "audioEndTime": timing_meta.get("audioEndTime"),
            "thinkingStart": timing_meta.get("thinkingStart"),
            "thinkingEnd": timing_meta.get("thinkingEnd"),
            "actualThinkingDuration": _as_float(timing_meta.get("actualThinkingDuration")),
            "answerStart": timing_meta.get("answerStart"),
            "answerEnd": timing_meta.get("answerEnd"),
            "actualAnswerDuration": _as_float(timing_meta.get("actualAnswerDuration")),
            "videoPath": mp4_path,
            "videoUrl": "/" + mp4_path.replace("\\", "/"),
            "audioPath": None,
            "transcript": None,
            "transcriptionProvider": None,
            "audioScore": None,
            "videoScore": None,
            "questionEvaluation": None,
            "questionScoreRaw": None,
            "questionScore": None,
            "status": "answered",
            "analysisStatus": "pending_final_analysis",
            "analysisError": None,
            "isLastQuestion": is_last_question,
        }

        # replace existing entry if re-uploaded
        session["responses"] = [
            r for r in session.get("responses", []) if r.get("questionIndex") != question_index
        ]
        session["responses"].append(response_entry)
        session["responses"] = sorted(session["responses"], key=lambda r: r["questionIndex"])

        session["completedQuestions"] = len(session["responses"])
        if session["completedQuestions"] < total_questions:
            session["status"] = "awaiting_next_question"
            session["phase"] = "next_question"
        else:
            session["status"] = "ready_for_finalization"
            session["phase"] = "ready_for_finalization"

        self._persist_session(session_id, session)
        self.sessions[session_id] = session

        return {
            "response": response_entry,
            "status": session.get("status"),
            "phase": session.get("phase"),
            "completedQuestions": session.get("completedQuestions", 0),
            "totalQuestions": total_questions,
            "responses": session.get("responses", []),
        }

    def merge_videos(self, video_paths, output_path):
        if not video_paths:
            raise ValueError("No video segments provided")

        for path in video_paths:
            if not os.path.exists(path):
                raise FileNotFoundError(f"Missing video segment: {path}")

        list_file = Path(output_path).with_suffix(".txt")
        with open(list_file, "w", encoding="utf-8") as f:
            for video in video_paths:
                f.write(f"file '{os.path.abspath(video)}'\n")

        command = [
            self.ffmpeg_path,
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            "-y",
            output_path,
        ]

        subprocess.run(command, check=True)
        try:
            list_file.unlink(missing_ok=True)
        except Exception:
            pass

        return output_path

    def _clamp(self, val, lo=0, hi=100):
        try:
            return max(lo, min(hi, float(val)))
        except (TypeError, ValueError):
            return None

    def _extract_numeric_score(self, value, default: int = 0, lo: int = 0, hi: int = 100) -> int:
        """
        Safely extract a numeric score from mixed content.

        - Accepts ints/floats directly.
        - From text: prefers a standalone number on its own line, otherwise
          falls back to the last number found (avoids picking stray digits
          from preamble like "I'd give this a 7 out of 10, so 70").
        - Clamps to the configured range and falls back to `default` on any failure.
        """
        candidate = None
        if isinstance(value, (int, float)):
            candidate = float(value)
        else:
            text = str(value or "").strip()
            # Prefer a line that is *only* a number (the expected output format)
            solo = re.search(r"^\s*(\d+(?:\.\d+)?)\s*$", text, re.MULTILINE)
            if solo:
                try:
                    candidate = float(solo.group(1))
                except (TypeError, ValueError):
                    candidate = None
            else:
                # Fallback: take the last number in the text
                matches = re.findall(r"\d+(?:\.\d+)?", text)
                if matches:
                    try:
                        candidate = float(matches[-1])
                    except (TypeError, ValueError):
                        candidate = None

        clamped = self._clamp(candidate, lo, hi) if candidate is not None else None
        if clamped is None:
            return int(default)
        return int(round(clamped))

    def _compute_final_video_score(self, video_score: dict):
        if not video_score:
            return None

        eye_contact = self._clamp(video_score.get("eye_contact"))
        head_movement = self._clamp(video_score.get("head_movement"))
        face_presence = self._clamp(video_score.get("face_presence"))

        components = [
            (eye_contact, 0.50),
            (head_movement, 0.30),
            (face_presence, 0.20),
        ]

        if any(val is None for val, _ in components):
            return None

        return sum(val * weight for val, weight in components)

    def _compute_final_voice_score(self, audio_score: dict):
        if not audio_score:
            return None
        azure = audio_score.get("azure_scores") or {}
        fluency = self._clamp(azure.get("fluency"))
        prosody = self._clamp(azure.get("prosody"))
        clarity = self._clamp(
            azure.get("clarity_intelligibility")
            if isinstance(azure.get("clarity_intelligibility"), (int, float))
            else (audio_score.get("clarity_intelligibility") or {}).get("score")
        )
        confidence = self._clamp(azure.get("confidence_score"))

        components = [
            (fluency, 0.35),
            (prosody, 0.25),
            (clarity, 0.25),
            (confidence, 0.15),
        ]

        available = [(val, weight) for val, weight in components if val is not None]
        if not available:
            return None

        total_weight = sum(w for _, w in available)
        return sum(val * weight for val, weight in available) / total_weight

    def _avg(self, values):
        valid = [v for v in values if v is not None]
        if not valid:
            return None
        return sum(valid) / len(valid)

    def _aggregate_video_metrics(self, responses: List[Dict[str, Any]]):
        video_scores = [r.get("videoScore") or {} for r in responses if r.get("videoScore")]
        if not video_scores:
            return {}

        def avg_metric(key):
            vals = [self._clamp(v.get(key)) for v in video_scores if v.get(key) is not None]
            vals = [v for v in vals if v is not None]
            return self._avg(vals)

        def mode_label(key):
            labels = [v.get(key) for v in video_scores if v.get(key)]
            return Counter(labels).most_common(1)[0][0] if labels else None

        return {
            "eye_contact": avg_metric("eye_contact"),
            "head_movement": avg_metric("head_movement"),
            "face_presence": avg_metric("face_presence"),
            "facial_expression": mode_label("facial_expression"),
            "smile_score": mode_label("smile_score"),
        }

    def _estimate_response_silence_metrics(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Estimate silence that may not appear in word-to-word pause timing.

        This uses the recorded answer duration (which includes silence) and compares it
        to the detected speech duration from the audio analysis. It helps capture long
        silent stretches such as standing still for several seconds before speaking.
        """
        audio_score = response.get("audioScore") or {}
        speech_rate = audio_score.get("speech_rate") or {}

        answer_duration = response.get("actualAnswerDuration")
        speech_duration = (
            speech_rate.get("duration_seconds")
            or speech_rate.get("speech_duration_seconds")
            or 0
        )

        try:
            answer_duration = float(answer_duration)
        except (TypeError, ValueError):
            answer_duration = None

        try:
            speech_duration = float(speech_duration)
        except (TypeError, ValueError):
            speech_duration = 0.0

        if answer_duration is None or answer_duration <= 0:
            return {
                "estimated_silence_seconds": None,
                "estimated_long_pause_count": 0,
                "estimated_pause_count": 0,
            }

        estimated_silence = max(0.0, answer_duration - max(0.0, speech_duration))

        long_pause_threshold = 1.5
        pause_threshold = 0.3

        return {
            "estimated_silence_seconds": round(estimated_silence, 3),
            "estimated_long_pause_count": 1 if estimated_silence >= long_pause_threshold else 0,
            "estimated_pause_count": 1 if estimated_silence >= pause_threshold else 0,
        }

    def _aggregate_audio_metrics(self, responses: List[Dict[str, Any]]):
        responses_with_audio = [r for r in responses if r.get("audioScore")]
        if not responses_with_audio:
            return {}

        audio_scores = [r.get("audioScore") or {} for r in responses_with_audio]

        def avg_path(path):
            parts = path.split(".")
            vals = []
            for score in audio_scores:
                cur = score
                for p in parts:
                    if not isinstance(cur, dict):
                        cur = None
                        break
                    cur = cur.get(p)
                if cur is None:
                    continue
                try:
                    vals.append(float(cur))
                except (TypeError, ValueError):
                    continue
            return self._avg(vals)

        azure_scores = {
            "accuracy": avg_path("azure_scores.accuracy"),
            "fluency": avg_path("azure_scores.fluency"),
            "prosody": avg_path("azure_scores.prosody"),
            "completeness": avg_path("azure_scores.completeness"),
            "confidence_raw": avg_path("azure_scores.confidence_raw"),
            "confidence_score": avg_path("azure_scores.confidence_score"),
            "clarity_intelligibility": avg_path("azure_scores.clarity_intelligibility"),
            "final_score": avg_path("azure_scores.final_score"),
        }

        speech_rates = [score.get("speech_rate") or {} for score in audio_scores]
        total_words = sum((sr.get("total_words") or sr.get("word_count") or 0) for sr in speech_rates)
        total_duration = sum((sr.get("duration_seconds") or sr.get("speech_duration_seconds") or 0) for sr in speech_rates)
        words_per_minute = (total_words / total_duration * 60) if total_words and total_duration else None
        if words_per_minute is None:
            rate_label = None
        elif words_per_minute < 110:
            rate_label = "slow"
        elif words_per_minute <= 160:
            rate_label = "normal"
        else:
            rate_label = "fast"

        speech_rate = {
            "word_count": total_words or None,
            "total_words": total_words or None,
            "speech_duration_seconds": round(total_duration, 3) if total_duration else None,
            "duration_seconds": round(total_duration, 3) if total_duration else None,
            "words_per_minute": round(words_per_minute, 2) if words_per_minute is not None else None,
            "label": rate_label,
            "rate_label": rate_label.capitalize() if rate_label else None,
            "score": avg_path("speech_rate.score"),
        }

        pause_list = [score.get("pause_analysis") or {} for score in audio_scores]
        pause_count = sum(p.get("count") or 0 for p in pause_list)
        long_pause_count = sum(p.get("long_pause_count") or 0 for p in pause_list)
        avg_pause_candidates = [
            p.get("average_pause_seconds")
            for p in pause_list
            if p.get("average_pause_seconds") is not None
        ]
        max_pause_candidates = [
            p.get("max_pause_seconds")
            for p in pause_list
            if p.get("max_pause_seconds") is not None
        ]

        silence_estimates = [
            self._estimate_response_silence_metrics(response)
            for response in responses_with_audio
        ]
        estimated_silence_values = [
            item.get("estimated_silence_seconds")
            for item in silence_estimates
            if item.get("estimated_silence_seconds") is not None
        ]

        pause_count += sum(item.get("estimated_pause_count") or 0 for item in silence_estimates)
        long_pause_count += sum(item.get("estimated_long_pause_count") or 0 for item in silence_estimates)

        avg_pause_candidates.extend(estimated_silence_values)
        max_pause_candidates.extend(estimated_silence_values)

        avg_pause = self._avg(avg_pause_candidates)
        max_pause = max(max_pause_candidates) if max_pause_candidates else None

        pause_analysis = {
            "count": pause_count,
            "long_pause_count": long_pause_count,
            "average_pause_seconds": round(avg_pause, 3) if avg_pause is not None else None,
            "max_pause_seconds": round(max_pause, 3) if max_pause is not None else None,
            "score": avg_path("pause_analysis.score"),
            "estimated_silence_seconds": round(sum(estimated_silence_values), 3) if estimated_silence_values else 0.0,
        }

        filler_list = [score.get("filler_words") or {} for score in audio_scores]
        filler_total = sum(f.get("total_count") or 0 for f in filler_list)
        fillers_per_100 = None
        if total_words:
            fillers_per_100 = round((filler_total / total_words) * 100, 2)
        filler_words = {
            "total_count": filler_total,
            "per_100_words": fillers_per_100,
            "score": avg_path("filler_words.score"),
        }

        tq_list = [score.get("transcript_quality") or {} for score in audio_scores]
        tq_word_count = sum(t.get("word_count") or 0 for t in tq_list)
        tq_sentence_count = sum(t.get("sentence_count") or 0 for t in tq_list)
        avg_words_per_sentence = None
        if tq_sentence_count:
            avg_words_per_sentence = round(tq_word_count / tq_sentence_count, 2)
        transcript_quality = {
            "word_count": tq_word_count or None,
            "sentence_count": tq_sentence_count or None,
            "average_words_per_sentence": avg_words_per_sentence,
            "lexical_diversity": self._avg([t.get("lexical_diversity") for t in tq_list if t.get("lexical_diversity") is not None]),
            "score": avg_path("transcript_quality.score"),
        }

        clarity_intelligibility = {
            "score": azure_scores.get("clarity_intelligibility"),
        }

        return {
            "azure_scores": azure_scores,
            "speech_rate": speech_rate,
            "pause_analysis": pause_analysis,
            "filler_words": filler_words,
            "clarity_intelligibility": clarity_intelligibility,
            "transcript_quality": transcript_quality,
            "source": "aggregated_per_interview",
        }
    def _compute_answer_quality_score(self, responses):
        scores = [
            self._normalize_question_score(r.get("questionScoreRaw"))
            for r in responses
            if r.get("questionScoreRaw") is not None
        ]
        if not scores:
            return None
        return sum(scores) / len(scores)

    def _compute_final_interview_score(self, answer_quality, voice_score, video_score):
        components = [
            (answer_quality, 0.40),
            (voice_score, 0.35),
            (video_score, 0.25),
        ]
        available = [(v, w) for v, w in components if v is not None]
        if not available:
            return None
        total_weight = sum(w for _, w in available)
        score = sum(v * w for v, w in available) / total_weight
        logger.info(
            "Final interview score: %.1f (answer=%s voice=%s video=%s, %d/%d components available)",
            score, answer_quality, voice_score, video_score, len(available), len(components),
        )
        return score

    def _normalize_question_score(self, score):
        return self._extract_numeric_score(score, default=0, lo=0, hi=100)

    def _is_last_question(self, question_index: int, total_questions: int):
        """
        Dynamically detect if a question is the last one. Treat any index that
        equals or exceeds total_questions as the last to avoid accidental skips
        when indexes drift but to still prevent repeated analysis on earlier
        questions.
        """
        try:
            return int(question_index) >= max(1, int(total_questions))
        except (TypeError, ValueError):
            return False

    def _get_total_questions(self, session: dict):
        try:
            return max(1, int(session.get("totalQuestions") or 4))
        except (TypeError, ValueError):
            return 4

    def _responses_ready_for_finalization(self, session: dict):
        total_questions = self._get_total_questions(session)
        responses = session.get("responses", [])
        if len(responses) < total_questions:
            return False, f"Only {len(responses)} of {total_questions} questions answered"
        for idx in range(1, total_questions + 1):
            resp = next((r for r in responses if r.get("questionIndex") == idx), None)
            if not resp:
                return False, f"Missing response for question {idx}"
            path = resp.get("videoPath")
            if not path or not os.path.exists(path):
                return False, f"Missing recording for question {idx}"
        return True, ""

    def complete_interview(self, session_id: str):
        session = self._get_session(session_id)
        if not session:
            raise ValueError("Session not found")

        if session.get("processingComplete"):
            # Processing already done; avoid duplicate analysis/merging.
            if (session.get("analysis") or {}).get("status") == "completed":
                analysis = session.get("analysis") or {}
                summary_payload = {
                    "audio_score": analysis.get("audio_score"),
                    "video_score": analysis.get("video_score"),
                    "analysisScope": analysis.get("analysisScope"),
                    "lastQuestionIndex": len(session.get("responses", [])),
                }
                response_body = {
                    "finalVideoPath": session.get("finalVideo"),
                    "finalVideoUrl": ("/" + session["finalVideo"].replace("\\", "/")) if session.get("finalVideo") else None,
                    "analysis": analysis,
                    "audio_score": summary_payload["audio_score"],
                    "video_score": summary_payload["video_score"],
                    "analysisScope": summary_payload["analysisScope"],
                    "lastQuestionIndex": summary_payload["lastQuestionIndex"],
                    "questions": session.get("responses", []),
                    "scores": session.get("scores", {}),
                    "session": session,
                    "candidate_position": analysis.get("candidate_position"),
                }
                logger.info(
                    "Returning completed analysis for session %s with keys: %s (audio_score:%s, video_score:%s)",
                    session_id,
                    list(response_body.keys()),
                    bool(summary_payload["audio_score"]),
                    bool(summary_payload["video_score"]),
                )
                return response_body
            analysis_result = self.run_full_interview_analysis(session_id)
            session = self._get_session(session_id)
            analysis = session.get("analysis") or analysis_result or {}
            summary_payload = {
                "audio_score": analysis.get("audio_score"),
                "video_score": analysis.get("video_score"),
                "analysisScope": analysis.get("analysisScope"),
                "lastQuestionIndex": len(session.get("responses", [])),
            }
            response_body = {
                "finalVideoPath": session.get("finalVideo"),
                "finalVideoUrl": ("/" + session["finalVideo"].replace("\\", "/")) if session.get("finalVideo") else None,
                "analysis": analysis,
                "audio_score": summary_payload["audio_score"],
                "video_score": summary_payload["video_score"],
                "analysisScope": summary_payload["analysisScope"],
                "lastQuestionIndex": summary_payload["lastQuestionIndex"],
                "questions": session.get("responses", []),
                "scores": session.get("scores", {}),
                "session": session,
                "candidate_position": analysis.get("candidate_position"),
            }
            logger.info(
                "Returning analysis for session %s with keys: %s (audio_score:%s, video_score:%s)",
                session_id,
                list(response_body.keys()),
                bool(summary_payload["audio_score"]),
                bool(summary_payload["video_score"]),
            )
            return response_body

        total_questions = self._get_total_questions(session)
        session["totalQuestions"] = total_questions
        ready, reason = self._responses_ready_for_finalization(session)
        if not ready:
            raise ValueError(reason)

        responses = session.get("responses", [])
        ordered_videos = []
        durations = {}
        for idx in range(1, total_questions + 1):
            resp = next((r for r in responses if r.get("questionIndex") == idx), None)
            if not resp:
                raise ValueError(f"Missing response for question {idx}")
            ordered_videos.append(resp["videoPath"])
            durations[f"question_{idx}"] = self._validate_video_duration(resp["videoPath"])

        final_video_path = os.path.join(self._session_dir(session_id), "final_interview.mp4")
        self._mark_processing_started(session_id, session)
        session["phase"] = "merging_final_video"
        self._persist_session(session_id, session)
        self.sessions[session_id] = session

        try:
            self.merge_videos(ordered_videos, final_video_path)
            durations["final_interview"] = self._validate_video_duration(final_video_path)
        except Exception as exc:
            session["status"] = "merge_failed"
            session["phase"] = "merge_failed"
            session["finalVideoError"] = str(exc)
            self._persist_session(session_id, session)
            self.sessions[session_id] = session
            raise

        self._mark_processing_completed(session_id, session, final_video_path, durations)

        analysis_result = self.run_full_interview_analysis(session_id)
        session = self._get_session(session_id)
        analysis = session.get("analysis") or analysis_result or {}
        summary_payload = {
            "audio_score": analysis.get("audio_score"),
            "video_score": analysis.get("video_score"),
            "analysisScope": analysis.get("analysisScope"),
            "lastQuestionIndex": len(session.get("responses", [])),
        }

        response_body = {
            "finalVideoPath": final_video_path,
            "finalVideoUrl": "/" + final_video_path.replace("\\", "/"),
            "analysis": analysis,
            "audio_score": summary_payload["audio_score"],
            "video_score": summary_payload["video_score"],
            "analysisScope": summary_payload["analysisScope"],
            "lastQuestionIndex": summary_payload["lastQuestionIndex"],
            "questions": session.get("responses", []),
            "scores": session.get("scores", {}),
            "session": session,
            "candidate_position": analysis.get("candidate_position"),
        }
        logger.info(
            "Returning analysis (post-merge) for session %s with keys: %s (audio_score:%s, video_score:%s)",
            session_id,
            list(response_body.keys()),
            bool(summary_payload["audio_score"]),
            bool(summary_payload["video_score"]),
        )
        return response_body

    def get_session(self, session_id: str):
        return self._get_session(session_id)

    def run_full_interview_analysis(self, session_id: str):
        session = self._get_session(session_id)
        if not session:
            raise ValueError("Session not found")

        self._ensure_processing_complete_guard(session)

        analysis_meta = session.get("analysis") or {}
        status = analysis_meta.get("status")
        if status == "running":
            raise RuntimeError("Analysis already running for this session")
        if status == "completed":
            return analysis_meta

        session["analysis"] = {**analysis_meta, "analysisScope": "full_interview"}
        self._set_analysis_status(session_id, session, "running")
        logger.info("Analysis started for session %s", session_id)
        lang_meta = self._resolve_language(session.get("language"), session.get("speechLocale"))
        self.audio.set_locale(lang_meta["azure_locale"], lang_meta["tts_lang"])
        self.speech.set_language(lang_meta["azure_locale"])

        responses = sorted(session.get("responses", []), key=lambda r: r.get("questionIndex", 0))
        per_question_results: List[Dict[str, Any]] = []
        voice_scores: List[float] = []
        video_scores: List[float] = []
        updated_responses: List[Dict[str, Any]] = []

        try:
            for resp in responses:
                idx = resp.get("questionIndex")
                question_text = resp.get("questionText")
                video_path = resp.get("videoPath")

                if not video_path or not os.path.exists(video_path):
                    raise FileNotFoundError(f"Missing video for question {idx}")

                audio_output_path = os.path.join(
                    self._session_dir(session_id), "audio", f"question_{idx}.wav"
                )
                os.makedirs(os.path.dirname(audio_output_path), exist_ok=True)

                audio_score = self.score_audio(
                    video_path,
                    audio_output_path,
                    language=lang_meta["language"],
                    speech_locale=lang_meta["azure_locale"],
                )
                transcript, transcript_provider = self.audio.transcribe_audio_with_source(
                    audio_output_path, locale=lang_meta["azure_locale"], whisper_lang=lang_meta["tts_lang"]
                )
                answer_text = (transcript or "").strip()

                logger.info(
                    "Q%s | transcript_provider=%s | transcript_len=%d | preview=%.200s",
                    idx, transcript_provider, len(answer_text), answer_text,
                )

                video_score_raw = self.score_video(video_path)
                question_eval = self.score_question(
                    question_text,
                    answer_text,
                    language=lang_meta["language"],
                    expected_keywords=resp.get("expectedAnswerKeywords"),
                )

                raw_score_value = (question_eval or {}).get("score")
                eval_notes = (question_eval or {}).get("notes", "")

                if raw_score_value is None:
                    question_score_raw = None
                    question_score = None
                    logger.warning(
                        "Q%s | scoring returned None (notes=%s) — excluded from averages",
                        idx, eval_notes,
                    )
                else:
                    question_score_raw = self._extract_numeric_score(
                        raw_score_value, default=0, lo=0, hi=100,
                    )
                    question_score = question_score_raw

                logger.info(
                    "Q%s | question_score=%s | raw_response=%r | video_score=%s",
                    idx, question_score, (question_eval or {}).get("raw_response", ""), video_score_raw,
                )

                voice_component = self._compute_final_voice_score(audio_score)
                video_component = self._compute_final_video_score(video_score_raw)

                if voice_component is not None:
                    voice_scores.append(voice_component)
                if video_component is not None:
                    video_scores.append(video_component)

                resp_copy = dict(resp)
                resp_copy.update(
                    {
                        "audioPath": audio_output_path,
                        "transcript": transcript,
                        "transcriptionProvider": transcript_provider,
                        "audioScore": audio_score,
                        "videoScore": video_score_raw,
                        "questionEvaluation": question_eval,
                        "questionScoreRaw": question_score_raw,
                        "questionScore": question_score,
                        "analysisStatus": "completed",
                        "analysisError": None,
                    }
                )

                updated_responses.append(resp_copy)

                per_question_results.append(
                    {
                        "questionIndex": idx,
                        "audioPath": audio_output_path,
                        "audioScore": audio_score,
                        "videoScore": video_score_raw,
                        "questionScore": question_score,
                        "transcriptProvider": transcript_provider,
                    }
                )

            session["responses"] = updated_responses

            answer_quality_score = self._compute_answer_quality_score(updated_responses)
            final_voice_score = sum(voice_scores) / len(voice_scores) if voice_scores else None
            final_video_score = sum(video_scores) / len(video_scores) if video_scores else None
            final_interview_score = self._compute_final_interview_score(
                answer_quality_score, final_voice_score, final_video_score
            )

            scores_payload = {
                "finalVideoScore": final_video_score,
                "finalVoiceScore": final_voice_score,
                "answerQualityScore": answer_quality_score,
                "finalInterviewScore": final_interview_score,
            }
            session["scores"] = scores_payload
            aggregated_audio = self._aggregate_audio_metrics(updated_responses)
            aggregated_video = self._aggregate_video_metrics(updated_responses)
            candidate_position = self.infer_candidate_position(
                session, updated_responses, scores_payload, language=lang_meta["language"]
            )
            logger.info(
                "Candidate position inference result for session %s: %s",
                session_id,
                json.dumps(candidate_position, ensure_ascii=False, default=str),
            )

            session["analysis"].update(
                {
                    "perQuestion": per_question_results,
                    "analysisScope": "full_interview",
                    "audio_score": aggregated_audio,
                    "video_score": aggregated_video,
                    "scores": scores_payload,
                    "candidate_position": candidate_position,
                    "language": lang_meta["language"],
                    "speechLocale": lang_meta["azure_locale"],
                }
            )
            session["status"] = "completed"
            session["phase"] = "completed"
            session["completedAt"] = datetime.utcnow().isoformat() + "Z"
            session["completedQuestions"] = len(session.get("responses", []))

            self._set_analysis_status(session_id, session, "completed")
            logger.info(
                "Final analysis payload for session %s: %s",
                session_id,
                json.dumps({"analysis": session.get("analysis"), "scores": session.get("scores")}, default=str),
            )
            logger.info("Analysis completed for session %s", session_id)
            return session.get("analysis", {})
        except Exception as exc:
            self._set_analysis_status(session_id, session, "failed", str(exc))
            logger.exception("Analysis failed for session %s: %s", session_id, exc)
            raise

    def _clean_json_text(self, text: str) -> str:
        cleaned = (text or "").strip()
        if not cleaned:
            return ""
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end >= start:
            cleaned = cleaned[start : end + 1]
        return cleaned

    def infer_candidate_position(self, session: dict, responses: list, scores: dict, language: Optional[str] = None):
        fallback = {
            "best_fit_role": None,
            "best_fit_level": None,
            "domain_confidence": 0,
            "strengths": [],
            "gaps": [],
            "recommended_next_step": "",
            "reasoning_summary": "",
            "error": None,
        }

        usable_responses = [r for r in responses if (r.get("transcript") or "").strip()]
        if not usable_responses:
            logger.info("Skipping candidate profile inference: no transcripts available (fallback)")
            fallback["error"] = "no_transcripts"
            return fallback

        payload_responses = []
        for resp in responses:
            payload_responses.append(
                {
                    "questionIndex": resp.get("questionIndex"),
                    "questionText": resp.get("questionText"),
                    "transcript": resp.get("transcript"),
                    "questionScore": resp.get("questionScore"),
                    "questionScoreRaw": resp.get("questionScoreRaw"),
                    "audioScore": resp.get("audioScore"),
                    "videoScore": resp.get("videoScore"),
                }
            )

        request_payload = {
            "interview": {
                "sessionId": session.get("sessionId") or session.get("id") or session.get("uuid"),
                "totalQuestions": len(responses),
                "final_scores": scores or {},
            },
            "responses": payload_responses,
        }

        logger.info(
            "Starting candidate profile inference for session %s",
            session.get("sessionId") or session.get("id") or "unknown",
        )
        try:
            logger.info(
                "Candidate profile request payload: %s",
                json.dumps(request_payload, ensure_ascii=False, default=str),
            )
        except Exception:
            logger.info("Candidate profile request payload: <unserializable>")

        lang_meta = self._resolve_language(language)
        target_lang_label = "Arabic" if lang_meta["language"] == "ar" else "English"
        developer_message = (
            "You are an expert interview evaluator. Determine the candidate's best-fit professional domain and current seniority level based on the complete interview answers. "
            "Do not assume a fixed field such as joiner or sensory lab. Infer the most suitable role from the actual answers. "
            f"Return valid JSON only, with all string values written in {target_lang_label}."
        )
        user_message = (
            "Use the whole interview, not individual questions.\n"
            "Infer the candidate's best-fit role/domain and current level from all answers and scores.\n"
            "Output strictly the following JSON structure and nothing else:\n"
            "{\n"
            '  \"best_fit_role\": \"string\",\n'
            '  \"best_fit_level\": \"string\",\n'
            '  \"domain_confidence\": <integer 0-100 reflecting how confidently the role was inferred>,\n'
            '  \"strengths\": [\"string\"],\n'
            '  \"gaps\": [\"string\"],\n'
            '  \"recommended_next_step\": \"string\",\n'
            '  \"reasoning_summary\": \"string\"\n'
            "}\n"
            "For domain_confidence: use 70-90 when the role is clearly identifiable, 50-69 when somewhat uncertain, below 50 when the answers are too vague to determine a role.\n"
            f"All string fields must be written in {target_lang_label}.\n"
            "No markdown. No code fences. No explanations outside JSON.\n"
            f"Interview payload:\n{json.dumps(request_payload, ensure_ascii=False, default=str)}"
        )

        try:
            api_response = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "developer", "content": developer_message},
                    {"role": "user", "content": user_message},
                ],
            )
        except OpenAIError as exc:
            traceback.print_exc()
            logger.exception("Candidate profile inference OpenAI error: %s", exc)
            logger.info("Candidate profile fallback reason: OpenAIError")
            fallback["error"] = str(exc)
            return fallback
        except Exception as exc:
            traceback.print_exc()
            logger.exception("Candidate profile inference unexpected error: %s", exc)
            logger.info("Candidate profile fallback reason: unexpected_error")
            fallback["error"] = str(exc)
            return fallback

        response_text = ""
        try:
            response_text = (getattr(api_response, "output_text", None) or "").strip()
        except Exception:
            response_text = ""

        if not response_text:
            try:
                output_blocks = getattr(api_response, "output", None) or []
                text_chunks = []
                for block in output_blocks:
                    content = block.get("content") if isinstance(block, dict) else getattr(block, "content", None)
                    if content:
                        for piece in content:
                            piece_text = piece.get("text") if isinstance(piece, dict) else getattr(piece, "text", None)
                            if piece_text:
                                text_chunks.append(piece_text)
                if text_chunks:
                    response_text = "\n".join(text_chunks).strip()
            except Exception:
                pass

        logger.info("Candidate profile raw response text: %s", response_text or "<empty>")
        cleaned_json = self._clean_json_text(response_text)
        logger.info("Candidate profile cleaned JSON: %s", cleaned_json or "<empty>")
        try:
            parsed = json.loads(cleaned_json)
            logger.info(
                "Candidate profile inference succeeded for session %s",
                session.get("sessionId") or session.get("id") or "unknown",
            )
            # ── Confidence post-processing ──────────────────────────────────
            # Compute a data-driven confidence score that reflects real
            # performance signals and blend it with GPT's estimate.
            data_confidence = self._compute_domain_confidence(
                responses=responses,
                scores=scores,
                gpt_strengths=parsed.get("strengths") or [],
                gpt_gaps=parsed.get("gaps") or [],
            )
            gpt_confidence_raw = parsed.get("domain_confidence")
            try:
                gpt_confidence = float(gpt_confidence_raw)
            except (TypeError, ValueError):
                gpt_confidence = None

            if gpt_confidence is not None:
                # Sanity-clamp the GPT value to [10, 100] to reject malformed
                # responses (e.g. a literal 0 or >100).
                gpt_confidence = max(10.0, min(100.0, gpt_confidence))
                # Blend: 80 % data-driven + 20 % GPT signal
                final_confidence = round(data_confidence * 0.80 + gpt_confidence * 0.20, 1)
            else:
                final_confidence = round(data_confidence, 1)

            final_confidence = max(0.0, min(100.0, final_confidence))
            logger.info(
                "[confidence] data_driven=%.1f gpt_raw=%s gpt_clamped=%s final=%.1f",
                data_confidence,
                gpt_confidence_raw,
                gpt_confidence,
                final_confidence,
            )
            parsed["domain_confidence"] = final_confidence
            return parsed
        except Exception as parse_exc:
            traceback.print_exc()
            logger.warning(
                "Failed to parse candidate profile JSON for session %s: %s",
                session.get("sessionId") or session.get("id") or "unknown",
                parse_exc,
            )
            logger.info("Candidate profile fallback reason: parse_error")
            fallback["error"] = f"parse_error: {parse_exc}"
            return fallback

    # ──────────────────────────────────────────────────────────────────────
    # Confidence score computation
    # ──────────────────────────────────────────────────────────────────────

    def _compute_domain_confidence(
        self,
        responses: list,
        scores: dict,
        gpt_strengths: list,
        gpt_gaps: list,
    ) -> float:
        """
        Derive a realistic candidate confidence score (0–100) from available
        interview data.

        Scoring dimensions and weights:
          40 %  Answer quality   – avg question score (0-100)
          25 %  Communication    – voice / audio score (fluency + prosody + clarity)
          15 %  Completeness     – fraction of questions that have a non-empty transcript
          10 %  Video presence   – weighted eye-contact / face-presence score
          10 %  Gap penalty      – reduced when GPT identifies gaps (soft penalty)

        Strong candidates (≥70 on most signals) → 70–90 %
        Medium candidates                        → 50–70 %
        Weak candidates                          → < 50 %
        """
        logger.info("[confidence] === Computing domain confidence ===")

        # ── 1. Answer quality (40 %) ───────────────────────────────────────
        answer_quality = scores.get("answerQualityScore")
        try:
            answer_quality_f = float(answer_quality) if answer_quality is not None else None
        except (TypeError, ValueError):
            answer_quality_f = None

        if answer_quality_f is None:
            # Fallback: compute from individual question scores
            q_scores = [
                float(r["questionScore"])
                for r in responses
                if r.get("questionScore") is not None
                and str(r["questionScore"]).strip() not in ("", "None")
            ]
            answer_quality_f = (sum(q_scores) / len(q_scores)) if q_scores else 50.0
            logger.info(
                "[confidence] answer_quality fallback from %d question scores → %.1f",
                len(q_scores), answer_quality_f,
            )
        else:
            logger.info("[confidence] answer_quality from scores dict → %.1f", answer_quality_f)

        answer_quality_f = max(0.0, min(100.0, answer_quality_f))
        answer_component = answer_quality_f * 0.40
        logger.info("[confidence] answer_component (×0.40) = %.2f", answer_component)

        # ── 2. Communication / voice quality (25 %) ───────────────────────
        # Pull audio metrics directly from individual responses
        fluency_vals, prosody_vals, clarity_vals, voice_conf_vals = [], [], [], []
        for r in responses:
            az = (r.get("audioScore") or {}).get("azure_scores") or {}
            if az.get("fluency") is not None:
                try:
                    fluency_vals.append(float(az["fluency"]))
                except (TypeError, ValueError):
                    pass
            if az.get("prosody") is not None:
                try:
                    prosody_vals.append(float(az["prosody"]))
                except (TypeError, ValueError):
                    pass
            if az.get("clarity_intelligibility") is not None:
                try:
                    clarity_vals.append(float(az["clarity_intelligibility"]))
                except (TypeError, ValueError):
                    pass
            if az.get("confidence_score") is not None:
                try:
                    voice_conf_vals.append(float(az["confidence_score"]))
                except (TypeError, ValueError):
                    pass

        def _safe_avg(lst):
            return (sum(lst) / len(lst)) if lst else None

        fluency_avg = _safe_avg(fluency_vals)
        prosody_avg = _safe_avg(prosody_vals)
        clarity_avg = _safe_avg(clarity_vals)
        voice_conf_avg = _safe_avg(voice_conf_vals)
        logger.info(
            "[confidence] voice metrics → fluency=%.1f prosody=%.1f clarity=%.1f voice_conf=%.1f",
            fluency_avg or 0, prosody_avg or 0, clarity_avg or 0, voice_conf_avg or 0,
        )

        # Weighted sub-score for communication dimension
        comm_parts = [
            (fluency_avg, 0.40),
            (prosody_avg, 0.30),
            (clarity_avg, 0.20),
            (voice_conf_avg, 0.10),
        ]
        comm_total_weight = sum(w for v, w in comm_parts if v is not None)
        if comm_total_weight > 0:
            comm_score = sum(v * w for v, w in comm_parts if v is not None) / comm_total_weight * 100
        else:
            # No audio data available – assume a neutral baseline
            comm_score = 60.0
        comm_score = max(0.0, min(100.0, comm_score))
        communication_component = comm_score * 0.25
        logger.info(
            "[confidence] comm_score=%.1f  communication_component (×0.25) = %.2f",
            comm_score, communication_component,
        )

        # ── 3. Completeness (15 %) ────────────────────────────────────────
        # What fraction of answers have a real transcript?
        total_resp = len(responses)
        answered = sum(
            1 for r in responses
            if (r.get("transcript") or "").strip()
        )
        completeness_ratio = (answered / total_resp) if total_resp else 0.0
        # Scale: fully answered → 100, no answers → 0
        completeness_score = completeness_ratio * 100.0
        completeness_component = completeness_score * 0.15
        logger.info(
            "[confidence] answered=%d / total=%d → completeness=%.1f%%  component (×0.15) = %.2f",
            answered, total_resp, completeness_score, completeness_component,
        )

        # ── 4. Video presence (10 %) ──────────────────────────────────────
        eye_vals, face_vals = [], []
        for r in responses:
            vs = r.get("videoScore") or {}
            if vs.get("eye_contact") is not None:
                try:
                    eye_vals.append(float(vs["eye_contact"]))
                except (TypeError, ValueError):
                    pass
            if vs.get("face_presence") is not None:
                try:
                    face_vals.append(float(vs["face_presence"]))
                except (TypeError, ValueError):
                    pass

        eye_avg = _safe_avg(eye_vals)
        face_avg = _safe_avg(face_vals)
        logger.info(
            "[confidence] video metrics → eye_contact=%.1f face_presence=%.1f",
            eye_avg or 0, face_avg or 0,
        )

        video_parts = [(eye_avg, 0.60), (face_avg, 0.40)]
        video_weight = sum(w for v, w in video_parts if v is not None)
        if video_weight > 0:
            video_score = sum(v * w for v, w in video_parts if v is not None) / video_weight
        else:
            video_score = 65.0  # neutral baseline when no camera data
        video_score = max(0.0, min(100.0, video_score))
        video_component = video_score * 0.10
        logger.info(
            "[confidence] video_score=%.1f  video_component (×0.10) = %.2f",
            video_score, video_component,
        )

        # ── 5. Gap penalty (10 %) ─────────────────────────────────────────
        # Gaps reduce the score softly; strengths help recover it.
        n_gaps = len(gpt_gaps)
        n_strengths = len(gpt_strengths)
        # Each gap subtracts up to 5 pts from a 100-pt pool; each strength
        # adds up to 3 pts, capped at full recovery.
        raw_gap_score = 100.0 - (n_gaps * 5.0) + (n_strengths * 3.0)
        gap_score = max(20.0, min(100.0, raw_gap_score))
        gap_component = gap_score * 0.10
        logger.info(
            "[confidence] gaps=%d strengths=%d → gap_score=%.1f  gap_component (×0.10) = %.2f",
            n_gaps, n_strengths, gap_score, gap_component,
        )

        # ── Final weighted sum ────────────────────────────────────────────
        raw_confidence = (
            answer_component
            + communication_component
            + completeness_component
            + video_component
            + gap_component
        )
        confidence = max(0.0, min(100.0, raw_confidence))
        logger.info(
            "[confidence] raw_sum=%.2f  FINAL data-driven confidence = %.1f",
            raw_confidence, confidence,
        )
        return confidence

    def score_question(
        self,
        question: str,
        answer_text: Optional[str] = None,
        language: Optional[str] = None,
        expected_keywords: Optional[List[str]] = None,
    ):
        # Evaluate a single question/answer pair using OpenAI and return a numeric score.
        question = (question or "").strip()
        answer_text = (answer_text or "").strip()

        if not question:
            logger.warning("score_question called with empty/None question — cannot evaluate")
            return {
                "score": 0,
                "raw_response": "",
                "notes": "missing_question",
                "feedback": "",
                "suggestion": "",
            }

        if not answer_text:
            logger.warning("score_question called with empty answer_text for question: %.120s", question)
            return {
                "score": 0,
                "raw_response": "",
                "notes": "empty_answer",
                "feedback": "",
                "suggestion": "",
            }

        logger.info(
            "score_question | question=%.200s | answer_len=%d | answer_preview=%.200s",
            question, len(answer_text), answer_text,
        )

        lang_meta = self._resolve_language(language)
        expected_keywords = [str(item).strip() for item in (expected_keywords or []) if str(item).strip()]
        keyword_guidance = (
            "Expected answer keywords or concepts:\n"
            + "\n".join(f"- {keyword}" for keyword in expected_keywords)
            + "\n\n"
            if expected_keywords
            else ""
        )
        system_prompt = (
            "You are an interview answer evaluator.\n"
            "Your task is to evaluate the candidate's answer to ONE specific interview question.\n\n"
            "You will receive:\n"
            "- Question\n"
            "- Answer (transcribed from speech — may contain minor transcription artifacts)\n\n"
            "Your job:\n"
            "1. First, think step-by-step about the answer quality (do NOT output your reasoning).\n"
            "2. Then output ONLY a single integer score from 0 to 100.\n\n"
            "Evaluation criteria (weighted):\n"
            "- Relevance to the question (25%)\n"
            "- Correctness of content (25%)\n"
            "- Completeness and depth (25%)\n"
            "- Clarity of communication (25%)\n\n"
            "Scoring scale:\n"
            "- 0-20: empty, irrelevant, wrong, or unusable answer\n"
            "- 21-39: very weak answer with major misunderstanding or very low relevance\n"
            "- 40-59: weak answer with noticeable gaps in correctness, clarity, or completeness\n"
            "- 60-74: acceptable answer; relevant and partly correct, but somewhat generic, incomplete, or lacking depth\n"
            "- 75-84: good answer; mostly correct, relevant, and reasonably clear, but still missing some depth, detail, or precision\n"
            "- 85-94: very good answer; strong relevance, correctness, and clarity, with only minor weaknesses\n"
            "- 95-100: excellent answer; highly relevant, correct, clear, complete, and insightful; rare\n\n"
            "Calibration guidance:\n"
            "- Average decent answers should often fall between 60 and 75.\n"
            "- Good answers should often fall between 75 and 85.\n"
            "- Very strong answers can score in the high 80s or low 90s.\n"
            "- Scores above 95 should be rare.\n"
            "- If the answer is short or missing important detail, avoid scoring it too high.\n"
            "- If the answer covers the question well, reward it appropriately.\n"
            "- Ignore minor grammar/transcription errors; focus on substance.\n\n"
            "Important output rules:\n"
            "- Return ONLY the integer\n"
            "- No explanation, no JSON, no extra text\n"
            "- Output must be exactly one integer between 0 and 100\n"
            f"- The question/answer may be in {lang_meta['label']}; still output just the integer."
        )

        user_prompt = (
            f"Question:\n{question}\n\n"
            f"{keyword_guidance}"
            f"Answer:\n{answer_text}\n\n"
            "Score:"
        )

        max_retries = 2
        last_exc = None
        response_text = ""

        for attempt in range(1, max_retries + 1):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.1,
                    max_tokens=10,
                )
                response_text = response.choices[0].message.content or ""
                last_exc = None
                break
            except OpenAIError as exc:
                last_exc = exc
                logger.warning(
                    "score_question attempt %d/%d failed (OpenAI): %s",
                    attempt, max_retries, exc,
                )
                if attempt < max_retries:
                    time.sleep(1.5 * attempt)
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "score_question attempt %d/%d failed (unexpected): %s",
                    attempt, max_retries, exc,
                )
                if attempt < max_retries:
                    time.sleep(1.5 * attempt)

        if last_exc is not None:
            logger.exception("score_question failed after %d retries: %s", max_retries, last_exc)
            return {
                "score": None,
                "raw_response": "",
                "error": str(last_exc),
                "notes": "api_failure",
                "feedback": "",
                "suggestion": "",
            }

        logger.info(
            "score_question | raw_response=%r | question_preview=%.100s",
            response_text, question,
        )

        score_value = self._extract_numeric_score(response_text, default=0, lo=0, hi=100)

        if score_value == 0 and response_text.strip() not in ("0", "00"):
            logger.warning(
                "score_question parsed score=0 from non-zero response %r — possible parsing failure",
                response_text,
            )

        return {
            "score": score_value,
            "raw_response": response_text.strip(),
            "feedback": "",
            "suggestion": "",
        }

    def score_audio(self, video_file, audio_output_path: Optional[str] = None, language: Optional[str] = None, speech_locale: Optional[str] = None):
        target_path = audio_output_path or os.path.join(self.base_upload_dir, "temp_audio.wav")
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        lang_meta = self._resolve_language(language, speech_locale)
        self.speech.set_language(lang_meta["azure_locale"])
        try:
            audio_file = self.audio.extract_audio(video_file, target_path)
            return self.speech.run_assessment(audio_file, language=lang_meta["azure_locale"])
        except Exception as exc:
            traceback.print_exc()
            logger.warning("Audio scoring failed: %s", exc)
            return None

    def score_video(self, video_path):
        try:
            return self.video.run(video_path)
        except Exception as exc:
            traceback.print_exc()
            logger.warning("Video scoring failed: %s", exc)
            return None










    def _parse_json_response(self, text):
        import json

        cleaned = (text or "").strip()
        fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
        if fenced:
            cleaned = fenced.group(1)
        else:
            # try to extract the first JSON object in the text if present
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1 and end > start:
                cleaned = cleaned[start : end + 1]

        try:
            return json.loads(cleaned)
        except Exception:
            return {
                "score": None,
                "feedback": text,
                "suggestion": ""
            }
        
   
