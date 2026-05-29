"use client";

import { useEffect } from "react";

import {
  hasMeaningfulValue as hasNormalizedValue,
  normalizeAnalysisEnvelope,
  warnMissingAnalysisFields,
} from "@/lib/interviewAnalysis";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const NOT_AVAILABLE = "Not available";

const VIDEO_SCORE_FIELDS = [
  { label: "Eye contact", paths: ["eye_contact"], icon: "eye" },
  { label: "Head movement", paths: ["head_movement"], icon: "rotate" },
  { label: "Face presence", paths: ["face_presence"], icon: "user" },
  { label: "Facial expression", paths: ["facial_expression"], icon: "face", kind: "metric" },
  { label: "Smile intensity", paths: ["smile_score", "smile_intensity"], icon: "smile", kind: "metric" },
];

const SUMMARY_FIELDS = [
  { label: "Final video score", paths: ["finalVideoScore", "final_video_score"], icon: "video" },
  { label: "Final voice score", paths: ["finalVoiceScore", "final_voice_score"], icon: "mic" },
  { label: "Answer quality score", paths: ["answerQualityScore", "answer_quality_score"], icon: "message" },
  { label: "Final interview score", paths: ["finalInterviewScore", "final_interview_score"], icon: "score" },
];

const AI_GRADIENT_BORDER =
  "border border-transparent bg-[linear-gradient(145deg,rgba(11,16,32,0.96),rgba(17,24,39,0.9))_padding-box,linear-gradient(120deg,rgba(139,92,246,0.62),rgba(59,130,246,0.48),rgba(6,182,212,0.58))_border-box] shadow-[0_0_12px_rgba(139,92,246,0.12),0_20px_64px_rgba(0,0,0,0.24)]";
const AI_GRADIENT_BORDER_SUBTLE =
  "border border-transparent bg-[linear-gradient(145deg,rgba(17,24,39,0.92),rgba(19,28,49,0.84))_padding-box,linear-gradient(120deg,rgba(139,92,246,0.44),rgba(59,130,246,0.34),rgba(6,182,212,0.42))_border-box] shadow-[0_0_10px_rgba(59,130,246,0.09)]";
const AI_GRADIENT_HOVER =
  "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(59,130,246,0.18),0_24px_70px_rgba(0,0,0,0.3)]";

export default function InterviewAnalyticsDashboard({ result }) {
  const report = normalizeReport(result);

  useEffect(() => {
    warnMissingAnalysisFields(result, report);
  }, [result, report]);

  return (
    <div className="space-y-4">
      <InterviewSnapshot report={report} />

      <DashboardSection title="Performance Overview" eyebrow="Fit and hiring recommendation" defaultOpen>
        <PerformanceOverview report={report} />
      </DashboardSection>

      <DashboardSection title="Video Analysis" eyebrow="Presence, eye contact, and visual engagement" defaultOpen>
        <VideoAnalysis video={report.video} />
      </DashboardSection>

      <DashboardSection title="Question Scores" eyebrow="Per-question recording, evaluation, and behavior metrics" defaultOpen>
        <QuestionScores questions={report.questions} />
      </DashboardSection>

      <DashboardSection title="Final Recruiter-Facing Score Breakdown" eyebrow="Scoring summary" defaultOpen>
        <ScoringSummary scores={report.scores} overallScore={report.overallScore} />
      </DashboardSection>
    </div>
  );
}

function InterviewSnapshot({ report }) {
  return (
    <section className={`overflow-hidden rounded-3xl ${AI_GRADIENT_BORDER}`}>
      <div className="border-b border-white/[0.08] bg-[linear-gradient(135deg,rgba(139,92,246,0.18),rgba(34,211,238,0.08),rgba(12,16,30,0.25))] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/75">Company analytics dashboard</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {displayValue(report.candidate?.full_name)} for {displayValue(report.job?.title)}
            </h2>
          </div>
          <StatusPill value={report.status} />
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Candidate" value={report.candidate?.full_name} helper={report.candidate?.email} icon="user" />
        <MetricCard label="Job" value={report.job?.title} helper={report.interviewType} icon="briefcase" />
        <MetricCard label="Interview status" value={report.status} helper="Pipeline state" icon="check" />
        <ScoreCard label="Overall score" value={report.overallScore} size="sm" icon="score" />
      </div>
    </section>
  );
}

function PerformanceOverview({ report }) {
  const position = report.position || {};

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Best fit role" value={position.best_fit_role || position.bestFitRole} icon="briefcase" />
          <MetricCard label="Best fit level" value={position.best_fit_level || position.bestFitLevel} icon="level" />
          <ScoreCard label="Confidence" value={position.domain_confidence || position.confidence} icon="target" />
        </div>
        <InsightCard title="Recommended next step" value={position.recommended_next_step || position.recommendedNextStep} />
      </div>

      <InsightCard title="Summary" value={position.reasoning_summary || position.summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Strengths" items={position.strengths} tone="positive" />
        <ListCard title="Gaps" items={position.gaps} tone="warning" />
      </div>
    </div>
  );
}

function VideoAnalysis({ video }) {
  const dynamicMetrics = flattenMetricCards(video, {
    skipPaths: new Set(VIDEO_SCORE_FIELDS.flatMap((item) => item.paths)),
  });

  return (
    <div className="space-y-4">
      <VideoBehaviorDetails video={video} metrics={dynamicMetrics} title="Video Behavior Details" />
    </div>
  );
}

function QuestionScores({ questions }) {
  if (!questions.length) {
    return <EmptyState message="No interview questions are available." />;
  }

  return (
    <div className="grid gap-4">
      {questions.map((question) => (
        <QuestionCard key={question.key} question={question} />
      ))}
    </div>
  );
}

function QuestionCard({ question }) {
  const evaluation = question.evaluation || {};
  const videoMetrics = flattenMetricCards(question.videoScore, { limit: 10 });

  return (
    <article className={`overflow-hidden rounded-3xl ${AI_GRADIENT_BORDER} ${AI_GRADIENT_HOVER}`}>
      <div className="border-b border-white/[0.08] bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(34,211,238,0.07),rgba(12,16,30,0.24))] px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/75">Question {question.index}</p>
            <h3 className="mt-1 text-base font-semibold leading-6 text-white">{displayValue(question.text)}</h3>
            <p className="mt-1 text-xs capitalize text-white/[0.52]">
              {[question.category, question.difficulty].filter(Boolean).join(" / ") || NOT_AVAILABLE}
            </p>
          </div>
          <ScoreCard label="Question score" value={question.score} icon="score" compact />
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <RecordingCard question={question} />

          <div className="grid content-start gap-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <ScoreCard label="Communication" value={question.communicationScore} icon="mic" subtitle="Voice signal" />
              <ScoreCard label="Confidence" value={question.confidenceScore} icon="target" subtitle="Delivery confidence" />
              <ScoreCard label="Answer quality" value={question.answerQuality} icon="message" subtitle="Response quality" />
            </div>
            <StatusCard value={question.analysisStatus} />
            <VideoBehaviorDetails video={question.videoScore} metrics={videoMetrics} title="Video Behavior Details" compact />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <TextPanel title="Transcript" value={question.transcript} />
          <TextPanel title="AI evaluation" value={evaluation.raw_response || evaluation.notes || evaluation.score} />
          <TextPanel title="Feedback" value={evaluation.feedback} />
        </div>

        <TextPanel title="Suggestions" value={evaluation.suggestion || evaluation.suggestions} />
      </div>
    </article>
  );
}

function RecordingCard({ question }) {
  return (
    <section className={`overflow-hidden rounded-3xl ${AI_GRADIENT_BORDER_SUBTLE} ${AI_GRADIENT_HOVER}`}>
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-200">Interview Recording</p>
          <h4 className="mt-1 text-base font-semibold">Candidate analysis preview</h4>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.55)]" />
          Reviewed
        </span>
      </div>

      <div className="p-3">
        {question.videoUrl ? (
          <video
            controls
            className="aspect-video w-full rounded-2xl border border-white/10 bg-black object-contain shadow-2xl"
            src={toAbsolute(question.videoUrl)}
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 text-sm text-white/[0.56]">
            No recording available
          </div>
        )}
      </div>
    </section>
  );
}

function StatusCard({ value }) {
  const label = displayValue(value);
  const isComplete = /complete|done|ready|success/i.test(label);
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${AI_GRADIENT_BORDER_SUBTLE} ${isComplete ? "text-cyan-100" : "text-indigo-100"}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isComplete ? "bg-cyan-400/10 text-cyan-100" : "bg-indigo-400/10 text-indigo-100"}`}>
          <Icon name="check" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-[0.16em] ${isComplete ? "text-cyan-100/75" : "text-indigo-100/75"}`}>Analysis status</p>
          <p className="truncate text-sm font-semibold capitalize text-white">{label}</p>
        </div>
      </div>
      <span className={`hidden rounded-full border px-2.5 py-1 text-xs font-bold sm:inline-flex ${isComplete ? "border-cyan-300/15 bg-cyan-400/10 text-cyan-100" : "border-indigo-300/15 bg-indigo-400/10 text-indigo-100"}`}>
        {isComplete ? "Complete" : "In review"}
      </span>
    </div>
  );
}

function VideoBehaviorDetails({ video, metrics, title, compact = false }) {
  const curatedPaths = new Set(VIDEO_SCORE_FIELDS.flatMap((item) => item.paths));
  const extraMetrics = Array.isArray(metrics)
    ? metrics.filter((metric) => metric?.path && !curatedPaths.has(metric.path)).slice(0, compact ? 4 : 8)
    : [];

  return (
    <section className={`rounded-3xl p-4 ${AI_GRADIENT_BORDER} ${AI_GRADIENT_HOVER}`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100/75">Behavior signals</p>
          <h4 className="mt-1 text-base font-semibold text-white">{title}</h4>
        </div>
        <span className="premium-metric-badge w-fit rounded-full px-3 py-1 text-xs font-bold">
          Visual analysis
        </span>
      </div>

      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-5"}`}>
        {VIDEO_SCORE_FIELDS.map((metric) => (
          <BehaviorMetricCard
            key={metric.label}
            label={metric.label}
            value={pick(video, metric.paths)}
            icon={metric.icon}
          />
        ))}
      </div>

      {extraMetrics.length ? (
        <div className={`mt-3 grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
          {extraMetrics.map((metric) => (
            <BehaviorMetricCard key={metric.path} label={metric.label} value={metric.value} icon="score" subtle />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BehaviorMetricCard({ label, value, icon, subtle = false }) {
  const numeric = toNumber(value);
  const pct = normalizePercent(value);
  const hasValue = hasMeaningfulValue(value);

  return (
    <div className={`group rounded-2xl p-3 ${AI_GRADIENT_BORDER_SUBTLE} ${AI_GRADIENT_HOVER}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${subtle ? "bg-white/[0.06] text-white/[0.7]" : "bg-cyan-400/10 text-cyan-100"}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className="text-right text-lg font-semibold text-white">
          {hasValue ? displayValue(value) : NOT_AVAILABLE}
        </span>
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.48]">{label}</p>
      <div className="premium-progress-track mt-2 h-1.5 rounded-full">
        <div
          className={`h-full rounded-full ${numeric === null ? "bg-white/20" : pct < 45 ? "bg-gradient-to-r from-rose-500 to-fuchsia-400" : pct < 70 ? "premium-progress-fill-alt" : "premium-progress-fill"}`}
          style={{ width: `${numeric === null ? 38 : pct}%`, transition: "width 700ms ease" }}
        />
      </div>
    </div>
  );
}

function ScoringSummary({ scores, overallScore }) {
  const safeScores = {
    ...scores,
    finalInterviewScore: scores?.finalInterviewScore ?? scores?.final_interview_score ?? overallScore,
  };

  return (
    <div className={`rounded-3xl p-4 ${AI_GRADIENT_BORDER} ${AI_GRADIENT_HOVER}`}>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/75">Recruiter scorecard</p>
          <h3 className="mt-1 text-base font-semibold text-white">Final score breakdown</h3>
        </div>
        <p className="text-sm text-white/[0.52]">Weighted summary from interview signals</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SUMMARY_FIELDS.map((metric) => (
          <ScoreCard key={metric.label} label={metric.label} value={pick(safeScores, metric.paths)} icon={metric.icon} size="lg" />
        ))}
      </div>
    </div>
  );
}

function DashboardSection({ title, eyebrow, children, defaultOpen = false }) {
  return (
    <details className={`group overflow-hidden rounded-3xl ${AI_GRADIENT_BORDER}`} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(34,211,238,0.06),rgba(12,16,30,0.18))] px-5 py-4 transition hover:bg-white/[0.03]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-100 sm:flex">
            <Icon name="score" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/75">{eyebrow}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
          </div>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] text-white/[0.62] transition group-open:rotate-180 group-hover:border-cyan-300/25 group-hover:text-cyan-100">
          <Icon name="chevron" className="h-4 w-4" />
        </span>
      </summary>
      <div className="grid grid-rows-[0fr] border-t border-white/[0.08] bg-white/[0.02] transition-[grid-template-rows] duration-300 group-open:grid-rows-[1fr]">
        <div className="overflow-hidden">
          <div className="p-4 sm:p-5">{children}</div>
        </div>
      </div>
    </details>
  );
}

function ScoreCard({ label, value, max = 100, size = "md", icon = "score", compact = false, subtitle }) {
  const numeric = toNumber(value);
  const pct = numeric === null ? 0 : Math.max(0, Math.min(100, (numeric / max) * 100));
  const ringSize = size === "lg" ? 92 : compact ? 58 : 72;
  const radius = size === "lg" ? 38 : compact ? 23 : 29;
  const stroke = compact ? 7 : 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const tone = scoreTone(pct, numeric);

  return (
    <div className={`relative flex h-full min-h-[138px] flex-col overflow-hidden rounded-2xl p-4 ${AI_GRADIENT_BORDER_SUBTLE} ${AI_GRADIENT_HOVER} ${compact ? "min-w-[180px]" : ""}`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.48]">{label}</p>
          <p className="mt-1 text-xs text-white/[0.42]">{subtitle || (numeric === null ? "Awaiting score" : `Out of ${max}`)}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.iconBg} ${tone.text}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <div className={`mt-auto flex items-center pt-4 ${compact ? "gap-2" : "gap-3"}`}>
        <svg className="shrink-0 -rotate-90" width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
          <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} className="stroke-white/10" strokeWidth={stroke} fill="none" />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            className={tone.stroke}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 700ms ease" }}
          />
        </svg>
        <div className="min-w-0">
          <p className={`${size === "lg" ? "text-3xl" : compact ? "text-lg" : "text-2xl"} font-semibold ${tone.text}`}>
            {numeric === null ? NOT_AVAILABLE : Math.round(numeric)}
          </p>
          <p className="text-xs text-white/[0.48]">{numeric === null ? "" : `/ ${max}`}</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, helper, icon = "metric" }) {
  const hasValue = hasMeaningfulValue(value);

  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 ${AI_GRADIENT_BORDER_SUBTLE} ${AI_GRADIENT_HOVER}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500/65 via-cyan-400/65 to-fuchsia-400/55" aria-hidden />
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-100">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.48]">{label}</p>
          {hasValue ? (
            <p className="mt-1 break-words text-xl font-semibold text-white">{displayValue(value)}</p>
          ) : (
            <NotAvailablePill />
          )}
          {helper ? <p className="mt-1 text-xs text-white/[0.48]">{helper}</p> : null}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ title, value }) {
  return (
    <div className={`rounded-2xl p-4 ${AI_GRADIENT_BORDER_SUBTLE} ${AI_GRADIENT_HOVER}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.48]">{title}</p>
      {hasMeaningfulValue(value) ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/[0.68]">{displayValue(value)}</p>
      ) : (
        <NotAvailablePill />
      )}
    </div>
  );
}

function ListCard({ title, items, tone = "neutral" }) {
  const list = normalizeList(items);
  const dotClass = tone === "positive" ? "bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.45)]" : tone === "warning" ? "bg-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.35)]" : "bg-white/40";

  return (
    <div className={`rounded-2xl p-4 ${AI_GRADIENT_BORDER_SUBTLE} ${AI_GRADIENT_HOVER}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.48]">{title}</p>
      {list.length ? (
        <ul className="mt-3 space-y-2">
          {list.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-6 text-white/[0.68]">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
              <span>{displayValue(item)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <NotAvailablePill />
      )}
    </div>
  );
}

function TextPanel({ title, value }) {
  return (
    <div className={`rounded-2xl p-4 ${AI_GRADIENT_BORDER_SUBTLE} ${AI_GRADIENT_HOVER}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.48]">{title}</p>
      {hasMeaningfulValue(value) ? (
        <p className="dashboard-scrollbar mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-white/[0.68]">{displayValue(value)}</p>
      ) : (
        <NotAvailablePill />
      )}
    </div>
  );
}

function StatusPill({ value }) {
  const label = displayValue(value);
  return (
    <span className="premium-metric-badge inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold capitalize">
      {label}
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className={`rounded-2xl px-5 py-8 text-center text-sm text-white/[0.52] ${AI_GRADIENT_BORDER_SUBTLE}`}>
      {message}
    </div>
  );
}

function NotAvailablePill() {
  return <span className="mt-2 inline-flex rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/[0.52]">{NOT_AVAILABLE}</span>;
}

function normalizeReport(result = {}) {
  const envelope = normalizeAnalysisEnvelope(result);
  const root = envelope.root || result || {};
  const answers = Array.isArray(root.answers) ? root.answers : [];
  const questions = Array.isArray(root.questions) ? root.questions : [];
  const questionRows = buildQuestionRows(questions, answers);
  const audioScores = questionRows.map((item) => item.audioScore).filter(isPlainObject);
  const videoScores = questionRows.map((item) => item.videoScore).filter(isPlainObject);
  const analysis = envelope.analysis || {};
  const candidatePosition =
    envelope.candidatePosition ||
    analysis.candidate_position ||
    root.candidate_position ||
    root.candidatePosition ||
    root.performance_overview ||
    {};
  const audio = firstPlainObject([
    envelope.audioScore,
    analysis.audio_score,
    analysis.audioScore,
    root.audio_score,
    root.audioScore,
  ]) || aggregateAudio(audioScores);
  const video = firstPlainObject([
    envelope.videoScore,
    analysis.video_score,
    analysis.videoScore,
    root.video_score,
    root.videoScore,
  ]) || aggregateVideo(videoScores);
  const scores = normalizeScores(
    firstPlainObject([envelope.scores, root.scores, analysis.scores, root.scoring_summary, root.scoringSummary]) || {},
    questionRows,
    audio,
    video,
    root.overall_score,
  );

  return {
    candidate: root.candidate || {},
    job: root.job || {},
    status: root.status,
    interviewType: root.interview_type,
    overallScore: root.overall_score,
    position: candidatePosition,
    questions: questionRows,
    audio,
    video,
    scores,
  };
}

function buildQuestionRows(questions, answers) {
  if (!questions.length && answers.length) {
    return answers.map((answer, index) => buildQuestionRow(null, answer, index));
  }

  return questions.map((question, index) => {
    const answer = answers.find((item) => item.question_id === question.id) || {};
    return buildQuestionRow(question, answer, index);
  });
}

function buildQuestionRow(question, answer, index) {
  const feedback = answer?.ai_feedback || answer?.feedback || {};
  const evaluation = feedback.questionEvaluation || feedback.question_evaluation || answer?.questionEvaluation || {};
  const audioScore = feedback.audioScore || feedback.audio_score || answer?.audioScore || {};
  const videoScore = feedback.videoScore || feedback.video_score || answer?.videoScore || {};
  const score = answer?.score ?? evaluation?.score ?? answer?.questionScore ?? answer?.question_score;

  return {
    key: question?.id || answer?.id || index,
    index: index + 1,
    text: question?.question_text || answer?.questionText || answer?.question_text,
    category: question?.category || answer?.questionCategory,
    difficulty: question?.difficulty || answer?.questionDifficulty,
    transcript: answer?.answer_text || answer?.transcript,
    videoUrl: answer?.video_url || answer?.videoUrl,
    score,
    evaluation,
    audioScore,
    videoScore,
    analysisStatus: feedback.analysisStatus || feedback.analysis_status || answer?.analysisStatus,
    communicationScore: pick(audioScore, ["interview_target_scores.communication", "azure_scores.final_score"]),
    confidenceScore: pick(audioScore, ["interview_target_scores.confidence", "azure_scores.confidence_score", "azure_scores.confidence_raw"]),
    answerQuality: pick(audioScore, ["interview_target_scores.answer_quality"]) ?? score,
  };
}

function aggregateAudio(audioScores) {
  if (!audioScores.length) return {};

  const azureKeys = unionNestedKeys(audioScores, "azure_scores");
  const targetKeys = unionNestedKeys(audioScores, "interview_target_scores");
  const azure_scores = Object.fromEntries(azureKeys.map((key) => [key, averagePath(audioScores, `azure_scores.${key}`)]));
  const interview_target_scores = Object.fromEntries(
    targetKeys.map((key) => [key, averagePath(audioScores, `interview_target_scores.${key}`)]),
  );

  return cleanObject({
    azure_scores,
    clarity_intelligibility: { score: azure_scores.clarity_intelligibility },
    interview_target_scores,
    source: "aggregated_in_frontend",
  });
}

function aggregateVideo(videoScores) {
  if (!videoScores.length) return {};
  const keys = unionKeys(videoScores);
  const output = {};
  keys.forEach((key) => {
    const numericAverage = averagePath(videoScores, key);
    output[key] = numericAverage ?? modeValue(videoScores.map((item) => item?.[key]));
  });
  return cleanObject(output);
}

function normalizeScores(scores, questionRows, audio, video, overallScore) {
  const answerQuality =
    scores.answerQualityScore ??
    scores.answer_quality_score ??
    averageValues(questionRows.map((question) => toNumber(question.score))) ??
    overallScore;
  const finalVoice = scores.finalVoiceScore ?? scores.final_voice_score ?? pick(audio, ["azure_scores.final_score"]);
  const finalVideo = scores.finalVideoScore ?? scores.final_video_score ?? weightedVideoScore(video);
  const finalInterview =
    scores.finalInterviewScore ??
    scores.final_interview_score ??
    averageValues([toNumber(answerQuality), toNumber(finalVoice), toNumber(finalVideo)].filter((value) => value !== null)) ??
    overallScore;

  return {
    ...scores,
    finalVideoScore: finalVideo,
    finalVoiceScore: finalVoice,
    answerQualityScore: answerQuality,
    finalInterviewScore: finalInterview,
  };
}

function weightedVideoScore(video) {
  const eye = toNumber(video?.eye_contact);
  const head = toNumber(video?.head_movement);
  const face = toNumber(video?.face_presence);
  const parts = [
    [eye, 0.5],
    [head, 0.3],
    [face, 0.2],
  ].filter(([value]) => value !== null);

  if (!parts.length) return null;
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  return parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function flattenMetricCards(source, options = {}) {
  const metrics = [];
  const skipPaths = options.skipPaths || new Set();
  const limit = options.limit || 28;

  function walk(value, path) {
    if (metrics.length >= limit || skipPaths.has(path)) return;
    if (!hasMeaningfulValue(value)) return;

    if (Array.isArray(value)) {
      metrics.push({ path, label: labelize(path), value: `${value.length} item${value.length === 1 ? "" : "s"}` });
      return;
    }

    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key));
      return;
    }

    metrics.push({ path, label: labelize(path), value: formatPrimitive(value) });
  }

  if (isPlainObject(source)) {
    walk(source, "");
  }

  return metrics.filter((metric) => metric.path);
}

function pick(source, paths) {
  if (!source) return undefined;
  for (const path of paths) {
    const value = getPath(source, path);
    if (hasMeaningfulValue(value)) return value;
  }
  return undefined;
}

function getPath(source, path) {
  if (!source || !path) return undefined;
  return String(path)
    .split(".")
    .reduce((current, key) => (current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined), source);
}

function averagePath(items, path) {
  return averageValues(items.map((item) => toNumber(getPath(item, path))));
}

function averageValues(values) {
  const numeric = values.map(toNumber).filter((value) => value !== null);
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function modeValue(values) {
  const clean = values.filter((value) => hasMeaningfulValue(value) && toNumber(value) === null).map((value) => String(value));
  if (!clean.length) return null;
  const counts = clean.reduce((acc, value) => ({ ...acc, [value]: (acc[value] || 0) + 1 }), {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function unionNestedKeys(items, parentKey) {
  const keys = new Set();
  items.forEach((item) => {
    const parent = item?.[parentKey];
    if (isPlainObject(parent)) {
      Object.keys(parent).forEach((key) => keys.add(key));
    }
  });
  return Array.from(keys);
}

function unionKeys(items) {
  const keys = new Set();
  items.forEach((item) => {
    if (isPlainObject(item)) {
      Object.keys(item).forEach((key) => keys.add(key));
    }
  });
  return Array.from(keys);
}

function firstPlainObject(items) {
  return items.find((item) => isPlainObject(item) && Object.keys(item).length);
}

function cleanObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (!hasMeaningfulValue(value)) return false;
      if (isPlainObject(value)) return Object.keys(cleanObject(value)).length > 0;
      return true;
    }),
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const numeric = Number.parseFloat(String(value).replace("%", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function round(value, digits = 2) {
  const numeric = toNumber(value);
  if (numeric === null) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function normalizePercent(value) {
  const numeric = toNumber(value);
  if (numeric === null) return 0;
  const pct = numeric <= 1 && numeric >= 0 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, pct));
}

function hasMeaningfulValue(value) {
  return hasNormalizedValue(value);
}

function displayValue(value) {
  if (!hasMeaningfulValue(value)) return NOT_AVAILABLE;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(round(value));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (isPlainObject(value)) return JSON.stringify(value, null, 2);
  return String(value);
}

function formatPrimitive(value) {
  if (typeof value === "number") return round(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

function normalizeList(items) {
  if (Array.isArray(items)) return items.filter(hasMeaningfulValue);
  if (typeof items === "string" && items.trim()) return [items.trim()];
  return [];
}

function labelize(path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function scoreTone(pct, numeric) {
  if (numeric === null) {
    return {
      text: "text-white/[0.52]",
      stroke: "stroke-white/20",
      bar: "bg-white/20",
      iconBg: "bg-white/[0.06]",
    };
  }

  if (pct < 40) {
    return {
      text: "text-rose-100",
      stroke: "stroke-rose-400",
      bar: "bg-gradient-to-r from-rose-500 to-fuchsia-400",
      iconBg: "bg-rose-500/10",
    };
  }

  if (pct < 70) {
    return {
      text: "text-fuchsia-100",
      stroke: "stroke-fuchsia-400",
      bar: "bg-gradient-to-r from-fuchsia-500 to-violet-400",
      iconBg: "bg-fuchsia-500/10",
    };
  }

  return {
    text: "text-cyan-100",
    stroke: "stroke-cyan-300",
    bar: "premium-progress-fill",
    iconBg: "bg-cyan-400/10",
  };
}

function toAbsolute(path) {
  if (!path) return "";
  if (String(path).startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

function Icon({ name, className = "" }) {
  const common = { className, fill: "none", viewBox: "0 0 24 24", strokeWidth: "1.7", stroke: "currentColor" };

  switch (name) {
    case "mic":
      return (
        <svg {...common}>
          <rect x="9" y="4" width="6" height="11" rx="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 11.5v1a5.5 5.5 0 0011 0v-1M12 18v3m-2 0h4" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5V3m0 18v-2m7-7h2M3 12h2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4L19 6" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17l-4 4V6a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3H7z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "rotate":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 9l-2 2 2 2M17 11l2-2-2-2M9 7a6 6 0 018 6M15 17a6 6 0 01-8-6" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 19c1.2-2.4 3.2-3.6 5.5-3.6s4.3 1.2 5.5 3.6" />
        </svg>
      );
    case "face":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 10.5h.01M15.5 10.5h.01M8.5 14.5c1.8 1.4 5.2 1.4 7 0" />
        </svg>
      );
    case "smile":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01M15 10h.01M8 13c1.5 2 6.5 2 8 0" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="4" y="6" width="12" height="12" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 10l4-2v8l-4-2" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="12" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V5h6v2M4 12h16" />
        </svg>
      );
    case "level":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 18h14M7 18V9h4v9M13 18V5h4v13" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      );
    case "score":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5" />
        </svg>
      );
  }
}
