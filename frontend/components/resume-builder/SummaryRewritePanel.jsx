"use client";

import { useEffect, useMemo, useState } from "react";

import SummaryOptionCard from "./SummaryOptionCard";
import { generateSummaries } from "@/services/summaryGenerator";

export default function SummaryRewritePanel({
  currentSummary = "",
  skills = [],
  experience = [],
  onApplySummary,
  onSuccess,
  onError,
}) {
  const [summaries, setSummaries] = useState([]);
  const [selectedSummaryId, setSelectedSummaryId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [panelError, setPanelError] = useState("");

  const hasInputData = useMemo(() => {
    const normalizedSkills = (skills || []).filter((skill) => String(skill || "").trim());
    const experienceHasContent = Array.isArray(experience)
      ? experience.some(
          (item) =>
            typeof item === "string"
              ? String(item || "").trim()
              : String(item?.jobTitle || "").trim() || String(item?.description || "").trim(),
        )
      : String(experience || "").trim();

    return Boolean(String(currentSummary || "").trim() || normalizedSkills.length || experienceHasContent);
  }, [currentSummary, experience, skills]);

  useEffect(() => {
    if (!summaries.length) {
      return;
    }

    const matchedSummary = summaries.find((option) => option.summary === currentSummary);
    if (matchedSummary) {
      setSelectedSummaryId(matchedSummary.id);
    }
  }, [currentSummary, summaries]);

  const runGeneration = async () => {
    if (isLoading) {
      return;
    }

    if (!hasInputData) {
      const message = "Add a summary, skills, or experience to generate stronger summaries.";
      setPanelError(message);
      onError?.(message);
      return;
    }

    setIsLoading(true);
    setPanelError("");

    try {
      const nextSummaries = await generateSummaries({
        summary: currentSummary,
        skills,
        experience,
      });

      setSummaries(nextSummaries);
      setSelectedSummaryId(nextSummaries[0]?.id || "");
    } catch (error) {
      console.error("Validation failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseSummary = (option) => {
    setSelectedSummaryId(option.id);
    onApplySummary?.(option.summary, {
      optimized: false,
      jobDescription: "",
    });
    onSuccess?.("Summary version applied.");
  };

  return (
    <div className="dashboard-subcard mt-5 rounded-[1.5rem] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Summary Rewrite</h3>
          <p className="mt-1 text-sm text-white/[0.58]">
            Generate three concise summary options from your current summary, skills, and experience.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runGeneration}
            disabled={isLoading}
            className="premium-secondary-action rounded-2xl px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Generating..." : "Generate 3 versions"}
          </button>
          <button
            type="button"
            onClick={runGeneration}
            disabled={isLoading || !summaries.length}
            className="premium-secondary-action rounded-2xl px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            Regenerate
          </button>
        </div>
      </div>

      {panelError ? <p className="mt-3 text-sm text-rose-200">{panelError}</p> : null}

      {summaries.length ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {summaries.map((option) => (
            <SummaryOptionCard
              key={option.id}
              option={option}
              selected={selectedSummaryId === option.id}
              onSelect={() => setSelectedSummaryId(option.id)}
              onUse={() => handleUseSummary(option)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.04] p-4 text-sm text-white/[0.56]">
          Generate summaries to compare a general, results-focused, and tools-focused option before applying one.
        </div>
      )}
    </div>
  );
}
