export type SummaryGenerationInput = {
  summary?: string;
  skills?: string[];
  experience?: unknown;
  jobDescription?: string;
};

export type SummaryOption = {
  id: "balanced" | "impact" | "technical";
  label: string;
  tone: string;
  optimized: boolean;
  summary: string;
  keywordsUsed: string[];
};

const SUMMARY_VERSION_MAP = {
  balanced: {
    label: "Version 1: Balanced",
    tone: "General ATS-ready summary",
  },
  impact: {
    label: "Version 2: Impact-driven",
    tone: "Results-oriented summary",
  },
  technical: {
    label: "Version 3: Technical",
    tone: "Tools and skills focused",
  },
} as const;

function parseErrorMessage(payload: any) {
  if (payload?.error) {
    return payload.error;
  }

  if (payload?.detail) {
    return payload.detail;
  }

  if (payload?.message) {
    return payload.message;
  }

  return "Could not generate summary versions.";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Summary response field "${fieldName}" is invalid.`);
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeSummaryOption(option: any, expectedId: string) {
  const summary = normalizeText(option?.summary);
  if (!summary) {
    throw new Error(`Summary response returned an empty "${expectedId}" summary.`);
  }

  return {
    id: expectedId,
    label: normalizeText(option?.label) || SUMMARY_VERSION_MAP[expectedId as keyof typeof SUMMARY_VERSION_MAP]?.label || expectedId,
    tone: normalizeText(option?.tone) || SUMMARY_VERSION_MAP[expectedId as keyof typeof SUMMARY_VERSION_MAP]?.tone || "",
    optimized: Boolean(option?.optimized),
    summary,
    keywordsUsed: Array.isArray(option?.keywordsUsed)
      ? normalizeStringArray(option.keywordsUsed, `${expectedId}.keywordsUsed`)
      : [],
  } as SummaryOption;
}

function normalizeSummaryResponse(payload: any) {
  const summaries =
    Array.isArray(payload?.summaries) && payload.summaries.length === 3
      ? payload.summaries
      : typeof payload?.general === "string" &&
          typeof payload?.results === "string" &&
          typeof payload?.tools === "string"
        ? [
            { id: "balanced", summary: payload.general, optimized: Boolean(payload?.optimized) },
            { id: "impact", summary: payload.results, optimized: Boolean(payload?.optimized) },
            { id: "technical", summary: payload.tools, optimized: Boolean(payload?.optimized) },
          ]
        : null;

  if (!summaries || summaries.length !== 3) {
    throw new Error("Summary response must include exactly 3 versions.");
  }

  return [
    normalizeSummaryOption(summaries[0], "balanced"),
    normalizeSummaryOption(summaries[1], "impact"),
    normalizeSummaryOption(summaries[2], "technical"),
  ];
}

function deriveJobTitleFromExperience(experience: unknown) {
  if (!Array.isArray(experience)) {
    return "";
  }

  const firstMatch = experience.find(
    (item) => typeof item === "object" && item && typeof item.jobTitle === "string" && item.jobTitle.trim(),
  );

  return typeof firstMatch?.jobTitle === "string" ? firstMatch.jobTitle.trim() : "";
}

export async function generateSummaries(payload: SummaryGenerationInput): Promise<SummaryOption[]> {
  const requestPayload = {
    summary: payload?.summary || "",
    skills: Array.isArray(payload?.skills) ? payload.skills : [],
    experience: payload?.experience ?? [],
    jobDescription: payload?.jobDescription || "",
    jobTitle: deriveJobTitleFromExperience(payload?.experience),
  };

  console.log("Sending request to GPT...");
  console.log("Payload:", requestPayload);

  const response = await fetch("/api/generate-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestPayload),
  });

  const data = await response.json().catch(() => null);
  console.log("API Response:", data);

  if (!response.ok) {
    throw new Error(parseErrorMessage(data));
  }

  return normalizeSummaryResponse(data);
}

export const generateProfessionalSummaries = generateSummaries;
