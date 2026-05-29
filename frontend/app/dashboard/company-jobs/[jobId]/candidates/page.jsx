"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import SectionHeader from "@/components/SectionHeader";
import { matchCandidates } from "@/lib/api";
import { getToken } from "@/lib/auth";

const scoreColor = (score) => {
  if (score >= 70) return "border-cyan-300/15 bg-cyan-400/10 text-cyan-100";
  if (score >= 45) return "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100";
  return "border-rose-300/15 bg-rose-500/10 text-rose-100";
};

function CandidateCard({ candidate }) {
  return (
    <article className="dashboard-card flex flex-col gap-3 rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">
            {candidate.full_name}
          </h3>
          <p className="text-sm text-white/[0.54]">{candidate.email}</p>
          {candidate.experience_level && (
            <span className="inline-block rounded-full border border-indigo-300/15 bg-indigo-400/10 px-2.5 py-0.5 text-xs font-medium text-indigo-100">
              {candidate.experience_level}
            </span>
          )}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${scoreColor(candidate.score)}`}
        >
          {candidate.score_display}
        </span>
      </div>

      {/* Skills */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-white/[0.68]">Skills</p>
        <div className="flex flex-wrap gap-1.5">
          {(candidate.skills || []).slice(0, 12).map((skill) => {
            const isMissing =
              Array.isArray(candidate.missing_skills) &&
              candidate.missing_skills.some(
                (m) => m.toLowerCase() === skill.toLowerCase()
              );
            return (
              <span
                key={skill}
                className={
                  isMissing
                    ? "rounded-full border border-rose-300/15 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-100"
                    : "rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-100"
                }
              >
                {skill}
              </span>
            );
          })}
        </div>
      </div>

      {/* Missing Skills */}
      {candidate.missing_skills?.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-rose-100">
            Missing Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidate.missing_skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-rose-300/15 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-100"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      <div className="flex items-center justify-between border-t border-white/[0.08] pt-2">
        <span className="text-xs text-white/[0.42]">ID: {candidate.user_id}</span>
        <a
          href={`mailto:${candidate.email}`}
          className="premium-secondary-action inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition"
        >
          Contact
        </a>
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
      const result = await matchCandidates(token, jobId, {
        minScore,
        topK: 100,
      });
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to match candidates");
    } finally {
      setLoading(false);
    }
  }, [jobId, minScore]);

  useEffect(() => {
    runMatching();
  }, [runMatching]);

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
            onClick={() => router.push("/dashboard/company-jobs")}
            className="premium-secondary-action rounded-xl px-4 py-2.5 text-sm font-semibold transition"
          >
            Back to Jobs
          </button>
        }
      />

      {/* Filters */}
      <div className="dashboard-card mb-6 flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-white/[0.62]">
            Min Match Score (%)
          </label>
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
          <label className="mb-1 block text-xs font-medium text-white/[0.62]">
            Experience Filter
          </label>
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
        <p className="premium-status-danger mb-4 rounded-xl border p-3 text-sm text-rose-100">
          {error}
        </p>
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
              Found {filteredCandidates.length} candidate
              {filteredCandidates.length !== 1 ? "s" : ""} (out of {data.total_candidates} total)
            </p>
          )}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCandidates.map((candidate) => (
              <CandidateCard key={candidate.user_id} candidate={candidate} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
