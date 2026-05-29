"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import JobSkillsBreakdown from "@/components/company/JobSkillsBreakdown";
import SectionHeader from "@/components/SectionHeader";
import { createCompanyInterview, downloadCandidateCv, getCompanyJobs, matchCandidates, requestCandidateCv } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

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
    <article className="dashboard-card flex min-w-0 flex-col gap-4 overflow-visible rounded-[1.5rem] border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h3 className="text-base font-semibold text-white">{candidate.full_name}</h3>
          <p className="text-sm text-slate-500 break-all">{candidate.email}</p>
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
                className="inline-flex max-w-full items-center whitespace-normal break-words rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/[0.7]"
              >
                {skill}
              </span>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-400">ID: {candidate.user_id}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAcceptCandidate?.(candidate)}
            disabled={accepting || requestingCv}
            className="premium-action inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-60"
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
            className="premium-secondary-action inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition"
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
              className="premium-secondary-action inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition"
            >
              Download CV
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRequestCv?.(candidate)}
              disabled={requestingCv || cvRequestPending}
              className="premium-secondary-action inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-60"
            >
              {requestingCv ? "Requesting..." : cvRequestPending ? "CV Requested" : "Request CV"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function CandidatesPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [jobTitle, setJobTitle] = useState("");
  const [jobRequiredSkills, setJobRequiredSkills] = useState([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [acceptingCandidateId, setAcceptingCandidateId] = useState(null);
  const [requestingCvCandidateId, setRequestingCvCandidateId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const token = getToken();
      const user = getUser();
      if (!token || !user) return;
      const data = await getCompanyJobs(token, user.id);
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load jobs");
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleSearch = async () => {
    if (!selectedJobId) return;
    const token = getToken();
    if (!token) return;
    setLoadingCandidates(true);
    setError("");
    setCandidates([]);
    setJobRequiredSkills([]);
    try {
      const result = await matchCandidates(token, selectedJobId, { minScore: 0, topK: 100 });
      const sortedCandidates = [...(result.candidates || [])].sort((left, right) => {
        const leftFinal = Number(left.final_score ?? left.score ?? 0);
        const rightFinal = Number(right.final_score ?? right.score ?? 0);
        if (rightFinal !== leftFinal) return rightFinal - leftFinal;
        return Number(right.skills_score ?? 0) - Number(left.skills_score ?? 0);
      });
      setCandidates(sortedCandidates);
      setJobTitle(result.job_title || "");
      setJobRequiredSkills(
        Array.isArray(result?.job_required_skills) ? result.job_required_skills : [],
      );
      setTotalCandidates(result.total_candidates || 0);
    } catch (err) {
      setError(err.message || "Failed to match candidates");
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleAcceptCandidate = async (candidate) => {
    const token = getToken();
    if (!token || !selectedJobId) return;
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
        job_id: Number(selectedJobId),
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
    if (!token || !selectedJobId) return;
    setRequestingCvCandidateId(candidate.user_id);
    setNotice("");
    setError("");
    try {
      const request = await requestCandidateCv(token, {
        candidate_id: candidate.user_id,
        job_id: Number(selectedJobId),
      });
      setCandidates((current) =>
        current.map((item) =>
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
      );
      setNotice(message);
    } catch (err) {
      setError(err.message || "Failed to request CV");
    } finally {
      setRequestingCvCandidateId(null);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Candidates"
        description="Select a job posting to find and rank matching candidates."
      />

      <div className="dashboard-card mb-6 flex flex-col gap-3 rounded-[1.5rem] border p-5 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-white/[0.62]">Select Job Posting</label>
          {loadingJobs ? (
            <p className="py-2 text-sm text-white/[0.48]">Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <p className="py-2 text-sm text-white/[0.48]">No jobs created yet. Create one in Company Jobs first.</p>
          ) : (
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="dashboard-field w-full rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white outline-none"
            >
              <option value="">Choose a job...</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!selectedJobId || loadingCandidates}
          className="premium-action rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60"
        >
          {loadingCandidates ? "Searching..." : "Find Candidates"}
        </button>
      </div>

      {error && (
        <p className="premium-status-danger mb-4 rounded-xl border p-3 text-sm">{error}</p>
      )}
      {notice && (
        <p className="premium-status-success mb-4 rounded-xl border p-3 text-sm">{notice}</p>
      )}

      {loadingCandidates ? (
        <div className="flex items-center justify-center py-12">
          <div className="dashboard-card rounded-2xl border px-6 py-4 text-sm text-white/[0.68]">
            Matching candidates...
          </div>
        </div>
      ) : candidates.length > 0 ? (
        <>
          <p className="mb-4 text-sm text-white/[0.58]">
            Found {candidates.length} candidate{candidates.length !== 1 ? "s" : ""} for &quot;{jobTitle}&quot; (out of {totalCandidates} total)
          </p>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.user_id}
                candidate={candidate}
                fallbackRequiredSkills={jobRequiredSkills}
                accepting={acceptingCandidateId === candidate.user_id}
                requestingCv={requestingCvCandidateId === candidate.user_id}
                onAcceptCandidate={handleAcceptCandidate}
                onRequestCv={handleRequestCv}
              />
            ))}
          </section>
        </>
      ) : selectedJobId && !loadingCandidates && !error ? (
        <div className="rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.04] p-10 text-center">
          <p className="text-sm text-white/[0.56]">No candidates found. Try a different job posting.</p>
        </div>
      ) : null}
    </div>
  );
}
