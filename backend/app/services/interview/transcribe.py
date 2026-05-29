import os
import re
import subprocess
import uuid
import logging
import threading
import whisper
import torch
import azure.cognitiveservices.speech as speechsdk
from xml.sax.saxutils import escape

logger = logging.getLogger(__name__)

os.environ["PATH"] += os.pathsep + r"C:\Users\amjad\Downloads\ffmpeg-8.1-essentials_build\bin"

# ─────────────────────────────────────────────────────────────────────────────
# Mixed Arabic/English token detector
#
# Matches any run that is "English" — defined as:
#   • ASCII-letter words optionally containing hyphens (e.g. multi-cloud)
#   • Slash-joined abbreviations or acronyms  (CI/CD, TCP/IP, A/B)
#   • Dotted version strings                  (v2.0, Node.js, .NET)
#   • All-uppercase acronyms                  (API, ML, NLP, SQL)
#   • Numeric tokens (pure numbers are language-neutral, left as-is)
#
# The regex is anchored by Unicode word boundaries so it never splits
# Arabic characters from their diacritics or each other.
# ─────────────────────────────────────────────────────────────────────────────
ENGLISH_TOKEN_RE = re.compile(
    r"""
    (?<![\u0600-\u06FF\w])   # not preceded by Arabic or word char
    (?:
        # Slash-joined tokens: CI/CD, TCP/IP, A/B, GraphQL/REST
        [A-Za-z][\w]*(?:/[A-Za-z][\w]*)+
        |
        # Dotted tokens: Node.js, .NET, v2.0, Vue.js
        \.?[A-Za-z][\w]*(?:\.[\w]+)+
        |
        # Hyphenated tokens: multi-cloud, end-to-end
        [A-Za-z][\w]*(?:-[A-Za-z][\w]*)+
        |
        # Plain ASCII words (including ALL-CAPS acronyms >= 2 chars)
        [A-Za-z]{2,}
        |
        # Single uppercase letter kept only if surrounded by spaces (e.g. "A record")
        (?<= )[A-Z](?= )
    )
    (?![\u0600-\u06FF\w])   # not followed by Arabic or word char
    """,
    re.VERBOSE,
)

# ─────────────────────────────────────────────────────────────────────────────
# Arabic TTS voice priority
#
# 1st choice : ar-SA-HamedNeural   – warm male voice, ideal for interview Q&A
# 2nd choice : ar-SA-ZariyahNeural – clear female voice
# 3rd choice : ar-AE-FatimaNeural  – Gulf-dialect fallback
# ─────────────────────────────────────────────────────────────────────────────
ARABIC_TTS_VOICE_FALLBACKS = [
    {"locale": "ar-SA", "voice": "ar-SA-HamedNeural"},
    {"locale": "ar-SA", "voice": "ar-SA-ZariyahNeural"},
    {"locale": "ar-AE", "voice": "ar-AE-FatimaNeural"},
]

ARABIC_DIACRITIC_HINTS = {
    "مرحبا": "مَرْحَبًا",
    "مرحبًا": "مَرْحَبًا",
    "كيف": "كَيْفَ",
    "يمكنني": "يُمْكِنُنِي",
    "مساعدتك": "مُسَاعَدَتُكَ",
    "اليوم": "اليَوْم",
    "السؤال": "السُّؤَال",
    "حدثني": "حَدِّثْنِي",
    "عن": "عَنْ",
    "نفسك": "نَفْسِكَ",
    "ما": "مَا",
    "هي": "هِيَ",
    "نقاط": "نُقَاط",
    "قوتك": "قُوَّتِكَ",
    "لماذا": "لِمَاذَا",
    "تريد": "تُرِيد",
    "العمل": "العَمَل",
    "في": "فِي",
    "هذا": "هَذَا",
    "المجال": "المَجَال",
    "اشرح": "اِشْرَح",
    "تجربة": "تَجْرِبَة",
    "مشروع": "مَشْرُوع",
    "تحدي": "تَحَدٍّ",
    "واجهته": "وَاجَهْتَه",
    "مهاراتك": "مَهَارَاتِكَ",
}

# ─────────────────────────────────────────────────────────────────────────────
# Per-language TTS settings
#
# rate   : Relative speaking pace.  "-10%" gives a calm, interview-pace cadence
#           without sounding unnaturally slow.
# pitch  : "+2%" adds a subtle upward warmth so questions don't sound flat.
# style  : "customerservice" is the closest neutral-professional style that is
#           supported by all three Arabic neural voices above.
# ─────────────────────────────────────────────────────────────────────────────
AZURE_TTS_SETTINGS = {
    "ar": {
        "voices": ARABIC_TTS_VOICE_FALLBACKS,
        "rate": "-10%",
        "pitch": "+2%",
        "style": "customerservice",
    },
    "ar-SA": {
        "voices": ARABIC_TTS_VOICE_FALLBACKS,
        "rate": "-10%",
        "pitch": "+2%",
        "style": "customerservice",
    },
    "ar-JO": {
        "voices": ARABIC_TTS_VOICE_FALLBACKS,
        "rate": "-10%",
        "pitch": "+2%",
        "style": "customerservice",
    },
    "ar-AE": {
        "voices": ARABIC_TTS_VOICE_FALLBACKS,
        "rate": "-10%",
        "pitch": "+2%",
        "style": "customerservice",
    },
    "en": {
        "voices": [{"locale": "en-US", "voice": "en-US-AvaMultilingualNeural"}],
        "rate": "0%",
        "pitch": "0%",
        "style": None,
    },
    "en-US": {
        "voices": [{"locale": "en-US", "voice": "en-US-AvaMultilingualNeural"}],
        "rate": "0%",
        "pitch": "0%",
        "style": None,
    },
}

class AudioPipelineService:
    def __init__(self, default_locale: str = "en-US", default_tts_lang: str = "en"):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = whisper.load_model("base", device=device)  # fallback only
        self.speech_key = os.getenv("AZURE_SPEECH_KEY")
        self.speech_region = os.getenv("AZURE_SPEECH_REGION", "germanywestcentral")
        self.default_locale = default_locale
        self.default_tts_lang = default_tts_lang

    def set_locale(self, speech_locale: str | None = None, tts_lang: str | None = None):
        """
        Update the default locales used for speech recognition and TTS generation.
        """
        if speech_locale:
            self.default_locale = speech_locale
        if tts_lang:
            self.default_tts_lang = tts_lang

    def extract_audio(self, input_file: str, output_file: str):
        ffmpeg_path = r"C:\Users\amjad\Downloads\ffmpeg-8.1-essentials_build\bin\ffmpeg.exe"

        command = [
            ffmpeg_path,
            "-i", input_file,
            "-ar", "16000",
            "-ac", "1",
            "-y",
            output_file
        ]

        subprocess.run(command, check=True)
        return output_file

    def transcribe_audio(self, audio_file: str, locale: str | None = None, whisper_lang: str | None = None) -> str:
        """
        Primary: Azure Speech-to-Text. Fallback: local Whisper.
        """
        transcript, _ = self.transcribe_audio_with_source(audio_file, locale=locale, whisper_lang=whisper_lang)
        return transcript

    def transcribe_audio_with_source(self, audio_file: str, locale: str | None = None, whisper_lang: str | None = None):
        """
        Returns (transcript, provider) where provider is 'azure' or 'fallback_local'.
        Uses continuous recognition to capture the full audio, not just the
        first utterance (~15 s) that recognize_once() returns.
        """
        target_locale = locale or self.default_locale or "en-US"
        if self.speech_key:
            try:
                speech_config = speechsdk.SpeechConfig(
                    subscription=self.speech_key,
                    region=self.speech_region,
                )
                speech_config.speech_recognition_language = target_locale
                audio_config = speechsdk.audio.AudioConfig(filename=audio_file)
                recognizer = speechsdk.SpeechRecognizer(
                    speech_config=speech_config, audio_config=audio_config
                )

                segments: list[str] = []
                done_event = threading.Event()

                def _on_recognized(evt):
                    if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech and evt.result.text:
                        segments.append(evt.result.text)

                def _on_canceled(evt):
                    done_event.set()

                def _on_stopped(evt):
                    done_event.set()

                recognizer.recognized.connect(_on_recognized)
                recognizer.canceled.connect(_on_canceled)
                recognizer.session_stopped.connect(_on_stopped)

                recognizer.start_continuous_recognition()
                done_event.wait(timeout=300)
                recognizer.stop_continuous_recognition()

                full_text = " ".join(segments).strip()
                if full_text:
                    logger.debug("Azure continuous transcription produced %d chars from %s", len(full_text), audio_file)
                    return full_text, "azure"
                else:
                    logger.warning("Azure continuous transcription returned empty for %s", audio_file)
            except Exception:
                logger.exception("Azure continuous transcription failed for %s", audio_file)
                pass

        # Whisper fallback (kept for resilience)
        try:
            fallback_lang = whisper_lang or (target_locale.split("-")[0] if "-" in target_locale else target_locale) or "en"
            result = self.model.transcribe(audio_file, language=fallback_lang)
            return result.get("text", ""), "fallback_local"
        except Exception:
            return "", "fallback_local"

    def audio_to_text(self, video_file: str) -> str:
        """
        Extract audio from the given video into a unique temp file to avoid collisions
        when multiple analyses run in parallel, then transcribe it.
        """
        temp_dir = os.path.join(os.path.dirname(video_file) or ".", "tmp_audio")
        os.makedirs(temp_dir, exist_ok=True)
        wav_file = os.path.join(temp_dir, f"temp_audio_{uuid.uuid4().hex}.wav")

        print("Extracting audio...")
        self.extract_audio(video_file, wav_file)

        print("Converting to text...")
        text, _ = self.transcribe_audio_with_source(wav_file)

        try:
            os.remove(wav_file)
        except Exception:
            pass

        return text

    def _resolve_tts_settings(self, lang: str | None = None):
        requested = (lang or self.default_tts_lang or "").strip()
        if requested in AZURE_TTS_SETTINGS:
            return AZURE_TTS_SETTINGS[requested]

        locale = (self.default_locale or "").strip()
        if locale in AZURE_TTS_SETTINGS:
            return AZURE_TTS_SETTINGS[locale]

        # Broad Arabic match (e.g. "ar-EG", "ar-MA") → use SA settings
        if requested.startswith("ar") or locale.startswith("ar"):
            return AZURE_TTS_SETTINGS["ar"]
        return AZURE_TTS_SETTINGS["en"]

    def _prepare_tts_text(self, text: str, locale: str) -> str:
        """Normalise whitespace and apply Arabic diacritic hints.

        NOTE: this method returns *plain* text (not SSML). XML escaping and
        break-tag injection happen later in ``_build_ssml`` so that we never
        double-escape entities.
        """
        prepared = re.sub(r"\s+", " ", str(text or "").strip())
        if not locale.startswith("ar") or not prepared:
            return prepared

        for plain, diacritized in ARABIC_DIACRITIC_HINTS.items():
            prepared = re.sub(rf"(?<!\w){re.escape(plain)}(?!\w)", diacritized, prepared)

        # Ensure the text ends with a sentence terminator so the voice falls
        # naturally at the end of the last sentence.
        if not re.search(r"[.!؟?]$", prepared):
            prepared += "؟"
        return prepared

    # ──────────────────────────────────────────────────────────────────────
    # SSML helpers
    # ──────────────────────────────────────────────────────────────────────

    @staticmethod
    def _inject_arabic_breaks(escaped_text: str) -> str:
        """Insert SSML ``<break>`` tags into *already-escaped* Arabic text.

        The text has already been processed by ``xml.sax.saxutils.escape`` so
        it is safe to inject literal XML tags here without re-escaping.

        Pause strategy
        ──────────────
        • 600 ms after a sentence terminator (. ! ? ؟) followed by a space
          → gives the listener time to absorb the question.
        • 350 ms after a clause separator (, : ،) followed by a space
          → natural breath-point between clauses.
        """
        # Sentence-ending terminators – long pause
        escaped_text = re.sub(
            r'([.!?؟])( +)',
            r'\1<break time="600ms"/>\2',
            escaped_text,
        )
        # Clause separators – shorter pause
        escaped_text = re.sub(
            r'([,،:])( +)',
            r'\1<break time="350ms"/>\2',
            escaped_text,
        )
        return escaped_text

    @staticmethod
    def _tokenize_mixed_arabic_english(text: str) -> list[tuple[str, str]]:
        """Split plain text into a list of ``(kind, span)`` tuples.

        ``kind`` is either ``'ar'`` (Arabic / neutral) or ``'en'`` (English).

        The function uses ``ENGLISH_TOKEN_RE`` to locate all English tokens and
        then yields everything in between them as Arabic spans.  Purely numeric
        tokens (e.g. "2024", "3") are treated as neutral Arabic spans so they
        are not wrapped in a language tag and don't disrupt prosody.

        Examples
        ────────
        "أنا أستخدم Docker و Kubernetes"
          → [(ar, 'أنا أستخدم '), (en, 'Docker'), (ar, ' و '),
             (en, 'Kubernetes')]

        "نستخدم CI/CD و v2.0 في المشروع"
          → [(ar, 'نستخدم '), (en, 'CI/CD'), (ar, ' و '),
             (en, 'v2.0'), (ar, ' في المشروع')]
        """
        tokens: list[tuple[str, str]] = []
        cursor = 0
        for m in ENGLISH_TOKEN_RE.finditer(text):
            start, end = m.start(), m.end()
            # Arabic / neutral span before this English token
            if start > cursor:
                tokens.append(("ar", text[cursor:start]))
            tokens.append(("en", m.group()))
            cursor = end
        # Remaining Arabic tail
        if cursor < len(text):
            tokens.append(("ar", text[cursor:]))
        return tokens

    def _build_mixed_ssml_body(self, plain_text: str, locale: str) -> str:
        """Convert plain mixed-language text into a well-formed SSML fragment.

        Pipeline per span
        ─────────────────
        Arabic span  → diacritic hints → XML-escape → break injection
        English span → XML-escape → wrap in ``<lang xml:lang="en-US">``

        The result is a string of inline SSML suitable for embedding directly
        inside a ``<prosody>`` element — no surrounding tags are added here.
        """
        is_arabic = locale.startswith("ar")
        if not is_arabic:
            # Non-Arabic locale: single span, no language switching needed
            return self._inject_arabic_breaks(escape(plain_text))

        tokens = self._tokenize_mixed_arabic_english(plain_text)
        parts: list[str] = []
        for kind, span in tokens:
            if not span:
                continue
            if kind == "en":
                # English term: escape and wrap for native English pronunciation
                parts.append(f'<lang xml:lang="en-US">{escape(span)}</lang>')
            else:
                # Arabic span: apply diacritic hints first, then escape & breaks
                ar_prepared = span
                for plain_word, diacritized in ARABIC_DIACRITIC_HINTS.items():
                    ar_prepared = re.sub(
                        rf"(?<!\w){re.escape(plain_word)}(?!\w)",
                        diacritized,
                        ar_prepared,
                    )
                parts.append(self._inject_arabic_breaks(escape(ar_prepared)))

        return "".join(parts)

    def _build_ssml(self, text: str, settings: dict, voice_settings: dict) -> str:
        """Build a rich SSML document for Azure Neural TTS.

        For Arabic locales the body is built by ``_build_mixed_ssml_body`` which
        automatically detects English technical terms (Docker, Kubernetes, CI/CD,
        ML, API …) and wraps each one in ``<lang xml:lang="en-US">`` so Azure
        pronounces them with native English phonetics while keeping the main
        Arabic voice for the surrounding text.

        Final SSML structure (Arabic)
        ─────────────────────────────
        <speak version="1.0" xml:lang="ar-SA">
          <voice name="ar-SA-HamedNeural">
            <mstts:express-as style="customerservice">
              <prosody rate="-10%" pitch="+2%">
                أنا أستخدم
                <lang xml:lang="en-US">Docker</lang>
                و
                <lang xml:lang="en-US">Kubernetes</lang>
                في المشروع؟<break time="600ms"/>
              </prosody>
            </mstts:express-as>
          </voice>
        </speak>
        """
        locale = voice_settings["locale"]
        voice  = voice_settings["voice"]
        rate   = settings["rate"]
        pitch  = settings["pitch"]
        style  = settings.get("style")

        # 1. Normalise whitespace and add terminal punctuation (Arabic only).
        #    Diacritic substitution is deferred to _build_mixed_ssml_body so it
        #    runs per-span after tokenisation, never on English tokens.
        plain = re.sub(r"\s+", " ", str(text or "").strip())
        if locale.startswith("ar") and plain and not re.search(r"[.!؟?]$", plain):
            plain += "؟"

        # 2. Build the mixed-language SSML body (escape + lang-tag wrapping).
        #    For non-Arabic locales this reduces to a simple escape() call.
        ssml_body = self._build_mixed_ssml_body(plain, locale)

        # 3. Wrap in <prosody>.
        prosody_block = (
            f'        <prosody rate="{rate}" pitch="{pitch}">\n'
            f'          {ssml_body}\n'
            f'        </prosody>\n'
        )

        # 4. Optionally wrap in <mstts:express-as>.
        if style:
            inner = (
                f'      <mstts:express-as style="{style}">\n'
                f'{prosody_block}'
                f'      </mstts:express-as>\n'
            )
        else:
            inner = prosody_block

        # 5. Assemble the final SSML document.
        return (
            '<speak version="1.0"\n'
            '       xmlns="http://www.w3.org/2001/10/synthesis"\n'
            '       xmlns:mstts="http://www.w3.org/2001/mstts"\n'
            f'       xml:lang="{locale}">\n'
            f'  <voice name="{voice}">\n'
            f'{inner}'
            '  </voice>\n'
            '</speak>'
        )

    def text_to_audio(self, text, filename="question.mp3", output_dir="uploads/audio", lang=None):
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, filename)

        if not self.speech_key:
            raise ValueError(
                "Azure Speech key is missing. Set AZURE_SPEECH_KEY before generating TTS audio."
            )

        settings = self._resolve_tts_settings(lang)
        speech_config = speechsdk.SpeechConfig(
            subscription=self.speech_key,
            region=self.speech_region,
        )
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3
        )
        audio_config = speechsdk.audio.AudioOutputConfig(filename=filepath)
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )

        failures = []
        for voice_settings in settings["voices"]:
            ssml = self._build_ssml(text, settings, voice_settings)
            result = synthesizer.speak_ssml_async(ssml).get()
            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                return filepath
            if result.reason == speechsdk.ResultReason.Canceled:
                details = speechsdk.SpeechSynthesisCancellationDetails(result)
                failures.append(
                    f'{voice_settings["voice"]}: {details.reason}; {details.error_details}'
                )
            else:
                failures.append(f'{voice_settings["voice"]}: {result.reason}')

        raise RuntimeError("Azure speech synthesis failed for all configured voices: " + " | ".join(failures))
