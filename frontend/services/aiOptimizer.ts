import { ACTION_VERBS, extractJobKeywords, getResumeKeywordCoverage, getResumeTechnologyKeywords } from "@/utils/atsScore";
import { hasText, splitLines, uniqueStrings } from "@/lib/resumeBuilder";

function delay(ms = 700) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function capitalize(value = "") {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeSentence(value = "") {
  const trimmedValue = String(value || "").trim().replace(/\s+/g, " ");

  if (!trimmedValue) {
    return "";
  }

  return /[.!?]$/.test(trimmedValue) ? trimmedValue : `${trimmedValue}.`;
}

function startsWithActionVerb(value = "") {
  return ACTION_VERBS.some((verb) => value.toLowerCase().startsWith(verb.toLowerCase()));
}

function buildSummary({
  currentSummary,
  jobTitle,
  resumeSkills,
  prioritizedKeywords,
  mode,
}: {
  currentSummary: string;
  jobTitle: string;
  resumeSkills: string[];
  prioritizedKeywords: string[];
  mode: "job-optimize" | "rewrite";
}) {
  const roleLabel = jobTitle || "the target role";
  const skillList = uniqueStrings([...resumeSkills, ...prioritizedKeywords]).slice(0, 4);
  const existingLead = currentSummary
    ? currentSummary.replace(/\s+/g, " ").trim().replace(/\.$/, "")
    : "Results-driven professional with experience delivering measurable business outcomes";
  const summary =
    mode === "job-optimize"
      ? `${existingLead}. Targets ${roleLabel} opportunities with strength in ${skillList.join(
          ", ",
        )}. Communicates clear, role-aligned value supported by relevant experience and priorities.`
      : `${existingLead}. Highlights ${skillList.join(", ")} with clearer, stronger wording for day-to-day impact. Keeps the profile concise, specific, and easier to scan.`;

  return summary.slice(0, 420);
}

function improveBulletLine({
  line,
  keyword,
  lineIndex,
}: {
  line: string;
  keyword: string;
  lineIndex: number;
}) {
  const cleanedLine = String(line || "")
    .replace(/^[\s\u2022*-]+/, "")
    .trim()
    .replace(/\.$/, "");

  if (!cleanedLine) {
    return "";
  }

  const actionVerb = ACTION_VERBS[lineIndex % ACTION_VERBS.length];
  const baseSentence = startsWithActionVerb(cleanedLine)
    ? cleanedLine
    : `${actionVerb} ${cleanedLine.charAt(0).toLowerCase()}${cleanedLine.slice(1)}`;
  const keywordClause =
    keyword && !baseSentence.toLowerCase().includes(keyword.toLowerCase()) ? ` while supporting ${keyword}` : "";
  const impactClause = /\d/.test(baseSentence)
    ? ""
    : " to improve delivery quality, collaboration, and measurable impact";

  return normalizeSentence(`${capitalize(baseSentence)}${keywordClause}${impactClause}`);
}

function buildExperienceSuggestions(experience = [], missingKeywords: string[] = []) {
  return experience
    .map((item: any, index: number) => {
      const lines = splitLines(item?.description || "");

      if (!lines.length) {
        return null;
      }

      const optimizedLines = lines.map((line, lineIndex) =>
        improveBulletLine({
          line,
          keyword: missingKeywords[(index + lineIndex) % Math.max(missingKeywords.length, 1)] || "",
          lineIndex,
        }),
      );

      return {
        index,
        title: item?.jobTitle || `Experience ${index + 1}`,
        company: item?.companyName || "",
        before: lines.join("\n"),
        after: optimizedLines.join("\n"),
      };
    })
    .filter(Boolean);
}

function buildSkillSuggestions(resumeData: any, keywords: string[]) {
  const currentSkills = getResumeTechnologyKeywords(resumeData);
  const suggestedSkills = uniqueStrings([...currentSkills, ...keywords]).slice(0, 12);

  return {
    current: uniqueStrings(currentSkills),
    suggested: suggestedSkills,
    newSkills: suggestedSkills.filter((skill) => !currentSkills.some((currentSkill) => currentSkill.toLowerCase() === skill.toLowerCase())),
  };
}

export async function optimizeResumeForJob({
  resumeData,
  jobDescription,
  jobTitle = "",
}: {
  resumeData: any;
  jobDescription: string;
  jobTitle?: string;
}) {
  await delay();

  const mode = hasText(jobDescription) ? "job-optimize" : "rewrite";
  const keywords = hasText(jobDescription)
    ? extractJobKeywords(jobDescription, 10)
    : getResumeTechnologyKeywords(resumeData).slice(0, 10);
  const coverage = hasText(jobDescription)
    ? getResumeKeywordCoverage(resumeData, jobDescription)
    : { missingKeywords: [], matchedKeywords: keywords };
  const resumeSkills = getResumeTechnologyKeywords(resumeData);
  const prioritizedKeywords =
    mode === "job-optimize"
      ? uniqueStrings([...coverage.missingKeywords, ...keywords]).slice(0, 6)
      : uniqueStrings([...(resumeSkills || []), ...keywords]).slice(0, 6);
  const summaryAfter = buildSummary({
    currentSummary: resumeData?.summary || "",
    jobTitle: jobTitle || resumeData?.experience?.[0]?.jobTitle || "",
    resumeSkills,
    prioritizedKeywords,
    mode,
  });

  return {
    mode,
    jobTitle,
    jobDescription,
    keywords,
    summary: {
      before: resumeData?.summary || "",
      after: summaryAfter,
    },
    skills: buildSkillSuggestions(resumeData, prioritizedKeywords),
    experience: buildExperienceSuggestions(resumeData?.experience || [], prioritizedKeywords),
  };
}
