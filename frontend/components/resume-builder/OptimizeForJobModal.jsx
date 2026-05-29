"use client";

import { useEffect, useMemo, useState } from "react";

import SummaryOptionCard from "./SummaryOptionCard";
import { optimizeResumeForJob } from "@/services/aiOptimizer";
import { generateSummaries } from "@/services/summaryGenerator";

function SuggestionStatus({ status }) {
  if (status === "accepted") {
    return <span className="premium-status-success rounded-full border px-2.5 py-1 text-xs font-semibold">Accepted</span>;
  }

  if (status === "rejected") {
    return <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-white/[0.58]">Rejected</span>;
  }

  return null;
}

function SuggestionActions({ status, onAccept, onReject }) {
  if (status !== "pending") {
    return <SuggestionStatus status={status} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onReject}
        className="premium-secondary-action rounded-2xl px-3.5 py-2 text-sm font-medium transition"
      >
        Reject
      </button>
      <button
        type="button"
        onClick={onAccept}
        className="premium-action rounded-2xl px-3.5 py-2 text-sm font-semibold transition"
      >
        Accept
      </button>
    </div>
  );
}

function HighlightedAfterText({ before = "", after = "" }) {
  const beforeTokens = new Set(
    String(before || "")
      .toLowerCase()
      .match(/[a-z0-9+#./-]+/g) || [],
  );

  return (
    <div className="whitespace-pre-wrap text-sm leading-6 text-white/[0.68]">
      {String(after || "").split(/(\s+)/).map((part, index) => {
        if (/^\s+$/.test(part)) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        const normalizedToken = part.toLowerCase().replace(/[^a-z0-9+#./-]/g, "");
        const isNewToken = normalizedToken && !beforeTokens.has(normalizedToken);

        return isNewToken ? (
          <mark key={`${part}-${index}`} className="rounded bg-fuchsia-400/20 px-0.5 text-fuchsia-100">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        );
      })}
    </div>
  );
}

function ComparisonCard({ title, status, before, after, onAccept, onReject }) {
  return (
    <article className="dashboard-card rounded-[1.5rem] border p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/[0.46]">Before vs After</p>
        </div>
        <SuggestionActions status={status} onAccept={onAccept} onReject={onReject} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="dashboard-subcard rounded-2xl border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.46]">Before</p>
          <div className="whitespace-pre-wrap text-sm leading-6 text-white/[0.62]">{before || "No content yet."}</div>
        </div>

        <div className="premium-status-warning rounded-2xl border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-100">Suggested</p>
          <HighlightedAfterText before={before} after={after} />
        </div>
      </div>
    </article>
  );
}

export default function OptimizeForJobModal({
  open,
  resumeData,
  initialContext,
  onClose,
  onSaveContext,
  onAcceptSummary,
  onAcceptSkills,
  onAcceptExperience,
}) {
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [inputError, setInputError] = useState("");
  const [loading, setLoading] = useState(false);
  const [optimization, setOptimization] = useState(null);
  const [summaryOptions, setSummaryOptions] = useState([]);
  const [selectedSummaryId, setSelectedSummaryId] = useState("");
  const [skillsStatus, setSkillsStatus] = useState("pending");
  const [experienceStatuses, setExperienceStatuses] = useState({});
  const mode = optimization?.mode || (jobDescription.trim() ? "job-optimize" : "rewrite");

  const suggestedTitles = Array.from(
    new Set(
      [
        initialContext?.jobTitle,
        resumeData?.experience?.[0]?.jobTitle,
        "Frontend Developer",
        "Product Designer",
        "Full Stack Engineer",
        "Software Engineer",
      ]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );

  const currentSkills = useMemo(
    () =>
      (resumeData?.skills || [])
        .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
        .filter(Boolean),
    [resumeData?.skills],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setJobDescription(initialContext?.jobDescription || "");
    setJobTitle(initialContext?.jobTitle || resumeData?.experience?.[0]?.jobTitle || "");
    setInputError("");
    setLoading(false);
    setOptimization(null);
    setSummaryOptions([]);
    setSelectedSummaryId("");
    setSkillsStatus("pending");
    setExperienceStatuses({});
  }, [initialContext, open, resumeData?.experience]);

  if (!open) {
    return null;
  }

  const handleGenerate = async () => {
    setLoading(true);
    setInputError("");
    onSaveContext({
      jobDescription: jobDescription.trim(),
      jobTitle: jobTitle.trim(),
    });

    try {
      const [suggestionSet, generatedSummaries] = await Promise.all([
        optimizeResumeForJob({
          resumeData,
          jobDescription: jobDescription.trim(),
          jobTitle: jobTitle.trim(),
        }),
        generateSummaries({
          summary: resumeData?.summary || "",
          skills: currentSkills,
          experience: resumeData?.experience || [],
          jobDescription: jobDescription.trim(),
        }),
      ]);

      setOptimization(suggestionSet);
      setSummaryOptions(generatedSummaries);
      setSelectedSummaryId(generatedSummaries[0]?.id || "");
      setSkillsStatus("pending");
      setExperienceStatuses(
        Object.fromEntries((suggestionSet.experience || []).map((item) => [item.index, "pending"])),
      );
    } catch (error) {
      console.error("Validation failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUseSummary = (option) => {
    setSelectedSummaryId(option.id);
    onAcceptSummary(option.summary, {
      optimized: Boolean(option?.optimized),
      jobDescription: jobDescription.trim(),
    });
  };

  const acceptAll = () => {
    if (!optimization) {
      return;
    }

    const selectedSummary =
      summaryOptions.find((option) => option.id === selectedSummaryId) || summaryOptions[0];

    if (selectedSummary) {
      onAcceptSummary(selectedSummary.summary, {
        optimized: Boolean(selectedSummary?.optimized),
        jobDescription: jobDescription.trim(),
      });
      setSelectedSummaryId(selectedSummary.id);
    }

    if (skillsStatus === "pending") {
      onAcceptSkills(optimization.skills.suggested, {
        optimized: mode === "job-optimize",
      });
      setSkillsStatus("accepted");
    }

    (optimization.experience || []).forEach((item) => {
      if (experienceStatuses[item.index] !== "pending") {
        return;
      }

      onAcceptExperience(item.index, item.after, {
        optimized: mode === "job-optimize",
      });
      setExperienceStatuses((currentStatuses) => ({
        ...currentStatuses,
        [item.index]: "accepted",
      }));
    });
  };

  return (
    <div className="dashboard-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="dashboard-modal max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[32px] border p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Optimize for Job</h2>
            <p className="mt-1 text-sm text-white/[0.62]">
              Add a job description for job-aligned optimization, or leave it blank for a smarter rewrite based on your summary, skills, and experience.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {optimization ? (
              <button
                type="button"
                onClick={acceptAll}
                className="premium-secondary-action rounded-2xl px-4 py-2 text-sm font-semibold transition"
              >
                Accept all suggestions
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="premium-secondary-action rounded-2xl px-4 py-2 text-sm font-medium transition"
            >
              Close
            </button>
          </div>
        </div>

        <div className="dashboard-card rounded-[1.5rem] border p-5">
          <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
            <div>
              <label htmlFor="optimize-job-title" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Job Title
              </label>
              <input
                id="optimize-job-title"
                list="job-title-suggestions"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="Optional target title"
                className="dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60"
              />
              <datalist id="job-title-suggestions">
                {suggestedTitles.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
            </div>

            <div className="md:row-span-2">
              <label htmlFor="optimize-job-description" className="mb-1.5 block text-sm font-medium text-white/[0.78]">
                Job Description
              </label>
              <textarea
                id="optimize-job-description"
                rows={8}
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Optional: paste the job description here for keyword alignment..."
                className="dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm leading-6 text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="premium-action inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Optimizing...
                  </>
                ) : (
                  "Analyze and suggest changes"
                )}
              </button>
              <p className="text-xs text-white/[0.52]">Suggestions stay editable and concise.</p>
            </div>
          </div>

          {inputError ? <p className="mt-3 text-sm text-rose-200">{inputError}</p> : null}
        </div>

        {optimization ? (
          <div className="mt-6 space-y-4">
            <div className="dashboard-card rounded-[1.5rem] border p-5">
              <p className="text-sm font-semibold text-white">
                {mode === "job-optimize" ? "Keyword focus" : "Focus areas"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {optimization.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            <article className="dashboard-card rounded-[1.5rem] border p-5">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-white">Optimized Summary Options</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/[0.46]">
                  {mode === "job-optimize" ? "Before + 3 job-aligned versions" : "Before + 3 stronger rewrite options"}
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="dashboard-subcard rounded-2xl border p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.46]">Before</p>
                  <div className="whitespace-pre-wrap text-sm leading-6 text-white/[0.62]">
                    {resumeData?.summary || "No summary entered yet."}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  {summaryOptions.map((option) => (
                    <SummaryOptionCard
                      key={option.id}
                      option={option}
                      selected={selectedSummaryId === option.id}
                      onSelect={() => setSelectedSummaryId(option.id)}
                      onUse={() => handleUseSummary(option)}
                    />
                  ))}
                </div>
              </div>
            </article>

            <article className="dashboard-card rounded-[1.5rem] border p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Skills suggestions</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/[0.46]">Current vs Suggested</p>
                </div>
                <SuggestionActions
                  status={skillsStatus}
                  onAccept={() => {
                    onAcceptSkills(optimization.skills.suggested, {
                      optimized: mode === "job-optimize",
                    });
                    setSkillsStatus("accepted");
                  }}
                  onReject={() => setSkillsStatus("rejected")}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="dashboard-subcard rounded-2xl border p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.46]">Current</p>
                  <div className="flex flex-wrap gap-2">
                    {optimization.skills.current.length ? (
                      optimization.skills.current.map((skill) => (
                        <span key={skill} className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-xs text-white/[0.66]">
                          {skill}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-white/[0.52]">No skills entered yet.</p>
                    )}
                  </div>
                </div>

                <div className="premium-status-warning rounded-2xl border p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-100">Suggested</p>
                  <div className="flex flex-wrap gap-2">
                    {optimization.skills.suggested.map((skill) => {
                      const isNewSkill = optimization.skills.newSkills.includes(skill);

                      return (
                        <span
                          key={skill}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isNewSkill
                              ? "border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100"
                              : "border border-white/[0.08] bg-white/[0.06] text-white/[0.66]"
                          }`}
                        >
                          {skill}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </article>

            {(optimization.experience || []).map((item) => (
              <ComparisonCard
                key={`experience-${item.index}`}
                title={`${item.title}${item.company ? ` - ${item.company}` : ""}`}
                status={experienceStatuses[item.index] || "pending"}
                before={item.before}
                after={item.after}
                onAccept={() => {
                  onAcceptExperience(item.index, item.after, {
                    optimized: mode === "job-optimize",
                  });
                  setExperienceStatuses((currentStatuses) => ({
                    ...currentStatuses,
                    [item.index]: "accepted",
                  }));
                }}
                onReject={() =>
                  setExperienceStatuses((currentStatuses) => ({
                    ...currentStatuses,
                    [item.index]: "rejected",
                  }))
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
