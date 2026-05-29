"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SectionHeader from "@/components/SectionHeader";
import { createCompanyJob, getCompanyJobs, deleteCompanyJob } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

const EXPERIENCE_OPTIONS = [
  "Entry-Level",
  "Junior",
  "Mid-Level",
  "Senior",
  "Lead",
  "Principal",
];

function SkillTagInput({ skills, onChange }) {
  const [input, setInput] = useState("");

  const addSkill = () => {
    const trimmed = input.trim();
    if (trimmed && !skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...skills, trimmed]);
    }
    setInput("");
  };

  const removeSkill = (idx) => {
    onChange(skills.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill();
    }
    if (e.key === "Backspace" && !input && skills.length) {
      removeSkill(skills.length - 1);
    }
  };

  return (
    <div className="dashboard-subcard rounded-xl border p-2 focus-within:ring-2 focus-within:ring-cyan-300/25">
      <div className="flex flex-wrap gap-1.5 mb-1">
        {skills.map((skill, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-100"
          >
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(idx)}
              className="ml-0.5 text-cyan-100/65 hover:text-rose-100"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addSkill}
        placeholder={skills.length ? "Add more skills..." : "Type a skill and press Enter"}
        className="w-full border-none bg-transparent text-sm text-white outline-none placeholder:text-white/[0.45]"
      />
    </div>
  );
}

function CreateJobForm({ onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState([]);
  const [experienceLevel, setExperienceLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !skills.length) {
      setError("Title, description, and at least one skill are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const payload = {
        title: title.trim(),
        description: description.trim(),
        required_skills: skills,
      };
      if (experienceLevel) payload.experience_level = experienceLevel;
      await createCompanyJob(token, payload);
      setTitle("");
      setDescription("");
      setSkills([]);
      setExperienceLevel("");
      onCreated();
    } catch (err) {
      setError(err.message || "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="dashboard-card space-y-4 rounded-2xl border p-6"
    >
      <h2 className="text-lg font-semibold text-white">Create New Job</h2>

      {error && (
        <p className="premium-status-danger rounded-xl border p-3 text-sm text-rose-100">{error}</p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-white/[0.72]">Job Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Frontend Developer"
          className="dashboard-field w-full rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/20"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-white/[0.72]">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the role, responsibilities, and requirements..."
          className="dashboard-field w-full resize-none rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/20"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-white/[0.72]">Required Skills</label>
        <SkillTagInput skills={skills} onChange={setSkills} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-white/[0.72]">Experience Level (optional)</label>
        <select
          value={experienceLevel}
          onChange={(e) => setExperienceLevel(e.target.value)}
          className="dashboard-field w-full rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white outline-none focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/20"
        >
          <option value="">Any</option>
          {EXPERIENCE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="premium-action rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create Job"}
      </button>
    </form>
  );
}

function JobCard({ job, onDelete }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this job posting?")) return;
    setDeleting(true);
    try {
      const token = getToken();
      await deleteCompanyJob(token, job.id);
      onDelete();
    } catch {
      alert("Failed to delete job");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="dashboard-card flex flex-col gap-3 rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">{job.title}</h3>
          {job.experience_level && (
            <span className="inline-block rounded-full border border-indigo-300/15 bg-indigo-400/10 px-2.5 py-0.5 text-xs font-medium text-indigo-100">
              {job.experience_level}
            </span>
          )}
        </div>
        <span className="whitespace-nowrap text-xs text-white/[0.42]">
          {job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}
        </span>
      </div>

      <p className="line-clamp-3 text-sm text-white/[0.62]">{job.description}</p>

      <div className="flex flex-wrap gap-2">
        {(job.required_skills || []).map((skill) => (
          <span key={skill} className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-xs text-white/[0.68]">
            {skill}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/company-dashboard/jobs/${job.id}/candidates`)}
          className="premium-action rounded-xl px-4 py-2 text-sm font-semibold transition"
        >
          Find Candidates
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-xl border border-rose-300/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/10 disabled:opacity-60"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </article>
  );
}

export default function CompanyJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const user = getUser();
      if (!token || !user) {
        setError("Not authenticated");
        return;
      }
      const data = await getCompanyJobs(token, user.id);
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  return (
    <div>
      <SectionHeader
        title="Company Jobs"
        description="Create job postings and find the best candidates using AI-powered matching."
        actions={
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="premium-action rounded-xl px-4 py-2.5 text-sm font-semibold transition"
          >
            {showForm ? "Cancel" : "Create New Job"}
          </button>
        }
      />

      {showForm && (
        <div className="mb-6">
          <CreateJobForm
            onCreated={() => {
              setShowForm(false);
              loadJobs();
            }}
          />
        </div>
      )}

      {error && (
        <p className="premium-status-danger mb-4 rounded-xl border p-3 text-sm text-rose-100">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="dashboard-card rounded-2xl border px-6 py-4 text-sm text-white/[0.62]">
            Loading jobs...
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.04] p-10 text-center">
          <p className="text-sm text-white/[0.52]">
            No job postings yet. Click &quot;Create New Job&quot; to get started.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-white/[0.52]">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} created
          </p>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onDelete={loadJobs} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
