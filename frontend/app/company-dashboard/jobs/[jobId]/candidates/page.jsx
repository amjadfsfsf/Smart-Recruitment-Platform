"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import JobSkillsBreakdown from "@/components/company/JobSkillsBreakdown";
import SectionHeader from "@/components/SectionHeader";
import { createCompanyInterview, downloadCandidateCv, matchCandidates, requestCandidateCv } from "@/lib/api";
import { getToken } from "@/lib/auth";

const scoreColor = (score) => {
  if (score >= 70) return "border-cyan-300/15 bg-cyan-400/10 text-cyan-100";
  if (score >= 45) return "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100";
  return "border-rose-300/15 bg-rose-500/10 text-rose-100";
};

const statusStyles = {
  draft: "border-white/[0.08] bg-white/[0.06] text-white/[0.62]",
  pending: "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100",
  accepted: "border-sky-300/15 bg-sky-400/10 text-sky-100",
  in_progress: "border-indigo-300/15 bg-indigo-400/10 text-indigo-100",
  completed: "border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
  reviewed: "border-violet-300/15 bg-violet-400/10 text-violet-100",
};

function statusLabel(status) {
  if (!status) return "";
  return status.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function CandidateCard({ candidate, fallbackRequiredSkills = [], onAcceptCandidate, onRequestCv, accepting = false, requestingCv = false }) {
  const requiredSkills =
    Array.isArray(candidate.required_skills) && candidate.required_skills.length > 0
      ? candidate.required_skills
      : fallbackRequiredSkills;
  const finalScore =
    typeof candidate.final_score === "number" ? candidate.final_score : candidate.score || 0;
  const scoreDisplay =
    candidate.score_display || `${Number(finalScore || 0).toFixed(2)}%`;
  const matchBreakdown = {
    skills_score: candidate.skills_score,
    desc_score: candidate.desc_score,
    major_score: candidate.major_score,
    title_score: candidate.title_score,
  };
  const hasCv = Boolean(candidate.hasCV || candidate.has_cv || candidate.cv_filename);
  const cvRequestStatus = candidate.cv_request_status;
  const cvRequestPending = cvRequestStatus === "pending";

  return (
    <article className="dashboard-card flex min-w-0 flex-col gap-4 overflow-visible rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h3 className="text-base font-semibold text-white">{candidate.full_name}</h3>
          <p className="break-all text-sm text-white/[0.54]">{candidate.email}</p>
          {candidate.experience_level && (
            <span className="inline-block rounded-full border border-indigo-300/15 bg-indigo-400/10 px-2.5 py-0.5 text-xs font-medium text-indigo-100">
              {candidate.experience_level}
            </span>
          )}
          {candidate.interview_status && (
            <span className={`ml-1 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusStyles[candidate.interview_status] || statusStyles.draft}`}>
              {statusLabel(candidate.interview_status)}
            </span>
          )}
          {!hasCv && (
            <span className="ml-1 inline-block rounded-full border border-fuchsia-300/15 bg-fuchsia-400/10 px-2.5 py-0.5 text-[10px] font-bold text-fuchsia-100">
              CV Required
            </span>
          )}
          {cvRequestPending && (
            <span className="ml-1 inline-block rounded-full border border-indigo-300/15 bg-indigo-400/10 px-2.5 py-0.5 text-[10px] font-bold text-indigo-100">
              CV Requested
            </span>
          )}
        </div>
        <span className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${scoreColor(finalScore)}`}>
          {scoreDisplay}
        </span>
      </div>

      <JobSkillsBreakdown
        requiredSkills={requiredSkills}
        exactMatches={candidate.exact_matches || []}
        semanticMatches={candidate.semantic_matches || []}
        missingSkills={candidate.missing_skills || []}
        matchBreakdown={matchBreakdown}
      />

      {Array.isArray(candidate.skills) && candidate.skills.length > 0 && (
        <details className="dashboard-subcard min-w-0 rounded-xl border p-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-white/[0.72]">
            Candidate&apos;s declared skills ({candidate.skills.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5 overflow-visible">
            {candidate.skills.map((skill) => (
              <span
                key={`cand-${skill}`}
                className="inline-flex max-w-full items-center whitespace-normal break-words rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/[0.68]"
              >
                {skill}
              </span>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-white/[0.42]">ID: {candidate.user_id}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAcceptCandidate?.(candidate)}
            disabled={accepting || requestingCv}
            className="premium-action inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-60"
          >
            {candidate.interview_status === "completed" || candidate.interview_status === "reviewed"
              ? "View Results"
              : candidate.interview_status
                ? "Interview Setup"
                : requestingCv
                  ? "Requesting CV..."
                  : accepting
                  ? "Creating..."
                  : "Accept Candidate"}
          </button>
          <a
            href={`mailto:${candidate.email}`}
            className="premium-secondary-action inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition"
          >
            Contact
          </a>
          {hasCv ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await downloadCandidateCv(getToken(), candidate.cv_filename);
                } catch (err) {
                  alert(err.message || "Failed to download CV");
                }
              }}
              className="premium-secondary-action inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition"
            >
              Download CV
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRequestCv?.(candidate)}
              disabled={requestingCv || cvRequestPending}
              className="premium-status-warning inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60"
            >
              {requestingCv ? "Requesting..." : cvRequestPending ? "CV Requested" : "Request CV"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MatchCandidatesPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptingCandidateId, setAcceptingCandidateId] = useState(null);
  const [requestingCvCandidateId, setRequestingCvCandidateId] = useState(null);
  const [notice, setNotice] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [filterExp, setFilterExp] = useState("");

  const runMatching = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await matchCandidates(token, jobId, { minScore, topK: 100 });
      const sortedCandidates = [...(result.candidates || [])].sort((left, right) => {
        const leftFinal = Number(left.final_score ?? left.score ?? 0);
        const rightFinal = Number(right.final_score ?? right.score ?? 0);
        if (rightFinal !== leftFinal) return rightFinal - leftFinal;
        return Number(right.skills_score ?? 0) - Number(left.skills_score ?? 0);
      });
      setData({ ...result, candidates: sortedCandidates });
    } catch (err) {
      setError(err.message || "Failed to match candidates");
    } finally {
      setLoading(false);
    }
  }, [jobId, minScore]);

  useEffect(() => {
    runMatching();
  }, [runMatching]);

  const handleAcceptCandidate = async (candidate) => {
    const token = getToken();
    if (!token || !jobId) return;
    if (!(candidate.hasCV || candidate.has_cv || candidate.cv_filename)) {
      await handleRequestCv(candidate, {
        message: "CV request sent. The candidate can build and submit their CV before the interview setup continues.",
      });
      return;
    }
    if (candidate.interview_session_id) {
      if (candidate.interview_status === "completed" || candidate.interview_status === "reviewed") {
        router.push(`/company-dashboard/interview/results/${candidate.interview_session_id}`);
      } else {
        router.push(
          `/company-dashboard/interview/setup/${candidate.user_id}?sessionId=${candidate.interview_session_id}`,
        );
      }
      return;
    }
    setAcceptingCandidateId(candidate.user_id);
    setError("");
    try {
      const interview = await createCompanyInterview(token, {
        candidate_id: candidate.user_id,
        job_id: Number(jobId),
      });
      router.push(
        `/company-dashboard/interview/setup/${candidate.user_id}?sessionId=${interview.id}`,
      );
    } catch (err) {
      setError(err.message || "Failed to create interview request");
    } finally {
      setAcceptingCandidateId(null);
    }
  };

  const handleRequestCv = async (candidate, { message = "CV request sent to the candidate dashboard." } = {}) => {
    const token = getToken();
    if (!token || !jobId) return;
    setRequestingCvCandidateId(candidate.user_id);
    setNotice("");
    setError("");
    try {
      const request = await requestCandidateCv(token, {
        candidate_id: candidate.user_id,
        job_id: Number(jobId),
      });
      setData((current) =>
        current
          ? {
              ...current,
              candidates: (current.candidates || []).map((item) =>
                item.user_id === candidate.user_id
                  ? {
                      ...item,
                      cv_request_id: request.id,
                      cv_request_status: request.status,
                      cv_request_created_at: request.created_at,
                      cv_request_completed_at: request.completed_at,
                    }
                  : item,
              ),
            }
          : current,
      );
      setNotice(message);
    } catch (err) {
      setError(err.message || "Failed to request CV");
    } finally {
      setRequestingCvCandidateId(null);
    }
  };

  const filteredCandidates = (data?.candidates || []).filter((c) => {
    if (filterExp && c.experience_level !== filterExp) return false;
    return true;
  });

  return (
    <div>
      <SectionHeader
        title={data?.job_title ? `Candidates for "${data.job_title}"` : "Find Candidates"}
        description="Candidates are ranked by AI-powered match score against your job requirements."
        actions={
          <button
            type="button"
            onClick={() => router.push("/company-dashboard/jobs")}
            className="premium-secondary-action rounded-xl px-4 py-2.5 text-sm font-semibold transition"
          >
            Back to Jobs
          </button>
        }
      />

      <div className="dashboard-card mb-6 flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-white/[0.62]">Min Match Score (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            className="dashboard-field w-full rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2 text-sm text-white outline-none focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/20"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-white/[0.62]">Experience Filter</label>
          <select
            value={filterExp}
            onChange={(e) => setFilterExp(e.target.value)}
            className="dashboard-field w-full rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2 text-sm text-white outline-none focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/20"
          >
            <option value="">All Levels</option>
            <option value="Entry-Level">Entry-Level</option>
            <option value="Junior">Junior</option>
            <option value="Mid-Level">Mid-Level</option>
            <option value="Senior">Senior</option>
            <option value="Lead">Lead</option>
          </select>
        </div>
        <button
          type="button"
          onClick={runMatching}
          disabled={loading}
          className="premium-action rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <p className="premium-status-danger mb-4 rounded-xl border p-3 text-sm text-rose-100">{error}</p>
      )}
      {notice && (
        <p className="premium-status-success mb-4 rounded-xl border p-3 text-sm text-cyan-100">{notice}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="dashboard-card rounded-2xl border px-6 py-4 text-sm text-white/[0.62]">
            Matching candidates...
          </div>
        </div>
      ) : data && filteredCandidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.04] p-10 text-center">
          <p className="text-sm text-white/[0.52]">
            No candidates matched the criteria. Try lowering the minimum score.
          </p>
        </div>
      ) : (
        <>
          {data && (
            <p className="mb-4 text-sm text-white/[0.52]">
              Found {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? "s" : ""} (out of {data.total_candidates} total)
            </p>
          )}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.user_id}
                candidate={candidate}
                fallbackRequiredSkills={data?.job_required_skills || []}
                accepting={acceptingCandidateId === candidate.user_id}
                requestingCv={requestingCvCandidateId === candidate.user_id}
                onAcceptCandidate={handleAcceptCandidate}
                onRequestCv={handleRequestCv}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
