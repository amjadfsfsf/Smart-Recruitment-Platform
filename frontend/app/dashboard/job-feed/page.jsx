"use client";

import { useEffect, useState } from "react";

import SectionHeader from "@/components/SectionHeader";
import { getJobFeed } from "@/lib/api";

export default function JobFeedPage() {
  const [query, setQuery] = useState("software");
  const [jobs, setJobs] = useState([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadJobs = async (nextQuery) => {
    setLoading(true);
    setError("");

    try {
      const response = await getJobFeed(nextQuery);
      setJobs(response.jobs || []);
      setSource(response.source || "unknown");
    } catch (feedError) {
      setError(feedError.message || "Could not load job feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs(query);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await loadJobs(query);
  };

  return (
    <div>
      <SectionHeader
        title="Job Feed"
        description="Browse live job listings and discover opportunities aligned with your direction."
      />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3 md:flex-row"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search jobs by keyword"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Fetch Jobs"}
        </button>
      </form>

      <p className="mt-3 text-xs text-slate-500">Feed source: {source || "-"}</p>
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => (
          <article key={`${job.title}-${job.company}-${job.apply_link}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slateplus">{job.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{job.company}</p>
            <p className="text-sm text-slate-500">{job.location}</p>
            <p className="mt-2 text-sm text-slate-600">{job.description}</p>
            <p className="mt-2 text-xs text-slate-500">
              {Array.isArray(job.sources) && job.sources.length
                ? `Sources: ${job.sources.join(", ")}`
                : job.source
                  ? `Source: ${job.source}`
                  : "Source: -"}
            </p>
            <a
              href={job.apply_link}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
            >
              View Job
            </a>
          </article>
        ))}
      </section>
    </div>
  );
}
