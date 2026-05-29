"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SectionHeader from "@/components/SectionHeader";
import { Badge, Button, Card, EmptyState, Field, Label, LoadingState, PageShell, Tag } from "@/components/ui/DashboardUI";
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
    <div className="dashboard-subcard rounded-xl border p-2 focus-within:ring-2 focus-within:ring-brand-300">
      <div className="flex flex-wrap gap-1.5 mb-1">
        {skills.map((skill, idx) => (
          <Tag key={idx} variant="accent" className="gap-1.5">
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(idx)}
              className="text-current/65 hover:text-current"
            >
              ×
            </button>
          </Tag>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addSkill}
        placeholder={skills.length ? "Add more skills..." : "Type a skill and press Enter"}
        className="h-9 w-full border-none bg-transparent text-sm text-white outline-none placeholder:text-white/45"
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
    <Card as="form" onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Create New Job</h2>

      {error && (
        <p className="premium-status-danger rounded-xl border p-3 text-sm text-rose-100">{error}</p>
      )}

      <div>
        <Label>Job Title</Label>
        <Field
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Frontend Developer"
        />
      </div>

      <div>
        <Label>Description</Label>
        <Field
          as="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the role, responsibilities, and requirements..."
        />
      </div>

      <div>
        <Label>Required Skills</Label>
        <SkillTagInput skills={skills} onChange={setSkills} />
      </div>

      <div>
        <Label>Experience Level (optional)</Label>
        <Field
          as="select"
          value={experienceLevel}
          onChange={(e) => setExperienceLevel(e.target.value)}
        >
          <option value="">Any</option>
          {EXPERIENCE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Field>
      </div>

      <Button
        type="submit"
        disabled={loading}
      >
        {loading ? "Creating..." : "Create Job"}
      </Button>
    </Card>
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
    <Card as="article" interactive className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">{job.title}</h3>
          {job.experience_level && (
            <Badge variant="slate">
              {job.experience_level}
            </Badge>
          )}
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}
        </span>
      </div>

      <p className="line-clamp-3 text-sm text-white/[0.62]">{job.description}</p>

      <div className="flex flex-wrap gap-2">
        {(job.required_skills || []).map((skill) => (
          <Tag key={skill}>{skill}</Tag>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          type="button"
          onClick={() => router.push(`/dashboard/company-jobs/${job.id}/candidates`)}
          size="sm"
        >
          Find Candidates
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleDelete}
          disabled={deleting}
          size="sm"
        >
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </Card>
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
    <PageShell>
      <SectionHeader
        title="Company Jobs"
        description="Create job postings and find the best candidates using AI-powered matching."
        actions={
          <Button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            variant={showForm ? "secondary" : "primary"}
          >
            {showForm ? "Cancel" : "Create New Job"}
          </Button>
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
        <p className="premium-status-danger mb-4 rounded-xl border p-3 text-sm text-rose-100">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingState label="Loading jobs..." />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState title="No job postings yet" description="Create a role to start finding AI-ranked candidates." />
      ) : (
        <>
          <p className="mb-4 text-sm text-white/[0.52]">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} created
          </p>
          <section className="grid auto-rows-fr gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onDelete={loadJobs} />
            ))}
          </section>
        </>
      )}
    </PageShell>
  );
}
