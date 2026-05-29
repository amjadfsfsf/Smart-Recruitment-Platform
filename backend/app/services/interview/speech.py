import json
import os
import re
import threading
import contextlib
import wave
import logging
from collections import Counter
from statistics import mean

import numpy as np
import azure.cognitiveservices.speech as speechsdk
from dotenv import load_dotenv

from pathlib import Path

TICKS_PER_SECOND = 10_000_000
COMMON_FILLERS = {
    "um",
    "uh",
    "erm",
    "ah",
    "eh",
    "hmm",
    "mmm",
    "hem",
    "like",
    "actually",
    "basically",
    "literally",
    "right",
    "okay",
    "ok",
}
COMMON_FILLER_PHRASES = {
    "you know",
    "hem",
    "i mean",
    "sort of",
    "kind of",
}

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

    
    env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

class SpeakingAssessment:
    def __init__(self, speech_key=None, region=None, language="en-US"):
        self.speech_key = speech_key or os.getenv("AZURE_SPEECH_KEY")
        self.region = region or os.getenv("AZURE_SPEECH_REGION", "germanywestcentral")
        self.language = language

        # Pause detection thresholds (seconds), configurable via env
        self.pause_threshold_seconds = float(os.getenv("AZURE_PAUSE_THRESHOLD_SECONDS", "0.7"))
        self.long_pause_threshold_seconds = float(os.getenv("AZURE_LONG_PAUSE_THRESHOLD_SECONDS", "1.5"))

        self.speech_config = None
        self.audio_config = None
        self.pron_config = None
        self.recognizer = None

    def set_language(self, language: str):
        """
        Update the language/locale used for Azure speech configuration.
        """
        if language:
            self.language = language

    def setup_speech_config(self):
        if not self.speech_key:
            raise ValueError(
                "Azure Speech key is missing. Pass speech_key or set AZURE_SPEECH_KEY."
            )

        self.speech_config = speechsdk.SpeechConfig(
            subscription=self.speech_key,
            region=self.region,
        )
        self.speech_config.speech_recognition_language = self.language
        self.speech_config.output_format = speechsdk.OutputFormat.Detailed
        self.speech_config.request_word_level_timestamps()

    def setup_audio_config(self, audio_file):
        self.audio_config = speechsdk.audio.AudioConfig(filename=audio_file)

    def setup_pronunciation_config(self):
        self.pron_config = speechsdk.PronunciationAssessmentConfig(
            reference_text="",
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=False,
        )
        self.pron_config.enable_prosody_assessment()

    def setup_recognizer(self):
        self.recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            audio_config=self.audio_config,
        )
        self.pron_config.apply_to(self.recognizer)

    @staticmethod
    def _ticks_to_seconds(ticks):
        return round((ticks or 0) / TICKS_PER_SECOND, 3)

    @staticmethod
    def _safe_json_loads(raw_json):
        if not raw_json:
            return {}
        if isinstance(raw_json, dict):
            return raw_json
        try:
            return json.loads(raw_json)
        except (TypeError, json.JSONDecodeError):
            return {}

    @staticmethod
    def _clamp(value, minimum=0.0, maximum=100.0):
        return round(max(minimum, min(maximum, float(value))), 2)

    @staticmethod
    def _avg(values):
        return round(mean(values), 2) if values else 0.0

    @staticmethod
    def _extract_score_value(score_obj, *keys):
        if not score_obj:
            return 0.0
        for key in keys:
            if hasattr(score_obj, key):
                try:
                    return float(getattr(score_obj, key) or 0.0)
                except Exception:
                    pass
            if isinstance(score_obj, dict) and key in score_obj:
                try:
                    return float(score_obj.get(key) or 0.0)
                except Exception:
                    pass
        return 0.0

    def _collect_continuous_results(self):
        results = []
        canceled = []
        session_stopped = threading.Event()

        def recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                results.append(evt.result)

        def canceled_cb(evt):
            canceled.append(
                {
                    "reason": str(evt.reason),
                    "error_details": getattr(evt, "error_details", None),
                }
            )
            session_stopped.set()

        def stop_cb(_evt):
            session_stopped.set()

        self.recognizer.recognized.connect(recognized)
        self.recognizer.canceled.connect(canceled_cb)
        self.recognizer.session_stopped.connect(stop_cb)

        self.recognizer.start_continuous_recognition()
        session_stopped.wait()
        self.recognizer.stop_continuous_recognition()

        return results, canceled

    def _extract_best_hypothesis(self, result_json):
        nbest = result_json.get("NBest") or []
        if not nbest:
            return {}
        return nbest[0] or {}

    def _extract_words(self, utterance_result, result_json):
        best = self._extract_best_hypothesis(result_json)
        words = best.get("Words") or []
        extracted = []

        for item in words:
            extracted.append(
                {
                    "word": item.get("Word", ""),
                    "offset": item.get("Offset", 0),
                    "duration": item.get("Duration", 0),
                    "offset_seconds": self._ticks_to_seconds(item.get("Offset", 0)),
                    "duration_seconds": self._ticks_to_seconds(item.get("Duration", 0)),
                }
            )

        if not extracted and utterance_result.text:
            start = getattr(utterance_result, "offset", 0)
            duration = getattr(utterance_result, "duration", 0)
            tokens = re.findall(r"\b[\w']+\b", utterance_result.text)
            step = duration // max(len(tokens), 1) if tokens else 0
            current = start
            for token in tokens:
                extracted.append(
                    {
                        "word": token,
                        "offset": current,
                        "duration": step,
                        "offset_seconds": self._ticks_to_seconds(current),
                        "duration_seconds": self._ticks_to_seconds(step),
                    }
                )
                current += step

        return extracted

    @staticmethod
    def _normalize_token(token):
        return re.sub(r"[^a-z']+", "", token.lower())

    def _analyze_filler_words(self, transcript):
        lowered = transcript.lower()
        tokens = [self._normalize_token(token) for token in re.findall(r"\b[\w']+\b", lowered)]
        single_counter = Counter(token for token in tokens if token in COMMON_FILLERS)
        phrase_counter = Counter()

        for phrase in COMMON_FILLER_PHRASES:
            matches = re.findall(rf"\b{re.escape(phrase)}\b", lowered)
            if matches:
                phrase_counter[phrase] = len(matches)

        total_fillers = sum(single_counter.values()) + sum(phrase_counter.values())
        total_words = max(len([t for t in tokens if t]), 1)
        per_100_words = round((total_fillers / total_words) * 100, 2)

        return {
            "total_count": total_fillers,
            "per_word": dict(single_counter),
            "per_phrase": dict(phrase_counter),
            "ratio": round(total_fillers / total_words, 4),
            "per_100_words": per_100_words,
            "score": self._score_fillers(per_100_words),
        }

    def _analyze_pauses(self, words, audio_file=None, speech_rate=None):
        """
        Pause detector prioritizing Azure word-level timings.

        Primary path:
        - Sort words by start time (offset_seconds).
        - Compute gaps between end of previous word and start of current word.
        - Count pauses whose gap >= pause_threshold_seconds (default 0.7s).
        - Long pauses use long_pause_threshold_seconds (default 1.5s).
        - Ignores leading/trailing silence because only inter-word gaps are considered.

        Fallback:
        - If word timings are missing or unusable, fall back to RMS-based silence detection.
        """

        speech_rate = speech_rate or {}

        def _word_intervals():
            return [
                (
                    w.get("offset_seconds") or self._ticks_to_seconds(w.get("offset", 0)),
                    (w.get("offset_seconds") or self._ticks_to_seconds(w.get("offset", 0)))
                    + (w.get("duration_seconds") or self._ticks_to_seconds(w.get("duration", 0))),
                )
                for w in words
                if w
            ]

        def _duration_from_words():
            if not words:
                return 0.0
            start = words[0].get("offset_seconds") or self._ticks_to_seconds(words[0].get("offset", 0))
            end = (
                (words[-1].get("offset_seconds") or self._ticks_to_seconds(words[-1].get("offset", 0)))
                + (words[-1].get("duration_seconds") or self._ticks_to_seconds(words[-1].get("duration", 0)))
            )
            return max(0.0, end - start)

        def _load_waveform(path):
            with contextlib.closing(wave.open(path, "rb")) as wf:
                sample_rate = wf.getframerate() or 16_000
                sample_width = wf.getsampwidth()
                channels = wf.getnchannels() or 1
                frames = wf.readframes(wf.getnframes())

            dtype_map = {1: np.int8, 2: np.int16, 3: np.int32, 4: np.int32}
            dtype = dtype_map.get(sample_width)
            if dtype is None:
                raise ValueError(f"Unsupported sample width: {sample_width}")

            data = np.frombuffer(frames, dtype=dtype).astype(np.float32)
            if channels > 1:
                data = data.reshape(-1, channels).mean(axis=1)

            # Normalize to [-1, 1]
            max_amp = np.max(np.abs(data)) or 1.0
            data = data / max_amp
            return data, sample_rate

        def _rms_frames(samples, sample_rate, frame_ms=20, hop_ms=10):
            frame_len = int(sample_rate * (frame_ms / 1000.0))
            hop_len = int(sample_rate * (hop_ms / 1000.0))
            if frame_len <= 0 or hop_len <= 0:
                return np.array([]), 0.0

            rms_vals = []
            for start in range(0, len(samples) - frame_len + 1, hop_len):
                window = samples[start : start + frame_len]
                rms_vals.append(float(np.sqrt(np.mean(np.square(window))) + 1e-9))
            rms_vals = np.array(rms_vals, dtype=np.float32)

            # Smooth with small moving average to suppress spurious peaks
            if rms_vals.size >= 3:
                kernel = np.ones(5, dtype=np.float32) / 5.0
                rms_vals = np.convolve(rms_vals, kernel, mode="same")

            hop_seconds = hop_ms / 1000.0
            frame_seconds = frame_ms / 1000.0
            return rms_vals, (hop_seconds, frame_seconds)

        def _detect_pauses_from_audio(path):
            samples, sr = _load_waveform(path)
            rms_vals, (hop_s, frame_s) = _rms_frames(samples, sr)
            if rms_vals.size == 0:
                return []

            noise_floor = float(np.percentile(rms_vals, 20))
            speech_peak = float(np.percentile(rms_vals, 90))
            threshold = max(noise_floor * 2.5, speech_peak * 0.05, 0.01)

            # Speech-rate adaptive thresholding
            wpm = speech_rate.get("words_per_minute") or 0
            label = speech_rate.get("label")
            if label == "fast" or wpm > 160:
                threshold *= 1.15
            elif label == "slow" or (wpm and wpm < 110):
                threshold *= 0.9

            silence_mask = rms_vals < threshold

            segments = []
            start_idx = None
            for idx, is_silent in enumerate(silence_mask):
                if is_silent and start_idx is None:
                    start_idx = idx
                elif not is_silent and start_idx is not None:
                    segments.append((start_idx, idx))
                    start_idx = None
            if start_idx is not None:
                segments.append((start_idx, len(silence_mask)))

            # Convert to time ranges
            time_segments = []
            for start, end in segments:
                start_t = start * hop_s
                end_t = (end * hop_s) + frame_s
                time_segments.append((start_t, end_t))
            return time_segments

        def _merge_and_filter(segments):
            if not segments:
                return []
            merged = []
            segments = sorted(segments, key=lambda s: s[0])
            cur_start, cur_end = segments[0]
            for start, end in segments[1:]:
                gap = start - cur_end
                if gap < 0.1:  # merge if less than 100 ms gap between silences
                    cur_end = max(cur_end, end)
                else:
                    merged.append((cur_start, cur_end))
                    cur_start, cur_end = start, end
            merged.append((cur_start, cur_end))

            # Drop micro-gaps (<200 ms) and keep only valid pauses (>= configured threshold)
            filtered = []
            for start, end in merged:
                duration = end - start
                if duration < 0.2:
                    continue
                if duration < self.pause_threshold_seconds:
                    continue
                filtered.append((start, end))
            return filtered

        def _exclude_intra_word(segments, intervals):
            if not intervals:
                return segments
            cleaned = []
            for start, end in segments:
                midpoint = (start + end) / 2.0
                inside_word = any(a <= midpoint <= b for a, b in intervals)
                if not inside_word:
                    cleaned.append((start, end))
            return cleaned

        def _detect_pauses_from_words(word_items):
            if not word_items:
                return []
            sorted_words = sorted(
                word_items,
                key=lambda w: w.get("offset_seconds") or self._ticks_to_seconds(w.get("offset", 0)),
            )
            pauses_local = []
            for prev, cur in zip(sorted_words, sorted_words[1:]):
                prev_end = (
                    (prev.get("offset_seconds") or self._ticks_to_seconds(prev.get("offset", 0)))
                    + (prev.get("duration_seconds") or self._ticks_to_seconds(prev.get("duration", 0)))
                )
                cur_start = cur.get("offset_seconds") or self._ticks_to_seconds(cur.get("offset", 0))
                gap = max(cur_start - prev_end, 0)
                if gap >= self.pause_threshold_seconds:
                    pauses_local.append((prev_end, cur_start))
            return pauses_local

        # Primary: gaps from Azure word timings
        time_segments = _detect_pauses_from_words(words)

        # Fallback to waveform-based detection only if word timings are missing
        if not time_segments and audio_file and os.path.exists(audio_file):
            try:
                time_segments = _detect_pauses_from_audio(audio_file)
            except Exception as exc:  # graceful fallback
                logger.warning("Pause detection fallback to word gaps after audio failure: %s", exc)
                time_segments = _detect_pauses_from_words(words)

        merged = _merge_and_filter(time_segments)
        merged = _exclude_intra_word(merged, _word_intervals())

        pauses = []
        for start, end in merged:
            duration = round(end - start, 3)
            category = "short" if duration < self.pause_threshold_seconds else "long" if duration >= self.long_pause_threshold_seconds else "medium"
            pauses.append(
                {
                    "start_seconds": round(start, 3),
                    "end_seconds": round(end, 3),
                    "duration_seconds": duration,
                    "category": category,
                }
            )

        # Metrics
        pause_lengths = [p["duration_seconds"] for p in pauses]
        average_pause = round(mean(pause_lengths), 3) if pause_lengths else 0.0
        max_pause = round(max(pause_lengths), 3) if pause_lengths else 0.0
        long_pause_count = len([p for p in pauses if p["duration_seconds"] >= self.long_pause_threshold_seconds])
        total_silence = round(sum(pause_lengths), 3)
        speech_duration = speech_rate.get("duration_seconds") or speech_rate.get("speech_duration_seconds") or _duration_from_words()
        pause_ratio = round(total_silence / speech_duration, 4) if speech_duration else 0.0

        # Validation: cap unrealistic pause density (~1 pause per second)
        max_reasonable = int((speech_duration or 0) + 1)
        validation_note = None
        if max_reasonable and len(pauses) > max_reasonable:
            validation_note = f"Pause count capped from {len(pauses)} to {max_reasonable} to avoid unrealistic density."
            pauses = pauses[:max_reasonable]
            pause_lengths = [p["duration_seconds"] for p in pauses]
            average_pause = round(mean(pause_lengths), 3) if pause_lengths else 0.0
            max_pause = round(max(pause_lengths), 3) if pause_lengths else 0.0
            long_pause_count = len([p for p in pauses if p["duration_seconds"] > 1.5])
            total_silence = round(sum(pause_lengths), 3)
            pause_ratio = round(total_silence / speech_duration, 4) if speech_duration else 0.0

        debug_log = [
            f"pause #{idx+1}: {p['start_seconds']:.3f}s - {p['end_seconds']:.3f}s "
            f"({p['duration_seconds']:.3f}s, {p['category']})"
            for idx, p in enumerate(pauses)
        ]
        if validation_note:
            debug_log.append(validation_note)

        # Optional ASCII timeline for quick inspection
        timeline = None
        try:
            total_duration = max(speech_duration, pauses[-1]["end_seconds"] if pauses else 0)
            if total_duration > 0:
                width = 80
                timeline_chars = ["·"] * width
                for p in pauses:
                    start_idx = int((p["start_seconds"] / total_duration) * (width - 1))
                    end_idx = int((p["end_seconds"] / total_duration) * (width - 1))
                    for i in range(start_idx, min(width, end_idx + 1)):
                        timeline_chars[i] = "|"
                timeline = "".join(timeline_chars)
        except Exception:
            timeline = None

        return {
            "count": len(pauses),
            "long_pause_threshold_seconds": self.long_pause_threshold_seconds,
            "long_pause_count": long_pause_count,
            "average_pause_seconds": average_pause,
            "max_pause_seconds": max_pause,
            "total_silence_seconds": total_silence,
            "pause_ratio": pause_ratio,
            "categories": {
                "short": len([p for p in pauses if p["category"] == "short"]),
                "medium": len([p for p in pauses if p["category"] == "medium"]),
                "long": long_pause_count,
            },
            "score": self._score_pauses(average_pause, long_pause_count, max_pause, pause_ratio),
            "pauses": pauses,
            "debug_log": debug_log,
            "timeline": timeline,
        }

    def _analyze_speech_rate(self, transcript, words, utterance_results):
        word_count = len(re.findall(r"\b[\w']+\b", transcript))

        if words:
            speech_duration_ticks = max(
                words[-1]["offset"] + words[-1]["duration"] - words[0]["offset"],
                0,
            )
        else:
            speech_duration_ticks = sum(getattr(r, "duration", 0) or 0 for r in utterance_results)

        speech_duration_seconds = max(self._ticks_to_seconds(speech_duration_ticks), 0.001)
        words_per_minute = round((word_count / speech_duration_seconds) * 60, 2)
        rate_score = self._score_speech_rate(words_per_minute)

        if words_per_minute < 110:
            label = "slow"
        elif words_per_minute <= 160:
            label = "normal"
        else:
            label = "fast"
        rate_label = label.capitalize()

        return {
            "word_count": word_count,
            "total_words": word_count,
            "speech_duration_seconds": round(speech_duration_seconds, 3),
            "duration_seconds": round(speech_duration_seconds, 3),
            "words_per_minute": words_per_minute,
            "label": label,
            "rate_label": rate_label,
            "score": rate_score,
        }

    def _analyze_transcript_quality(self, transcript):
        stripped = transcript.strip()
        words = re.findall(r"\b[\w']+\b", stripped.lower())
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", stripped) if s.strip()]
        unique_words = set(words)
        avg_words_per_sentence = round(len(words) / max(len(sentences), 1), 2) if words else 0.0
        lexical_diversity = round(len(unique_words) / max(len(words), 1), 4)
        quality_score = self._score_transcript_quality(len(words), lexical_diversity, len(sentences))

        return {
            "transcript": stripped,
            "character_count": len(stripped),
            "word_count": len(words),
            "sentence_count": len(sentences),
            "average_words_per_sentence": avg_words_per_sentence,
            "lexical_diversity": lexical_diversity,
            "score": quality_score,
            "minimum_answer_length_met": len(words) >= 20,
        }

    def _build_azure_scores(self, pa_results, best_hypotheses):
        accuracy_scores = [
            self._extract_score_value(score, "accuracy_score", "AccuracyScore") for score in pa_results if score
        ]
        fluency_scores = [
            self._extract_score_value(score, "fluency_score", "FluencyScore") for score in pa_results if score
        ]
        prosody_scores = [
            self._extract_score_value(score, "prosody_score", "ProsodyScore") for score in pa_results if score
        ]
        completeness_scores = [
            self._extract_score_value(score, "completeness_score", "CompletenessScore") for score in pa_results if score
        ]
        confidence_scores = [
            hypothesis.get("Confidence")
            for hypothesis in best_hypotheses
            if hypothesis.get("Confidence") is not None
        ]

        accuracy = self._clamp(self._avg(accuracy_scores))
        fluency = self._clamp(self._avg(fluency_scores))
        prosody = self._clamp(self._avg(prosody_scores))
        completeness = self._clamp(self._avg(completeness_scores))
        raw_confidence = self._avg(confidence_scores)
        confidence_score = self._clamp(raw_confidence * 100)
        clarity = self._clamp((accuracy * 0.7) + (confidence_score * 0.3))

        final_score = self._clamp(
            (accuracy * 0.25)
            + (fluency * 0.20)
            + (prosody * 0.15)
            + (completeness * 0.20)
            + (clarity * 0.20)
        )

        return {
            "accuracy": accuracy,
            "fluency": fluency,
            "prosody": prosody,
            "completeness": completeness,
            "confidence_raw": raw_confidence,
            "confidence_score": confidence_score,
            "clarity_intelligibility": clarity,
            "final_score": final_score,
        }

    def _score_speech_rate(self, wpm):
        if wpm <= 0:
            return 0.0
        if wpm < 60:
            return self._clamp(20 + ((wpm / 60) * 20))
        if wpm < 80:
            return self._clamp(40 + (((wpm - 60) / 20) * 15))
        if wpm < 110:
            return self._clamp(55 + (((wpm - 80) / 30) * 15))
        if wpm <= 160:
            return 100.0
        if wpm <= 190:
            return self._clamp(100 - (((wpm - 160) / 30) * 20))
        return self._clamp(max(40, 80 - (((wpm - 190) / 40) * 20)))

    def _score_pauses(self, average_pause, long_pause_count, max_pause, pause_ratio=0.0):
        if average_pause == 0 and long_pause_count == 0 and max_pause == 0:
            return 90.0

        score = 100.0

        # Average pause quality
        if average_pause < 0.3:
            score -= 5  # very few pauses can feel rushed
        elif average_pause <= 0.7:
            score -= 0  # natural range
        elif average_pause <= 1.0:
            score -= 10
        elif average_pause <= 1.5:
            score -= 20
        else:
            score -= 30

        # Long pauses penalize fluency more heavily
        score -= min(long_pause_count * 10, 35)

        # Excessively long single pauses
        if max_pause > 3.0:
            score -= 15
        elif max_pause > 2.0:
            score -= 8

        # Pause ratio guards against too much silence overall
        if pause_ratio > 0.35:
            score -= 20
        elif pause_ratio > 0.25:
            score -= 10

        return self._clamp(score)

    def _score_fillers(self, fillers_per_100_words):
        return self._clamp(100 - (fillers_per_100_words * 5))

    def _score_transcript_quality(self, word_count, lexical_diversity, sentence_count):
        length_score = 100.0 if word_count >= 40 else (word_count / 40) * 100
        diversity_score = self._clamp(lexical_diversity * 100)
        sentence_score = 100.0 if sentence_count >= 2 else 50.0 if sentence_count == 1 else 0.0

        return self._clamp((length_score * 0.5) + (diversity_score * 0.3) + (sentence_score * 0.2))

    def _build_interview_target_scores(
        self,
        azure_scores,
        speech_rate,
        pause_analysis,
        filler_words,
        transcript_quality,
    ):
        confidence = self._clamp(
            (azure_scores["prosody"] * 0.30)
            + (pause_analysis["score"] * 0.25)
            + (filler_words["score"] * 0.20)
            + (speech_rate["score"] * 0.25)
        )

        communication = self._clamp(
            (azure_scores["clarity_intelligibility"] * 0.30)
            + (azure_scores["fluency"] * 0.25)
            + (transcript_quality["score"] * 0.25)
            + (azure_scores["completeness"] * 0.20)
        )

        fluency = self._clamp(
            (azure_scores["fluency"] * 0.50)
            + (pause_analysis["score"] * 0.25)
            + (speech_rate["score"] * 0.25)
        )

        answer_quality = self._clamp(
            (transcript_quality["score"] * 0.60)
            + (azure_scores["completeness"] * 0.25)
            + (filler_words["score"] * 0.15)
        )

        return {
            "confidence": confidence,
            "communication": communication,
            "eye_contact": None,
            "fluency": fluency,
            "answer_quality": answer_quality,
            "overall_audio_readiness": self._clamp(
                (confidence * 0.25)
                + (communication * 0.30)
                + (fluency * 0.25)
                + (answer_quality * 0.20)
            ),
            "notes": {
                "eye_contact": "Not available in speech.py. This should come from the video-analysis module.",
                "answer_quality": "This is a lightweight proxy based on transcript quality and not true semantic relevance to the interview question.",
            },
            }
    def run_assessment(self, audio_file, language: str | None = None):
        if language:
            self.set_language(language)
        self.setup_speech_config()
        self.setup_audio_config(audio_file)
        self.setup_pronunciation_config()
        self.setup_recognizer()

        utterance_results, canceled = self._collect_continuous_results()
        if canceled and not utterance_results:
            return {"error": canceled}
        if not utterance_results:
            return {"error": "No speech recognized."}

        utterance_payloads = []
        all_words = []
        pa_results = []
        best_hypotheses = []
        transcript_parts = []

        for result in utterance_results:
            result_json = self._safe_json_loads(getattr(result, "json", None))
            best = self._extract_best_hypothesis(result_json)
            words = self._extract_words(result, result_json)

            pronunciation = best.get("PronunciationAssessment", {}) if isinstance(best, dict) else {}

            accuracy_score = float(pronunciation.get("AccuracyScore", 0.0) or 0.0)
            fluency_score = float(pronunciation.get("FluencyScore", 0.0) or 0.0)
            prosody_score = float(pronunciation.get("ProsodyScore", 0.0) or 0.0)
            completeness_score = float(pronunciation.get("CompletenessScore", 0.0) or 0.0)

            pa_results.append(pronunciation)
            best_hypotheses.append(best)
            transcript_parts.append(best.get("Display") or result.text or "")
            all_words.extend(words)

            utterance_payloads.append(
                {
                    "text": best.get("Display") or result.text,
                    "lexical": best.get("Lexical"),
                    "confidence_raw": best.get("Confidence"),
                    "confidence_score": self._clamp((best.get("Confidence") or 0) * 100),
                    "offset_seconds": self._ticks_to_seconds(getattr(result, "offset", 0)),
                    "duration_seconds": self._ticks_to_seconds(getattr(result, "duration", 0)),
                    "accuracy": round(accuracy_score, 2),
                    "fluency": round(fluency_score, 2),
                    "prosody": round(prosody_score, 2),
                    "completeness": round(completeness_score, 2),
                    "words": words,
                }
            )

        transcript = " ".join(part.strip() for part in transcript_parts if part and part.strip()).strip()
        azure_scores = self._build_azure_scores(pa_results, best_hypotheses)
        speech_rate = self._analyze_speech_rate(transcript, all_words, utterance_results)
        pause_analysis = self._analyze_pauses(all_words, audio_file=audio_file, speech_rate=speech_rate)
        filler_words = self._analyze_filler_words(transcript)
        transcript_quality = self._analyze_transcript_quality(transcript)
        interview_scores = self._build_interview_target_scores(
            azure_scores,
            speech_rate,
            pause_analysis,
            filler_words,
            transcript_quality,
        )

        return {
            "azure_scores": azure_scores,
            "speech_rate": speech_rate,
            "pause_analysis": pause_analysis,
            "filler_words": filler_words,
            "clarity_intelligibility": {
                "score": azure_scores["clarity_intelligibility"],
                "based_on": {
                    "accuracy": azure_scores["accuracy"],
                    "confidence_raw": azure_scores["confidence_raw"],
                    "confidence_score": azure_scores["confidence_score"],
                },
            },
            "transcript_quality": transcript_quality,
            "interview_target_scores": interview_scores,
            "utterances": utterance_payloads,
            "notes": [
                "All derived scoring outputs are normalized to a 0-100 scale except confidence_raw, which remains the original Azure confidence value (0-1).",
                "Speech rate, pause analysis, filler-word counts, and transcript-quality metrics are derived from Azure transcription output.",
                "Pronunciation, fluency, prosody, and completeness come directly from Azure Pronunciation Assessment.",
                "This file prepares audio-side scoring for a final mock interview report, but eye contact still needs to be supplied by the video-analysis module.",
            ],
        }
