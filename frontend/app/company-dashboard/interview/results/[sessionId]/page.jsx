"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import InterviewAnalyticsDashboard from "@/components/company/InterviewAnalyticsDashboard";
import SectionHeader from "@/components/SectionHeader";
import { getCompanyInterviewResults } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { hasMeaningfulValue, normalizeAnalysisEnvelope } from "@/lib/interviewAnalysis";

export default function CompanyInterviewResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId;
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadResults = async () => {
      setLoading(true);
      setError("");
      try {
        const token = getToken();
        const data = await getCompanyInterviewResults(token, sessionId);
        setResult(data);
      } catch (err) {
        setError(err.message || "Could not load interview results");
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, [sessionId]);

  const reportText = useMemo(() => {
    if (!result) return "";
    const envelope = normalizeAnalysisEnvelope(result);
    const data = envelope.root || result;
    const text = (value) => (hasMeaningfulValue(value) ? value : "Not available");
    const lines = [
      `Candidate: ${text(data.candidate?.full_name)}`,
      `Job: ${text(data.job?.title)}`,
      `Status: ${text(data.status)}`,
      `Overall score: ${text(data.overall_score)}`,
      "",
      "Questions",
      ...(data.questions || []).map((question, index) => {
        const answer = (data.answers || []).find((item) => item.question_id === question.id);
        const feedback = answer?.ai_feedback || {};
        return [
          `${index + 1}. ${question.question_text}`,
          `Score: ${text(answer?.score)}`,
          `Transcript: ${text(answer?.answer_text)}`,
          `Feedback: ${JSON.stringify(feedback, null, 2)}`,
        ].join("\n");
      }),
    ];
    return lines.join("\n\n");
  }, [result]);

  const downloadReport = () => {
    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-report-${sessionId}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-sm" />
        <div className="grid gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Recruiter Interview Analytics"
        description="Company-only performance, video, question, and scoring analytics in a cleaner recruiter view."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadReport}
              disabled={!result}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              Download Report
            </button>
            <button
              type="button"
              onClick={() => router.push("/company-dashboard/candidates")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              Back
            </button>
          </div>
        }
      />

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {result ? <InterviewAnalyticsDashboard result={result} /> : null}
    </div>
  );
}
