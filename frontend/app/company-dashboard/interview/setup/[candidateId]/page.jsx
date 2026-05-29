"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Send, Trash2 } from "lucide-react";

import SectionHeader from "@/components/SectionHeader";
import { getCompanyInterview, saveCompanyInterviewTemplate } from "@/lib/api";
import { getToken } from "@/lib/auth";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
];

const INTERVIEW_TYPES = [
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral" },
  { value: "mixed", label: "Technical + Behavioral" },
  { value: "general", label: "General" },
];

const CATEGORIES = ["technical", "behavioral", "role_fit", "problem_solving"];
const DIFFICULTIES = ["easy", "medium", "hard"];

const fieldClass =
  "dashboard-field min-h-11 w-full rounded-xl border border-white/[0.10] bg-[#0A0F1C]/[0.92] px-3.5 py-2.5 text-sm text-white/[0.92] outline-none transition placeholder:text-white/[0.38] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15";
const labelClass = "space-y-2 text-sm font-semibold text-white/[0.78]";
const ghostButtonClass =
  "premium-secondary-action inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40";
const dangerButtonClass =
  "premium-danger-action inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40";

function newQuestion(orderIndex = 0, category = "technical") {
  return {
    question_text: "",
    category,
    difficulty: "medium",
    expected_answer_keywords_text: "",
    required: true,
    order_index: orderIndex,
  };
}

export default function CompanyInterviewSetupPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const candidateId = params.candidateId;
  const sessionId = searchParams.get("sessionId");

  const [interview, setInterview] = useState(null);
  const [language, setLanguage] = useState("en");
  const [interviewType, setInterviewType] = useState("technical");
  const [questions, setQuestions] = useState([
    newQuestion(0, "technical"),
    newQuestion(1, "behavioral"),
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadInterview = async () => {
      if (!sessionId) {
        setError("Missing interview session.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const token = getToken();
        const data = await getCompanyInterview(token, sessionId);
        setInterview(data);
        setLanguage(data.language || "en");
        setInterviewType(data.interview_type || "technical");
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          setQuestions(
            data.questions.map((question, index) => ({
              id: question.id,
              question_text: question.question_text || "",
              category: question.category || "technical",
              difficulty: question.difficulty || "medium",
              expected_answer_keywords_text: (question.expected_answer_keywords || []).join(", "),
              required: question.required !== false,
              order_index: question.order_index ?? index,
            })),
          );
        }
      } catch (err) {
        setError(err.message || "Could not load interview request");
      } finally {
        setLoading(false);
      }
    };
    loadInterview();
  }, [sessionId]);

  const candidate = interview?.candidate;
  const job = interview?.job;
  const hasInvalidQuestion = useMemo(
    () => questions.some((question) => !question.question_text.trim()),
    [questions],
  );

  const updateQuestion = (index, patch) => {
    setQuestions((current) =>
      current.map((question, idx) => (idx === index ? { ...question, ...patch } : question)),
    );
  };

  const addQuestion = (category = "technical") => {
    setQuestions((current) => [...current, newQuestion(current.length, category)]);
  };

  const removeQuestion = (index) => {
    setQuestions((current) =>
      current
        .filter((_, idx) => idx !== index)
        .map((question, idx) => ({ ...question, order_index: idx })),
    );
  };

  const moveQuestion = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    setQuestions((current) => {
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy.map((question, idx) => ({ ...question, order_index: idx }));
    });
  };

  const handleSave = async () => {
    if (!sessionId || hasInvalidQuestion) {
      setError("Every question needs text before sending.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = getToken();
      await saveCompanyInterviewTemplate(token, sessionId, {
        language,
        interview_type: interviewType,
        questions: questions.map((question, index) => ({
          id: question.id,
          question_text: question.question_text.trim(),
          category: question.category,
          difficulty: question.difficulty,
          expected_answer_keywords: question.expected_answer_keywords_text
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          required: question.required,
          order_index: index,
        })),
      });
      router.push("/company-dashboard/candidates");
    } catch (err) {
      setError(err.message || "Could not send interview invitation");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-card rounded-2xl border px-6 py-4 text-sm text-white/[0.68]">
        Loading interview setup...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Interview Setup"
        description="Build a custom company interview that replaces the default AI-generated questions."
        actions={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || hasInvalidQuestion}
            className="premium-action inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {saving ? "Sending..." : "Save and Send Invitation"}
          </button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <section className="dashboard-card rounded-[1.35rem] border p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <InfoBlock label="Candidate" value={candidate?.full_name || `Candidate ${candidateId}`} helper={candidate?.email} />
          <InfoBlock label="Job Title" value={job?.title || "Not linked"} helper={job?.experience_level} />
          <InfoBlock label="Status" value={interview?.status || "draft"} helper="Invitation state" />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            <span>Interview Language</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className={fieldClass}
            >
              {LANGUAGE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            <span>Interview Type</span>
            <select
              value={interviewType}
              onChange={(event) => setInterviewType(event.target.value)}
              className={fieldClass}
            >
              {INTERVIEW_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="dashboard-card rounded-[1.35rem] border p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Dynamic Questions</h2>
            <p className="mt-1 text-sm text-white/[0.58]">These questions will be used in the candidate recording session.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addQuestion("technical")} className="premium-secondary-action inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition hover:-translate-y-0.5">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Technical
            </button>
            <button type="button" onClick={() => addQuestion("behavioral")} className="premium-secondary-action inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition hover:-translate-y-0.5">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Behavioral
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {questions.map((question, index) => (
            <article
              key={`${question.id || "new"}-${index}`}
              className="dashboard-subcard rounded-[1.2rem] border p-4 transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.14] sm:p-5"
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex w-fit rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/75">
                  Question {index + 1}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => moveQuestion(index, -1)} className={ghostButtonClass} disabled={index === 0}>
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Up
                  </button>
                  <button type="button" onClick={() => moveQuestion(index, 1)} className={ghostButtonClass} disabled={index === questions.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    Down
                  </button>
                  <button type="button" onClick={() => removeQuestion(index)} className={dangerButtonClass} disabled={questions.length === 1}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>

              <textarea
                value={question.question_text}
                onChange={(event) => updateQuestion(index, { question_text: event.target.value })}
                rows={3}
                placeholder="Write the interview question..."
                className={`${fieldClass} min-h-28 resize-y leading-6`}
              />

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <SelectField label="Category" value={question.category} options={CATEGORIES} onChange={(value) => updateQuestion(index, { category: value })} />
                <SelectField label="Difficulty" value={question.difficulty} options={DIFFICULTIES} onChange={(value) => updateQuestion(index, { difficulty: value })} />
                <label className={`${labelClass} md:col-span-2`}>
                  <span>Expected Keywords</span>
                  <input
                    value={question.expected_answer_keywords_text}
                    onChange={(event) => updateQuestion(index, { expected_answer_keywords_text: event.target.value })}
                    placeholder="Optional, comma separated"
                    className={fieldClass}
                  />
                </label>
              </div>

              <label className="mt-4 inline-flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm font-semibold text-white/[0.72] transition hover:bg-white/[0.055]">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(event) => updateQuestion(index, { required: event.target.checked })}
                  className="h-4 w-4 rounded border-white/[0.18] bg-[#0A0F1C] text-[#A78BFA] accent-[#A78BFA]"
                />
                Required question
              </label>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoBlock({ label, value, helper }) {
  return (
    <div className="dashboard-subcard rounded-2xl border px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/[0.46]">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-white/[0.9]">{value || "N/A"}</p>
      {helper ? <p className="mt-0.5 text-xs text-white/[0.5]">{helper}</p> : null}
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
