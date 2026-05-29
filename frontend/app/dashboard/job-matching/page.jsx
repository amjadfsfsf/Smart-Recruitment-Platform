"use client";

import { useState } from "react";

import JobSkillAnalysis from "@/components/JobSkillAnalysis";
import SectionHeader from "@/components/SectionHeader";
import { Badge, Button, Card, EmptyState, Field, PageShell, Tag } from "@/components/ui/DashboardUI";
import { getJobMatching } from "@/lib/api";
import { getToken } from "@/lib/auth";

const normalizeScore = (raw) => {
  const num = typeof raw === "number" ? raw : parseFloat(raw);
  if (!Number.isFinite(num)) return 0;
  if (num <= 1) return Math.max(0, Math.min(100, num * 100));
  return Math.max(0, Math.min(100, num));
};

const normalizeJobs = (items = []) =>
  items.map((job, idx) => {
    const score = normalizeScore(
      typeof job.score === "number" ? job.score : job.match_score
    );

    const sources = Array.isArray(job.sources)
      ? job.sources.filter(Boolean)
      : job.source
        ? [job.source]
        : [];

    return {
      id: job.job_id || job.id || job.external_job_id || `job-${idx}`,
      title: job.title || job.job_title || "Unknown title",
      company: job.company || "Unknown company",
      location: job.location || "Unknown location",
      description:
        job.description || job.job_description || "No description available.",
      skills: job.skills || job.required_skills || [],
      score,
      scoreDisplay:
        typeof job.score_display === "string"
          ? job.score_display
          : `${score.toFixed(2)}%`,
      applyUrl: job.apply_url || job.apply_link || job.url || "",
      sourceLabel:
        sources.length > 1
          ? `Sources: ${sources.join(", ")}`
          : sources.length === 1
            ? `Source: ${sources[0]}`
            : "External source",
    };
  });

export default function JobMatchingPage() {
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ searched_jobs: 0, returned_jobs: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const mergeJobs = (existing, incoming) => {
    if (!existing.length) return incoming;
    const byId = new Map();
    for (const job of existing) byId.set(job.id, job);
    for (const job of incoming) byId.set(job.id, job);
    return Array.from(byId.values());
  };

  const resetPagination = () => {
    setPage(1);
    setJobs([]);
    setMeta({ searched_jobs: 0, returned_jobs: 0 });
    setError("");
  };

  const runMatching = async () => {
    const token = getToken();
    const currentPage = page;

    if (!token) {
      setError("User not logged in");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await getJobMatching(
        token,
        {
          top_k: 50,
          fetch_limit: 100,
        },
        currentPage
      );

      const normalized = normalizeJobs(response.recommended_jobs || []);
      const apiJobsCount =
        typeof response.api_jobs_count === "number" ? response.api_jobs_count : normalized.length;
      setJobs((prev) => (currentPage === 1 ? normalized : mergeJobs(prev, normalized)));
      setMeta({
        searched_jobs: response.searched_jobs || 0,
        returned_jobs: response.returned_jobs || 0,
      });

      if (apiJobsCount > 0 && normalized.length > 0) {
        setPage((prev) => prev + 1);
      }
    } catch (err) {
      setError(err.message || "Could not fetch job recommendations");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await runMatching();
  };

  return (
    <PageShell>
      <SectionHeader
        title="Job Matching"
        description="Analyze your profile and discover roles based on your desired job title, career context, and skill similarity."
      />

      <form
        onSubmit={handleSubmit}
        className="dashboard-card flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:p-5"
      >
        <Field
          value="Your profile skills, desired job title, and career context will be used automatically"
          readOnly
          className="flex-1 bg-white/[0.045] text-white/66"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Analyzing..." : "Find Matches"}
        </Button>
        <Button type="button" variant="secondary" onClick={resetPagination} disabled={loading}>
          Reset
        </Button>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {!error && jobs.length ? (
        <p className="text-sm leading-6 text-slate-500">
          Searched {meta.searched_jobs} jobs and returned the top {meta.returned_jobs} matches ranked by the model.
        </p>
      ) : null}

      <section className="grid auto-rows-fr gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {jobs.map((job) => (
          <JobMatchCard key={job.id} job={job} />
        ))}
      </section>

      {!jobs.length && !loading && !error ? (
        <EmptyState
          title="No matches yet"
          description="Run AI matching to discover roles ranked against your current profile and target direction."
        />
      ) : null}
    </PageShell>
  );
}

function JobMatchCard({ job }) {
  const visibleSkills = (job.skills || []).slice(0, 6);
  const scoreWidth = `${Math.max(0, Math.min(100, Number(job.score) || 0))}%`;

  return (
    <Card as="article" interactive className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base font-semibold leading-6 text-white">{job.title}</h3>
          <p className="mt-1 truncate text-sm text-white/66">
            {job.company} <span className="text-white/30">•</span> {job.location}
          </p>
        </div>
        <span className="premium-metric-badge shrink-0 rounded-full px-3 py-1 text-xs font-bold">{job.scoreDisplay}</span>
      </div>

      <div className="premium-progress-track h-2.5 rounded-full">
        <div className="premium-progress-fill h-full rounded-full transition-all duration-700" style={{ width: scoreWidth }} />
      </div>

      <p className="line-clamp-3 text-sm leading-6 text-white/68">{job.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {visibleSkills.length ? visibleSkills.map((skill) => (
          <Tag key={skill}>{skill}</Tag>
        )) : <span className="text-xs text-white/48">No skills listed</span>}
      </div>

      <div className="mt-auto">
        <JobSkillAnalysis
          jobTitle={job.title}
          jobDescription={job.description}
          jobSkills={job.skills}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="min-w-0 truncate text-xs text-white/46">{job.sourceLabel}</span>
        {job.applyUrl ? (
          <Button
            as="a"
            variant="secondary"
            size="sm"
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Job
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            No Link
          </Button>
        )}
      </div>
    </Card>
  );
}

