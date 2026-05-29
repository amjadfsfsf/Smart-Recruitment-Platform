"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import SectionHeader from "@/components/SectionHeader";
import {
  completeInterview,
  fetchInterviewSession,
  getCurrentUser,
  startInterview,
  startCompanyInterview,
  submitInterviewAnswer,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { normalizeAnalysisEnvelope } from "@/lib/interviewAnalysis";

const DEFAULT_THINKING_SECONDS = 30;
const DEFAULT_ANSWER_SECONDS = 60;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const INTERVIEW_AI_BORDER =
  "border border-transparent bg-[linear-gradient(145deg,rgba(11,16,32,0.96),rgba(17,24,39,0.9))_padding-box,linear-gradient(120deg,rgba(139,92,246,0.62),rgba(59,130,246,0.48),rgba(6,182,212,0.58))_border-box] shadow-[0_0_12px_rgba(139,92,246,0.12),0_20px_64px_rgba(0,0,0,0.24)]";
const INTERVIEW_AI_BORDER_SUBTLE =
  "border border-transparent bg-[linear-gradient(145deg,rgba(17,24,39,0.92),rgba(19,28,49,0.84))_padding-box,linear-gradient(120deg,rgba(139,92,246,0.44),rgba(59,130,246,0.34),rgba(6,182,212,0.42))_border-box] shadow-[0_0_10px_rgba(59,130,246,0.09)]";
const INTERVIEW_AI_HOVER =
  "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(59,130,246,0.18),0_24px_70px_rgba(0,0,0,0.3)]";

const LANGUAGE_META = {
  en: { code: "en", label: "English", azureLocale: "en-US" },
  ar: { code: "ar", label: "العربية", azureLocale: "ar-SA" },
};

const COPY = {
  en: {
    headerTitle: "AI Interview Session",
    headerDesc: "Audio-only questions with timed thinking and answer phases.",
    statQuestion: "Question",
    statStatus: "Status",
    statTimer: "Timer",
    statusPlaying: "Playing question audio",
    statusThinking: "Thinking",
    statusAnsweringRecording: "Recording answer",
    statusAnswering: "Answer time",
    statusUploading: "Uploading answer",
    statusProcessing: "Finalizing",
    statusFinished: "Finished",
    statusPreparing: "Preparing",
    preparingFirstQuestion: "Preparing first question audio...",
    preparingNextQuestion: "Preparing next question...",
    thinking: "Thinking...",
    answerTimeRecording: "Answer time. Recording in progress.",
    uploadingAnswer: "Uploading answer...",
    finalizing: "Finalizing interview and running analysis...",
    interviewComplete: "Interview complete.",
    startAnswerBtn: "Start Answer",
    stopAnswerBtn: "Stop Answer",
    liveCamera: "Live camera",
    startingInterview: "Starting interview...",
    cameraDenied: "Camera access denied or unavailable. Recording may fail.",
  },
  ar: {
    headerTitle: "جلسة مقابلة الذكاء الاصطناعي",
    headerDesc: "أسئلة صوتية مع وقت للتفكير والإجابة.",
    statQuestion: "السؤال",
    statStatus: "الحالة",
    statTimer: "المؤقت",
    statusPlaying: "تشغيل صوت السؤال",
    statusThinking: "التفكير",
    statusAnsweringRecording: "تسجيل الإجابة",
    statusAnswering: "وقت الإجابة",
    statusUploading: "رفع الإجابة",
    statusProcessing: "إنهاء",
    statusFinished: "انتهت",
    statusPreparing: "جار التحضير",
    preparingFirstQuestion: "تحضير صوت السؤال الأول...",
    preparingNextQuestion: "تحضير السؤال التالي...",
    thinking: "جاري التفكير...",
    answerTimeRecording: "وقت الإجابة، يتم التسجيل.",
    uploadingAnswer: "جاري رفع الإجابة...",
    finalizing: "جارٍ إنهاء المقابلة وتحليلها...",
    interviewComplete: "اكتملت المقابلة.",
    startAnswerBtn: "ابدأ الإجابة",
    stopAnswerBtn: "أوقف الإجابة",
    liveCamera: "الكاميرا المباشرة",
    startingInterview: "جاري بدء المقابلة...",
    cameraDenied: "تم رفض الوصول للكاميرا أو غير متاح. قد يفشل التسجيل.",
  },
};

export default function InterviewSessionPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [session, setSession] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState("loading"); // loading | playing | thinking | answering | uploading | processing | finished | error
  const [thinkingRemaining, setThinkingRemaining] = useState(DEFAULT_THINKING_SECONDS);
  const [answerRemaining, setAnswerRemaining] = useState(DEFAULT_ANSWER_SECONDS);
  const [finalVideoUrl, setFinalVideoUrl] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [language, setLanguage] = useState("en");

  const audioRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const thinkingTimerRef = useRef(null);
  const answerTimerRef = useRef(null);
  const audioGuardRef = useRef({});

  const currentQuestion = useMemo(() => session?.questions?.[currentIndex] || null, [session, currentIndex]);
  const t = (key) => COPY[language]?.[key] ?? COPY.en[key] ?? key;

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError("");
      try {
        const token = getToken();
        const type = searchParams.get("interviewType") || "general";
        const companyInterviewId = searchParams.get("companyInterviewId");
        const langFromQuery = (searchParams.get("language") || "").toLowerCase();
        if (!token) {
          throw new Error("You need to be logged in to start an interview.");
        }
        // request camera early
        try {
          await ensureStream();
          setCameraMessage("");
        } catch (camErr) {
          setCameraMessage(t("cameraDenied"));
        }

        if (companyInterviewId) {
          const started = await startCompanyInterview(token, companyInterviewId);
          const startLangMeta = LANGUAGE_META[started.language] || LANGUAGE_META.en;
          setLanguage(startLangMeta.code);
          setSession(started);
          setCurrentIndex(0);
          setPhase("playing");
          setInfo((COPY[startLangMeta.code] || COPY.en).preparingFirstQuestion);
          playQuestionAudio(started.questions?.[0]);
          return;
        }

        const me = await getCurrentUser(token);
        const resolvedLangCode = langFromQuery || me?.preferred_language || "en";
        const langMeta = LANGUAGE_META[resolvedLangCode] || LANGUAGE_META.en;
        setLanguage(langMeta.code);
        const localCopy = COPY[langMeta.code] || COPY.en;
        const payload = {
          interview_type: type,
          experience_level: me.experience_level || undefined,
          desired_job_title: me.desired_job_title || me.profile?.target_career || undefined,
          target_role: me.target_role || me.profile?.career_goal || undefined,
          field_of_study: me.field_of_study || undefined,
          skills: me.skills || [],
          language: langMeta.code,
          speechLocale: langMeta.azureLocale,
        };
        const started = await startInterview(token, payload);
        const startLangMeta = LANGUAGE_META[started.language] || langMeta;
        setLanguage(startLangMeta.code);
        setSession(started);
        setCurrentIndex(0);
        setPhase("playing");
        setInfo((COPY[startLangMeta.code] || localCopy).preparingFirstQuestion);
        playQuestionAudio(started.questions?.[0]);
      } catch (err) {
        setError(err?.message || "Failed to start interview.");
        setPhase("error");
      } finally {
        setLoading(false);
      }
    };
    bootstrap();

    return () => {
      stopAllTimers();
      stopStream();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "thinking") {
      startThinkingTimer();
    }
    return () => stopThinkingTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase === "answering") {
      startAnswerTimer();
      startRecording();
    }
    return () => stopAnswerTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const toAbsolute = (path) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `${API_BASE}${path}`;
  };

  const stopAllTimers = () => {
    stopThinkingTimer();
    stopAnswerTimer();
  };

  const stopThinkingTimer = () => {
    if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  };

  const stopAnswerTimer = () => {
    if (answerTimerRef.current) {
      clearInterval(answerTimerRef.current);
      answerTimerRef.current = null;
    }
  };

  const attachStreamToVideo = () => {
    if (mediaStreamRef.current && videoRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }
  };

  useEffect(() => {
    attachStreamToVideo();
  });

  const playQuestionAudio = (question) => {
    if (!question?.audioUrl) return;
    const qIndex = question.index ?? question.questionIndex ?? currentIndex;
    if (audioGuardRef.current[qIndex]) return;
    audioGuardRef.current[qIndex] = true;
    setPhase("playing");
    setInfo(t("statusPlaying"));
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    const audioEl = new Audio(toAbsolute(question.audioUrl));
    audioRef.current = audioEl;
    audioEl.autoplay = true;
    const onEnded = () => {
      audioEl.removeEventListener("ended", onEnded);
      startThinking();
    };
    audioEl.addEventListener("ended", onEnded);
    audioEl.play().catch((err) => {
      setError(err?.message || "Unable to play question audio. Please allow audio playback.");
      setPhase("thinking");
      startThinking();
    });
  };

  const startThinking = () => {
    setThinkingRemaining(DEFAULT_THINKING_SECONDS);
    setPhase("thinking");
    setInfo(t("thinking"));
  };

  const startThinkingTimer = () => {
    stopThinkingTimer();
    thinkingTimerRef.current = setInterval(() => {
      setThinkingRemaining((prev) => {
        if (prev <= 1) {
          stopThinkingTimer();
          startAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startAnswer = () => {
    setAnswerRemaining(DEFAULT_ANSWER_SECONDS);
    setPhase("answering");
    setInfo(t("answerTimeRecording"));
  };

  const startAnswerTimer = () => {
    stopAnswerTimer();
    answerTimerRef.current = setInterval(() => {
      setAnswerRemaining((prev) => {
        if (prev <= 1) {
          stopAnswerTimer();
          finishAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const ensureStream = async () => {
    if (mediaStreamRef.current) return mediaStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    mediaStreamRef.current = stream;
    attachStreamToVideo();
    return stream;
  };

  const startRecording = async () => {
    try {
      const stream = await ensureStream();
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = handleRecordingStop;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError(err?.message || "Recording failed. Please allow camera/mic access.");
      finishAnswer(true);
    }
  };

  const finishAnswer = (skipStop = false) => {
    setPhase("uploading");
    setInfo(t("uploadingAnswer"));
    if (!skipStop && recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    } else if (skipStop) {
      handleRecordingStop();
    }
  };

  const handleRecordingStop = async () => {
    setIsRecording(false);
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    await uploadAnswer(blob);
  };

  const uploadAnswer = async (blob) => {
    if (!session || !currentQuestion) return;
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append("video", blob, `question_${currentQuestion.index}.webm`);
      formData.append("session_id", session.sessionId);
      formData.append("question_index", currentQuestion.index);
      formData.append(
        "metadata",
        JSON.stringify({
          answerEndTime: new Date().toISOString(),
        })
      );
      await submitInterviewAnswer(token, formData);
      const refreshed = await fetchInterviewSession(token, session.sessionId);
        setSession(refreshed);
        const nextIndex = currentIndex + 1;
        if (nextIndex >= (refreshed.totalQuestions || refreshed.questions?.length || 0)) {
          await finalizeInterview(refreshed.sessionId);
        } else {
          setCurrentIndex(nextIndex);
          setPhase("playing");
          setInfo(t("preparingNextQuestion"));
          playQuestionAudio(refreshed.questions[nextIndex]);
        }
    } catch (err) {
      setError(err?.message || "Upload failed.");
      setPhase("answering");
    }
  };

  const finalizeInterview = async (sessionId) => {
    try {
      setPhase("processing");
      setInfo(t("finalizing"));
      const token = getToken();
      const result = await completeInterview(token, {
        sessionId,
        companyInterviewId: session?.companyInterviewSessionId || session?.companyInterviewId,
      });
      setAnalysis(result.analysis || result);
      setFinalVideoUrl(toAbsolute(result.finalVideoUrl || result.finalVideoPath));
      setPhase("finished");
      setInfo(t("interviewComplete"));
    } catch (err) {
      setError(err?.message || "Finalization failed.");
      setPhase("finished");
    } finally {
      stopStream();
    }
  };

  const stopStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  const statusLabel = () => {
    switch (phase) {
      case "playing":
        return t("statusPlaying");
      case "thinking":
        return t("statusThinking");
      case "answering":
        return isRecording ? t("statusAnsweringRecording") : t("statusAnswering");
      case "uploading":
        return t("statusUploading");
      case "processing":
        return t("statusProcessing");
      case "finished":
        return t("statusFinished");
      default:
        return t("statusPreparing");
    }
  };

  const timerValue = () => {
    if (phase === "thinking") return thinkingRemaining;
    if (phase === "answering") return answerRemaining;
    return null;
  };

  const totalQuestions = session?.totalQuestions || session?.questions?.length || 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("headerTitle")}
        description={t("headerDesc")}
        actions={null}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("statQuestion")} value={totalQuestions ? `${t("statQuestion")} ${currentIndex + 1} / ${totalQuestions}` : "--"} />
          <Stat label={t("statStatus")} value={statusLabel()} />
          <Stat label={t("statTimer")} value={timerValue() !== null ? `${timerValue()}s` : "--"} />
        </div>

        {info ? (
          <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">{info}</div>
        ) : null}
        {error ? <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {cameraMessage ? <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">{cameraMessage}</div> : null}

        <div className="flex flex-wrap gap-2">
          {phase === "thinking" ? (
            <button
              type="button"
              onClick={() => {
                stopThinkingTimer();
                startAnswer();
              }}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("startAnswerBtn")}
            </button>
          ) : null}
          {phase === "answering" ? (
            <button
              type="button"
              onClick={() => {
                stopAnswerTimer();
                finishAnswer();
              }}
              className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-100"
            >
              {t("stopAnswerBtn")}
            </button>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">{t("liveCamera")}</p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 max-w-3xl">
            <video className="aspect-video w-full bg-black object-cover" muted autoPlay playsInline ref={videoRef} />
          </div>
        </div>

        {phase === "finished" && (finalVideoUrl || analysis) ? (
          <ResultsDashboard
            finalVideoUrl={finalVideoUrl}
            analysis={analysis}
            scores={analysis?.scores}
            candidate={analysis?.candidate_position}
            perQuestion={analysis?.perQuestion}
          />
        ) : null}
      </section>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{t("startingInterview")}</div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slateplus">{value}</p>
    </div>
  );
}

function scoreDisplay(val, fallback = "N/A") {
  if (val === null || val === undefined || Number.isNaN(val)) return fallback;
  return typeof val === "number" ? Math.round(val) : val;
}

function CircleCard({ label, value, max = 100, size = "md", icon }) {
  const numeric = toNumberSafe(value);
  const pct = numeric === null ? 0 : Math.max(0, Math.min(100, (numeric / max) * 100));
  const isLg = size === "lg";
  const svgSize = isLg ? 80 : 64;
  const radius = isLg ? 32 : 26;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  let color = "text-cyan-100 stroke-cyan-300";
  if (pct < 40) color = "text-rose-100 stroke-rose-400";
  else if (pct < 70) color = "text-fuchsia-100 stroke-fuchsia-400";

  const Icon = icon ? statIcon(icon) : null;

  return (
    <div className={`relative overflow-hidden rounded-2xl px-4 py-4 ${INTERVIEW_AI_BORDER_SUBTLE} ${INTERVIEW_AI_HOVER}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500/70 via-blue-500/60 to-cyan-400/70" aria-hidden />
      <div className="flex items-center gap-2">
        {Icon ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/15 bg-cyan-400/10 text-cyan-100">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <p className="text-xs uppercase tracking-wide text-white/[0.52]">{label}</p>
      </div>
      <div className={`mt-3 flex items-center ${isLg ? "gap-4" : "gap-3"}`}>
        <svg className={`${isLg ? "h-20 w-20" : "h-16 w-16"} -rotate-90`} viewBox={`0 0 ${svgSize} ${svgSize}`}>
          <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} className="stroke-white/10" strokeWidth={strokeWidth} fill="none" />
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            className={`${color}`}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div>
          <p className={`${isLg ? "text-2xl" : "text-xl"} font-semibold ${color.split(" ")[0]}`}>
            {numeric === null ? "Not available" : Math.round(numeric)}
          </p>
          <p className={`${isLg ? "text-sm" : "text-xs"} text-white/[0.52]`}>/ {max}</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, helper, icon }) {
  const display = value ?? "Not available";
  const isNA = display === "Not available";
  const Icon = statIcon(icon);
  return (
    <div className={`relative overflow-hidden rounded-2xl px-4 py-4 ${INTERVIEW_AI_BORDER_SUBTLE} ${INTERVIEW_AI_HOVER}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500/70 via-blue-500/60 to-cyan-400/70" aria-hidden />
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-wide text-white/[0.52]">{label}</p>
          <div className="mt-1">
            {isNA ? (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/[0.52]">Not available</span>
            ) : (
              <p className="text-2xl font-semibold text-white">{display}</p>
            )}
            {helper ? <p className="mt-1 text-xs text-white/[0.52]">{helper}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function statIcon(name) {
  const base = "stroke-current";
  switch (name) {
    case "speed":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4 13a8 8 0 1116 0c0 2.21-1.79 4-4 4h-2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 9l-1.5 3.5" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M6 17h3" />
        </svg>
      );
    case "text-speed":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4 7h12" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4 12h8" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4 17h10" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M18 7h2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M18 12h2" />
        </svg>
      );
    case "pause":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <rect className={base} x="6" y="5" width="3" height="14" rx="1" />
          <rect className={base} x="13" y="5" width="3" height="14" rx="1" />
        </svg>
      );
    case "alert-timer":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="13" r="7" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 13l3-2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 2h6" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 6v2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M19 3l2 2" />
        </svg>
      );
    case "clock":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="12" r="8" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 8v5l3 2" />
        </svg>
      );
    case "chat":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M7 17l-4 4V6a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3H7z" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6" />
        </svg>
      );
    case "expression":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="12" r="8" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M8.5 11.5c.5-.5 1.5-.5 2 0m3 0c.5-.5 1.5-.5 2 0" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 14.5c1 .5 3 .5 4 0" />
        </svg>
      );
    case "smile":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="12" r="8" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01M15 10h.01" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M8 13c1.5 2 6.5 2 8 0" />
        </svg>
      );
    case "eye":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z" />
          <circle className={base} cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "motion":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M8 4h8l-2 4 2 4H8l2-4z" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4 12h3m10 0h3" />
        </svg>
      );
    case "user":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="8" r="3.5" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M6.5 18c1.2-2 3.3-3 5.5-3s4.3 1 5.5 3" />
        </svg>
      );
    case "mic":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <rect className={base} x="9" y="5" width="6" height="10" rx="3" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M7 11v1a5 5 0 0010 0v-1" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 18v3m-2 0h4" />
        </svg>
      );
    case "target":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="12" r="7" />
          <circle className={base} cx="12" cy="12" r="3" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 5V3m0 18v-2m7-7h2M3 12h2" />
        </svg>
      );
    case "wave":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M3 13c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4" />
        </svg>
      );
    case "prosody":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M5 16V8m4 8V6m4 10V10m4 6V12" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4 18h16" />
        </svg>
      );
    case "checklist":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 6h11M9 12h11M9 18h11" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4.5 6l1.5 1.5L8.5 5" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4.5 12l1.5 1.5L8.5 11" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M4.5 18l1.5 1.5L8.5 17" />
        </svg>
      );
    case "clarity":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 4l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M5 17l1 1m12-1l1 1m-8-1.5l.5 1.5" />
        </svg>
      );
    case "question":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 6a4 4 0 014 4c0 1.657-1.343 3-3 3h-1v1.5" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
          <circle className={base} cx="12" cy="12" r="8" />
        </svg>
      );
    case "video":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <rect className={base} x="4" y="6" width="12" height="12" rx="2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M16 10l4-2v8l-4-2" />
        </svg>
      );
    case "message-check":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M7 17l-4 4V6a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3H7z" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M8 10l2.5 2.5L15 8" />
        </svg>
      );
    case "score":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="12" r="8" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M7 16.5c1.5-1 3.5-1.5 5-1.5s3.5.5 5 1.5" />
        </svg>
      );
    case "check-circle":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="12" r="8" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 12.5l2 2 4-4" />
        </svg>
      );
    case "rotate":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M7 9l-2 2 2 2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M17 11l2-2-2-2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 7a6 6 0 018 6c0 .7-.1 1.37-.3 2" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M15 17a6 6 0 01-8-6c0-.7.1-1.37.3-2" />
        </svg>
      );
    case "document":
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M7 4h7l4 4v10a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M14 4v4h4" />
          <path className={base} strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 15h4" />
        </svg>
      );
    default:
      return ({ className = "" }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.6">
          <circle className={base} cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function ScoreBarCard({ label, value, max = 100 }) {
  const numeric = toNumberSafe(value);
  const pct = numeric === null ? 0 : Math.max(0, Math.min(100, (numeric / max) * 100));
  let color = "bg-cyan-400 text-cyan-100";
  if (pct <= 50) color = "bg-rose-500 text-rose-100";
  else if (pct <= 75) color = "bg-fuchsia-500 text-fuchsia-100";

  return (
    <div className={`rounded-2xl px-4 py-3 ${INTERVIEW_AI_BORDER_SUBTLE} ${INTERVIEW_AI_HOVER}`}>
      <p className="text-xs uppercase tracking-wide text-white/[0.52]">{label}</p>
      <div className="mt-2 flex items-end gap-1">
        <span className={`text-xl font-semibold ${color.split(" ")[1]}`}>{numeric === null ? "Not available" : Math.round(numeric)}</span>
        <span className="text-xs text-white/[0.52]">/ {max}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/[0.08]">
        <div className={`h-2 rounded-full ${color.split(" ")[0]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuestionScoreCard({ index, score }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-white/[0.52]">Question {index}</p>
      <CircleCard label="Q Score" value={score} icon="check-circle" />
    </div>
  );
}

function toNumberSafe(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : null;
}

function ResultsDashboard({ finalVideoUrl, analysis, scores, candidate, perQuestion }) {
  const normalized = normalizeAnalysisEnvelope({ analysis, scores, candidate_position: candidate });
  const safeAnalysis = normalized.analysis || analysis || {};
  const safeCandidate = normalized.candidatePosition || candidate || safeAnalysis?.candidate_position || {};
  const safeAudio = normalized.audioScore || safeAnalysis?.audio_score || {};
  const safeVideo = normalized.videoScore || safeAnalysis?.video_score || {};
  const safeScores = normalized.scores || scores || safeAnalysis?.scores || {};
  const safePerQuestion = perQuestion || safeAnalysis?.perQuestion || [];

  return (
    <div className="space-y-5">
      <div className={`space-y-5 rounded-2xl p-6 ${INTERVIEW_AI_BORDER}`}>
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Interview Results</p>
            <h3 className="text-lg font-semibold text-slateplus">Performance Overview</h3>
          </div>
          {finalVideoUrl ? (
            <a
              className="inline-flex items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
              href={finalVideoUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Final Video
            </a>
          ) : null}
        </header>

        {/* Candidate Position */}
        <Section title="Candidate Position">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card title="Best Fit Role" value={safeCandidate.best_fit_role} />
            <Card title="Best Fit Level" value={safeCandidate.best_fit_level} />
            <Card title="Confidence" value={safeCandidate.domain_confidence != null ? `${Math.round(safeCandidate.domain_confidence)}%` : "N/A"} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card title="Recommended Next Step" value={safeCandidate.recommended_next_step} />
            <Card title="Summary" value={safeCandidate.reasoning_summary} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ListCard title="Strengths" items={safeCandidate.strengths} />
            <ListCard title="Gaps" items={safeCandidate.gaps} />
          </div>
        </Section>

        {/* Analysis Summary */}
        <Section title="Analysis Summary">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`space-y-3 rounded-xl p-4 ${INTERVIEW_AI_BORDER_SUBTLE}`}>
              <h4 className="text-sm font-semibold text-white">Audio & Speech</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <CircleCard label="Audio Score" value={safeAudio.azure_scores?.final_score} icon="mic" />
                <CircleCard label="Accuracy" value={safeAudio.azure_scores?.accuracy} icon="target" />
                <CircleCard label="Fluency" value={safeAudio.azure_scores?.fluency} icon="wave" />
                <CircleCard label="Prosody" value={safeAudio.azure_scores?.prosody} icon="prosody" />
                <CircleCard label="Completeness" value={safeAudio.azure_scores?.completeness} icon="checklist" />
                <CircleCard label="Clarity" value={safeAudio.azure_scores?.clarity_intelligibility} icon="clarity" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Speech Rate" value={safeAudio.speech_rate?.rate_label || "Not available"} helper="Detected pace" icon="speed" />
                <StatCard
                  label="Words / min"
                  value={safeAudio.speech_rate?.words_per_minute != null ? Math.round(safeAudio.speech_rate.words_per_minute) : "Not available"}
                  helper="Words per minute"
                  icon="text-speed"
                />
                <StatCard label="Pause Count" value={safeAudio.pause_analysis?.count ?? "Not available"} helper="Total pauses" icon="pause" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Long Pauses" value={safeAudio.pause_analysis?.long_pause_count ?? "Not available"} helper="Extended pauses detected" icon="alert-timer" />
                <StatCard
                  label="Avg Pause (s)"
                  value={
                    safeAudio.pause_analysis?.average_pause_seconds != null
                      ? Math.round(safeAudio.pause_analysis.average_pause_seconds * 10) / 10
                      : "Not available"
                  }
                  helper="Average pause length"
                  icon="clock"
                />
                <StatCard label="Filler Words" value={safeAudio.filler_words?.total_count ?? "Not available"} helper="Uh, um, like..." icon="chat" />
              </div>
              <StatCard
                label="Transcript Quality"
                value={
                  safeAudio.transcript_quality?.word_count != null
                    ? `${safeAudio.transcript_quality.word_count} words`
                    : "Not available"
                }
                helper={
                  safeAudio.transcript_quality?.sentence_count != null
                    ? `${safeAudio.transcript_quality.sentence_count} sentences`
                    : undefined
                }
                icon="document"
              />
            </div>

            <div className={`space-y-3 rounded-xl p-4 ${INTERVIEW_AI_BORDER_SUBTLE}`}>
              <h4 className="text-sm font-semibold text-white">Video Analysis</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <CircleCard label="Eye Contact" value={safeVideo.eye_contact} icon="eye" />
                <CircleCard label="Head Movement" value={safeVideo.head_movement} icon="rotate" />
                <CircleCard label="Face Presence" value={safeVideo.face_presence} icon="user" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  label="Facial Expression"
                  value={safeVideo.facial_expression || "Not available"}
                  helper="Detected facial engagement level"
                  icon="expression"
                />
                <StatCard
                  label="Smile Intensity"
                  value={safeVideo.smile_score || "Not available"}
                  helper="Detected smile intensity"
                  icon="smile"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Question Scores */}
        {safePerQuestion?.length ? (
          <Section title="Question Scores">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {safePerQuestion.map((q) => (
                <QuestionScoreCard key={q.questionIndex} index={q.questionIndex} score={q.questionScore} />
              ))}
            </div>
          </Section>
        ) : null}

        {/* Scoring Summary */}
        <Section title="Scoring Summary">
          <div className="grid gap-4 md:grid-cols-4">
            <CircleCard label="Final Video Score" value={safeScores.finalVideoScore} icon="video" />
            <CircleCard label="Final Voice Score" value={safeScores.finalVoiceScore} icon="mic" />
            <CircleCard label="Answer Quality Score" value={safeScores.answerQualityScore} icon="message-check" />
            <CircleCard label="Final Interview Score" value={safeScores.finalInterviewScore} icon="user" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function Card({ title, value, subtle = false }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${INTERVIEW_AI_BORDER_SUBTLE} ${INTERVIEW_AI_HOVER}`}>
      <p className="text-xs uppercase tracking-wide text-white/[0.52]">{title}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white">{value || "N/A"}</p>
    </div>
  );
}

function ListCard({ title, items }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div className={`rounded-xl px-4 py-3 ${INTERVIEW_AI_BORDER_SUBTLE} ${INTERVIEW_AI_HOVER}`}>
      <p className="text-xs uppercase tracking-wide text-white/[0.52]">{title}</p>
      {list.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-white/[0.68]">
          {list.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-white/[0.52]">N/A</p>
      )}
    </div>
  );
}
