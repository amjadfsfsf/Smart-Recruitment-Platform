"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { EXPERIENCE_LEVELS } from "@/lib/resumeBuilder";

const inputClassName =
  "dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/20";

export default function AIFormModal({ open, loading, initialValues, onClose, onGenerate }) {
  const [submitError, setSubmitError] = useState("");
  const [lastValues, setLastValues] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm({
    defaultValues: {
      jobTitle: "",
      level: "Mid",
      skills: "",
      education: "",
      currentSummary: "",
      currentExperience: "",
      currentProjects: "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    reset({
      jobTitle: initialValues?.jobTitle || "",
      level: initialValues?.level || "Mid",
      skills: initialValues?.skills || "",
      education: initialValues?.education || "",
      currentSummary: initialValues?.currentSummary || "",
      currentExperience: initialValues?.currentExperience || "",
      currentProjects: initialValues?.currentProjects || "",
    });
    setSubmitError("");
    setLastValues(null);
  }, [initialValues, open, reset]);

  if (!open) {
    return null;
  }

  const submit = async (values) => {
    setSubmitError("");
    setLastValues(values);

    try {
      await onGenerate(values);
      onClose();
    } catch (error) {
      setSubmitError(error.message || "AI generation failed. Please try again.");
    }
  };

  const handleRetry = async () => {
    const retryValues = lastValues || getValues();
    await submit(retryValues);
  };

  return (
    <div className="dashboard-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="dashboard-modal w-full max-w-2xl rounded-[32px] border p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Generate with AI</h2>
            <p className="mt-1 text-sm text-white/[0.62]">
              Draft ATS-friendly summary, skills, experience, and projects. Review dates before export.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="premium-secondary-action rounded-full px-3 py-1 text-sm transition"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="ai-job-title" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Job Title
              </label>
              <input
                id="ai-job-title"
                type="text"
                placeholder="Frontend Developer"
                className={inputClassName}
                {...register("jobTitle", {
                  required: "Job title is required.",
                })}
              />
              {errors?.jobTitle?.message ? (
                <p className="mt-1.5 text-xs text-rose-200">{errors.jobTitle.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="ai-level" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Experience Level
              </label>
              <select
                id="ai-level"
                className={inputClassName}
                {...register("level", {
                  required: "Experience level is required.",
                })}
              >
                {EXPERIENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
              {errors?.level?.message ? <p className="mt-1.5 text-xs text-rose-200">{errors.level.message}</p> : null}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ai-skills" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Skills
              </label>
              <input
                id="ai-skills"
                type="text"
                placeholder="React, TypeScript, Tailwind CSS"
                className={inputClassName}
                {...register("skills")}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ai-education" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Education
              </label>
              <textarea
                id="ai-education"
                rows={2}
                placeholder="BSc in Computer Science, University of Jordan"
                className={inputClassName}
                {...register("education")}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ai-current-summary" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Existing Summary (Optional)
              </label>
              <textarea
                id="ai-current-summary"
                rows={2}
                placeholder="Paste your current summary here to enhance it..."
                className={inputClassName}
                {...register("currentSummary")}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ai-current-experience" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Existing Experience (Optional)
              </label>
              <textarea
                id="ai-current-experience"
                rows={3}
                placeholder="Paste your current experience bullets here..."
                className={inputClassName}
                {...register("currentExperience")}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ai-current-projects" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Existing Projects (Optional)
              </label>
              <textarea
                id="ai-current-projects"
                rows={3}
                placeholder="Paste your current projects here..."
                className={inputClassName}
                {...register("currentProjects")}
              />
            </div>
          </div>

          {submitError ? (
            <div className="premium-status-danger rounded-2xl border p-3">
              <p className="text-sm text-rose-100">{submitError}</p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={loading}
                className="mt-3 rounded-2xl border border-rose-300/20 px-3.5 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="premium-secondary-action rounded-2xl px-4 py-2.5 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="premium-action inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Generating...
                </>
              ) : (
                "Generate Resume Draft"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
