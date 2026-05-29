"use client";

import { useMemo } from "react";

import SectionHeader from "@/components/SectionHeader";
import SkillGapDashboard from "@/components/skill-gap/SkillGapDashboard";
import { useGlobalState } from "../GlobalStateProvider";
const PRIORITY_LEVELS = ["HIGH", "MEDIUM", "LOW"];
const DEFAULT_SKILL_MATCH_THRESHOLD = 0.6;
const SKILL_TOKEN_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "using",
  "use",
  "with",
  "experience",
  "experienced",
  "knowledge",
  "proficiency",
  "proficient",
  "hands",
  "handson",
  "plus",
  "skill",
  "skills",
]);
const RAW_CANONICAL_SKILL_MAP = {
  tensorflow: "ml frameworks",
  pytorch: "ml frameworks",
  "scikit-learn": "ml frameworks",
  "scikit learn": "ml frameworks",
  sklearn: "ml frameworks",
  keras: "ml frameworks",
  "ml frameworks": "ml frameworks",
  "machine learning frameworks": "ml frameworks",
  docker: "containerization",
  containers: "containerization",
  containerization: "containerization",
  kubernetes: "container orchestration",
  k8s: "container orchestration",
  "container orchestration": "container orchestration",
  aws: "cloud platforms",
  "amazon web services": "cloud platforms",
  gcp: "cloud platforms",
  "google cloud": "cloud platforms",
  "google cloud platform": "cloud platforms",
  azure: "cloud platforms",
  "microsoft azure": "cloud platforms",
  "cloud platforms": "cloud platforms",
  "cloud platform": "cloud platforms",
  sql: "databases",
  mysql: "databases",
  postgres: "databases",
  postgresql: "databases",
  sqlite: "databases",
  "sql server": "databases",
  mssql: "databases",
  oracle: "databases",
  databases: "databases",
  "problem solving": "problem solving",
  "problem-solving": "problem solving",
  communication: "communication",
  collaboration: "collaboration",
  teamwork: "collaboration",
  "team work": "collaboration",
  "ci/cd": "cicd pipelines",
  "ci cd": "cicd pipelines",
  "ci/cd pipelines": "cicd pipelines",
  "ci cd pipelines": "cicd pipelines",
  cicd: "cicd pipelines",
  "cicd pipelines": "cicd pipelines",
  "continuous integration": "cicd pipelines",
  "continuous delivery": "cicd pipelines",
  "continuous deployment": "cicd pipelines",
};

function normalizeExperienceLevel(value) {
  if (value === "Beginner") {
    return "Entry-Level";
  }

  return value || "";
}

function normalizeComparableValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSkillValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[–—]/g, " ")
    .replace(/\//g, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_SKILL_MAP = Object.fromEntries(
  Object.entries(RAW_CANONICAL_SKILL_MAP).map(([alias, canonical]) => [
    normalizeSkillValue(alias),
    normalizeSkillValue(canonical),
  ]),
);

const CANONICAL_ALIAS_ITEMS = Object.entries(CANONICAL_SKILL_MAP).sort((left, right) => {
  const [leftAlias] = left;
  const [rightAlias] = right;

  return (
    rightAlias.split(" ").length - leftAlias.split(" ").length ||
    rightAlias.length - leftAlias.length
  );
});

function tokenizeSkillValue(value) {
  const normalized = normalizeSkillValue(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .filter((token) => token && !SKILL_TOKEN_STOPWORDS.has(token));
}

function canonicalizeSkill(value) {
  const normalized = normalizeSkillValue(value);
  if (!normalized) {
    return "";
  }

  const directMatch = CANONICAL_SKILL_MAP[normalized];
  if (directMatch) {
    return directMatch;
  }

  const tokens = new Set(tokenizeSkillValue(normalized));
  if (!tokens.size) {
    return normalized;
  }

  for (const [alias, canonical] of CANONICAL_ALIAS_ITEMS) {
    const aliasTokens = alias.split(" ").filter(Boolean);
    if (aliasTokens.length && aliasTokens.every((token) => tokens.has(token))) {
      return canonical;
    }
  }

  return normalized;
}

function describeSkill(skill) {
  const normalized = normalizeSkillValue(skill);
  const semanticKey = canonicalizeSkill(normalized) || normalized;

  return {
    normalized,
    semanticKey,
    tokens: tokenizeSkillValue(normalized),
  };
}

function choosePreferredSkillLabel(currentLabel, candidateLabel, semanticKey) {
  const currentNormalized = normalizeSkillValue(currentLabel);
  const candidateNormalized = normalizeSkillValue(candidateLabel);

  if (!currentNormalized) {
    return candidateNormalized;
  }

  if (!candidateNormalized) {
    return currentNormalized;
  }

  if (currentNormalized === semanticKey && candidateNormalized !== semanticKey) {
    return currentNormalized;
  }

  if (candidateNormalized === semanticKey && currentNormalized !== semanticKey) {
    return candidateNormalized;
  }

  if (candidateNormalized.length < currentNormalized.length) {
    return candidateNormalized;
  }

  return currentNormalized;
}

function keywordOverlapScore(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);

  if (!left.size || !right.size) {
    return 0;
  }

  const overlap = [...left].filter((token) => right.has(token));
  if (!overlap.length) {
    return 0;
  }

  return overlap.length / Math.min(left.size, right.size);
}

function fuzzySubstringScore(left, right) {
  if (!left || !right) {
    return 0;
  }

  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }

  return 0;
}

function sequenceSimilarity(left, right) {
  if (!left || !right) {
    return 0;
  }

  const longer = left.length >= right.length ? left : right;
  const shorter = left.length >= right.length ? right : left;
  const rows = longer.length + 1;
  const cols = shorter.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    table[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    table[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = longer[row - 1] === shorter[col - 1] ? 0 : 1;
      table[row][col] = Math.min(
        table[row - 1][col] + 1,
        table[row][col - 1] + 1,
        table[row - 1][col - 1] + substitutionCost,
      );
    }
  }

  const distance = table[rows - 1][cols - 1];
  return 1 - distance / Math.max(longer.length, shorter.length);
}

function skillSimilarity(userSkill, requiredSkill) {
  const userDescriptor = describeSkill(userSkill);
  const requiredDescriptor = describeSkill(requiredSkill);

  if (!userDescriptor.normalized || !requiredDescriptor.normalized) {
    return 0;
  }

  if (userDescriptor.normalized === requiredDescriptor.normalized) {
    return 1;
  }

  if (userDescriptor.semanticKey === requiredDescriptor.semanticKey) {
    return 1;
  }

  const normalizedScore = fuzzySubstringScore(
    userDescriptor.normalized,
    requiredDescriptor.normalized,
  );
  const canonicalScore = fuzzySubstringScore(
    userDescriptor.semanticKey,
    requiredDescriptor.semanticKey,
  );
  const overlapScore = keywordOverlapScore(
    userDescriptor.tokens,
    requiredDescriptor.tokens,
  );

  let sequenceScore = 0;
  if (overlapScore > 0 || normalizedScore > 0 || canonicalScore > 0) {
    sequenceScore = Math.max(
      sequenceSimilarity(userDescriptor.normalized, requiredDescriptor.normalized),
      sequenceSimilarity(userDescriptor.semanticKey, requiredDescriptor.semanticKey),
    );
  }

  return Math.max(normalizedScore, canonicalScore, overlapScore, sequenceScore);
}

function skillsMatch(userSkill, requiredSkill) {
  return skillSimilarity(userSkill, requiredSkill) >= DEFAULT_SKILL_MATCH_THRESHOLD;
}

function matchesAnySkill(skills, requiredSkill) {
  return normalizeSkillList(skills).some((candidate) => skillsMatch(candidate, requiredSkill));
}

function parseSkills(value) {
  const deduped = new Map();

  String(value || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean)
    .forEach((skill) => {
      const descriptor = describeSkill(skill);
      if (!descriptor.normalized) {
        return;
      }

      if (!deduped.has(descriptor.semanticKey)) {
        deduped.set(descriptor.semanticKey, descriptor.normalized);
        return;
      }

      deduped.set(
        descriptor.semanticKey,
        choosePreferredSkillLabel(
          deduped.get(descriptor.semanticKey),
          descriptor.normalized,
          descriptor.semanticKey,
        ),
      );
    });

  return Array.from(deduped.values());
}

function normalizeSkillList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map();
  value.forEach((skill) => {
    const descriptor = describeSkill(skill);
    if (!descriptor.normalized) {
      return;
    }

    if (!deduped.has(descriptor.semanticKey)) {
      deduped.set(descriptor.semanticKey, descriptor.normalized);
      return;
    }

    deduped.set(
      descriptor.semanticKey,
      choosePreferredSkillLabel(
        deduped.get(descriptor.semanticKey),
        descriptor.normalized,
        descriptor.semanticKey,
      ),
    );
  });

  return Array.from(deduped.values());
}

function createSkillKeySet(skills) {
  return new Set(normalizeSkillList(skills).map((skill) => describeSkill(skill).semanticKey));
}

function haveSkillsChanged(currentSkills, previousSkills) {
  const currentKeys = createSkillKeySet(currentSkills);
  const previousKeys = createSkillKeySet(previousSkills);

  if (currentKeys.size !== previousKeys.size) {
    return true;
  }

  return [...currentKeys].some((skill) => !previousKeys.has(skill));
}

function getNewlyAddedSkills(currentSkills, previousSkills) {
  const current = normalizeSkillList(currentSkills);
  const previousKeys = createSkillKeySet(previousSkills);

  return current.filter((skill) => !previousKeys.has(describeSkill(skill).semanticKey));
}

function sanitizeDesiredJobTitle(value) {
  return String(value || "").split(".")[0].split(",")[0].trim().slice(0, 50);
}

function normalizeByLevel(payload) {
  return {
    HIGH: normalizeSkillList(payload?.HIGH || payload?.high),
    MEDIUM: normalizeSkillList(payload?.MEDIUM || payload?.medium),
    LOW: normalizeSkillList(payload?.LOW || payload?.low),
  };
}

function flattenByLevel(skillsByLevel) {
  return PRIORITY_LEVELS.flatMap((level) => normalizeSkillList(skillsByLevel?.[level]));
}

function countMissingSkills(missingByLevel) {
  return PRIORITY_LEVELS.reduce((total, level) => total + (missingByLevel?.[level]?.length || 0), 0);
}

function getHighestPriorityLevel(missingByLevel) {
  return PRIORITY_LEVELS.find((level) => (missingByLevel?.[level] || []).length) || null;
}

function formatScoreDelta(value) {
  if (!Number.isFinite(value)) {
    return "No baseline";
  }

  if (value === 0) {
    return "0 pts";
  }

  const absolute = Math.abs(value);
  const formatted = Number.isInteger(absolute) ? absolute : absolute.toFixed(1);
  return `${value > 0 ? "+" : "-"}${formatted} pts`;
}

function createRoleInputSignature(form) {
  return JSON.stringify({
    education: normalizeComparableValue(form.education),
    experience_level: normalizeComparableValue(form.experience_level),
    desired_job_title: normalizeComparableValue(sanitizeDesiredJobTitle(form.desired_job_title)),
    target_role: normalizeComparableValue(form.target_role),
  });
}

function getAnalysisSourceLabel(source) {
  if (source === "local") {
    return "Local recomputation from saved required skills";
  }

  if (source === "database") {
    return "Saved required skills from the database";
  }

  return "Fresh GPT required skills";
}

function buildImprovementSummary(analysis) {
  const cleanedReason = String(analysis?.insights || "").trim();
  if (cleanedReason) {
    return cleanedReason;
  }

  if (analysis?.newlyAddedSkillsDetected?.length) {
    return `Great progress! You added relevant skills such as ${analysis.newlyAddedSkillsDetected.join(
      ", ",
    )}. This improves your alignment with the target role.`;
  }

  if (!analysis?.skillGap?.length) {
    return "Your profile currently covers the benchmark skills for this role.";
  }

  if (analysis?.source === "local") {
    return "The gap was recomputed locally from the last saved required skills benchmark.";
  }

  return "No significant skill improvements detected.";
}

function buildLocalAnalysis({
  requiredSkillsByLevel,
  currentSkills,
  previousSkills,
  previousScore,
  createdAt = null,
}) {
  const normalizedRequiredSkillsByLevel = normalizeByLevel(requiredSkillsByLevel);
  const requiredSkills = flattenByLevel(normalizedRequiredSkillsByLevel);
  const missingByLevel = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  const matchedSkills = [];

  PRIORITY_LEVELS.forEach((level) => {
    normalizedRequiredSkillsByLevel[level].forEach((skill) => {
      if (matchesAnySkill(currentSkills, skill)) {
        matchedSkills.push(skill);
      } else {
        missingByLevel[level].push(skill);
      }
    });
  });

  const missingSkills = flattenByLevel(missingByLevel);
  const newlyAddedSkills = getNewlyAddedSkills(currentSkills, previousSkills);
  const newlyAddedSkillsDetected = requiredSkills.filter((skill) =>
    matchesAnySkill(newlyAddedSkills, skill),
  );
  const score = requiredSkills.length
    ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
    : 0;
  const normalizedPreviousScore = Number.isFinite(previousScore) ? previousScore : null;

  return {
    score,
    source: "local",
    createdAt,
    requiredSkills,
    requiredSkillsByLevel: normalizedRequiredSkillsByLevel,
    missingByLevel,
    missingSkills,
    skillGap: missingSkills,
    matchedSkills,
    newlyAddedSkillsDetected,
    improvementDetected: newlyAddedSkillsDetected.length > 0,
    insights:
      newlyAddedSkillsDetected.length > 0
        ? `Great progress! You added new relevant skills such as ${newlyAddedSkillsDetected.join(
            ", ",
          )}. This improves your alignment with the target role.`
        : "No significant skill improvements detected.",
    previousScore: normalizedPreviousScore,
    scoreDelta: normalizedPreviousScore === null ? null : score - normalizedPreviousScore,
    skillsSnapshot: normalizeSkillList(currentSkills),
  };
}

function normalizeSemanticMatches(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const skill = normalizeSkillValue(entry.skill);
    if (!skill || seen.has(skill)) {
      return;
    }
    seen.add(skill);

    const matchedWith = normalizeSkillValue(entry.matched_with || entry.matchedWith || "");
    const similarityRaw = Number(entry.similarity);
    const similarity = Number.isFinite(similarityRaw) ? similarityRaw : 0;

    result.push({
      skill,
      matchedWith,
      similarity,
    });
  });

  return result;
}

function createAnalysisViewModel(payload) {
  const aiAnalysis = payload?.ai_analysis || {};
  const requiredSkillsByLevel = normalizeByLevel(
    payload?.required_skills_by_level || aiAnalysis?.required_skills_by_level,
  );
  const missingByLevel = normalizeByLevel(payload?.missing_by_level);
  const previousScore = Number(aiAnalysis?.previous_match_score);
  const scoreDelta = Number(aiAnalysis?.score_delta);
  const missingSkills = normalizeSkillList(
    payload?.missing_skills || payload?.skill_gap || flattenByLevel(missingByLevel),
  );

  const matchedSkills = normalizeSkillList(payload?.matched_skills || aiAnalysis?.matched_skills);
  const semanticMatches = normalizeSemanticMatches(
    payload?.semantic_matches || aiAnalysis?.semantic_matches,
  );
  const semanticSkillSet = new Set(semanticMatches.map((entry) => entry.skill));
  const exactMatchesRaw = normalizeSkillList(
    payload?.exact_matches || aiAnalysis?.exact_matches,
  );
  const exactMatches = exactMatchesRaw.length
    ? exactMatchesRaw.filter((skill) => !semanticSkillSet.has(skill))
    : matchedSkills.filter((skill) => !semanticSkillSet.has(skill));

  return {
    score: Number(payload?.score ?? aiAnalysis?.match_score ?? 0),
    source: payload?.source || (aiAnalysis?.cached ? "database" : "gpt"),
    createdAt: payload?.created_at || aiAnalysis?.created_at || null,
    requiredSkills: normalizeSkillList(payload?.required_skills || flattenByLevel(requiredSkillsByLevel)),
    requiredSkillsByLevel,
    missingByLevel,
    missingSkills,
    skillGap: missingSkills,
    matchedSkills,
    exactMatches,
    semanticMatches,
    newlyAddedSkillsDetected: normalizeSkillList(
      payload?.newly_added_skills_detected || aiAnalysis?.newly_added_skills_detected,
    ),
    improvementDetected: Boolean(
      payload?.improvement_detected ?? aiAnalysis?.improvement_detected,
    ),
    insights: String(aiAnalysis?.improvement_reason || "").trim(),
    previousScore: Number.isFinite(previousScore) ? previousScore : null,
    scoreDelta: Number.isFinite(scoreDelta) ? scoreDelta : null,
    skillsSnapshot: normalizeSkillList(payload?.skills_snapshot),
    missingByCategory: {
      technical: normalizeSkillList(aiAnalysis?.missing_skills?.technical),
      tools: normalizeSkillList(aiAnalysis?.missing_skills?.tools),
      soft: normalizeSkillList(aiAnalysis?.missing_skills?.soft),
    },
  };
}

export default function SkillGapPage() {
  const {
    userProfile,
    skillGapAnalysis,
    skillGapError,
    loadingContext: initializing,
    isRefreshingSkillGap: loading,
  } = useGlobalState();

  const analysis = useMemo(() => {
    console.log("Skill Gap Response:", skillGapAnalysis);
    if (!skillGapAnalysis) return null;
    try {
      return createAnalysisViewModel(skillGapAnalysis);
    } catch (error) {
      console.error("Error formatting skill gap analysis:", error);
      return null;
    }
  }, [skillGapAnalysis]);

  console.log("Current state:", analysis);

  return (
    <div>
      <SectionHeader
        title="Skill Gap Analysis"
        description="Your personalized skill gap results based on your target role and current skills. Edit your profile to recalculate."
      />

      {initializing ? (
        <p className="mt-5 text-sm text-slate-500">Loading your analysis...</p>
      ) : loading ? (
        <p className="mt-5 text-sm text-slate-500">Analyzing your profile...</p>
      ) : skillGapError ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Error:</strong> {skillGapError}
        </div>
      ) : !analysis ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Complete your profile (education, experience, and desired job title) to generate your skill gap analysis.
        </div>
      ) : (
        <div className="mt-6">
          <SkillGapDashboard analysis={analysis} userProfile={userProfile} />
        </div>
      )}
    </div>
  );
}
