"use client";

import { splitCsv, splitLines, uniqueStrings } from "./resumeBuilder";

export const MAX_RESUME_COMPRESSION_LEVEL = 3;

const COMPRESSION_SETTINGS = [
  {
    label: "Standard fit",
    maxSummaryWords: 28,
    maxExperienceBullets: 4,
    maxProjectBullets: 3,
    maxCustomBullets: 4,
    maxBulletWords: 14,
    maxSkills: 18,
  },
  {
    label: "Compact fit",
    maxSummaryWords: 24,
    maxExperienceBullets: 4,
    maxProjectBullets: 3,
    maxCustomBullets: 3,
    maxBulletWords: 13,
    maxSkills: 16,
  },
  {
    label: "Aggressive fit",
    maxSummaryWords: 20,
    maxExperienceBullets: 3,
    maxProjectBullets: 2,
    maxCustomBullets: 3,
    maxBulletWords: 12,
    maxSkills: 14,
  },
  {
    label: "Max fit",
    maxSummaryWords: 18,
    maxExperienceBullets: 2,
    maxProjectBullets: 2,
    maxCustomBullets: 2,
    maxBulletWords: 12,
    maxSkills: 12,
  },
];

const FILLER_PATTERNS = [
  /\b(motivated|hardworking|passionate|dedicated|dynamic|enthusiastic|results-driven|detail-oriented)\b/gi,
  /\b(team player|self-starter|go-getter|fast learner|problem solver)\b/gi,
  /\b(responsible for|worked on|helped|assisted with|involved in|tasked with|participated in)\b/gi,
  /\b(successfully|effectively|efficiently|various|multiple|several|very|highly)\b/gi,
  /\b(in order to|as well as|with the goal of|on a daily basis)\b/gi,
];

const SOFT_SKILL_PATTERNS = [
  /^teamwork$/i,
  /^team player$/i,
  /^problem solving$/i,
  /^communication$/i,
  /^leadership$/i,
  /^adaptability$/i,
  /^hardworking$/i,
  /^motivated$/i,
  /^dedicated$/i,
  /^collaboration$/i,
  /^time management$/i,
  /^critical thinking$/i,
];

const HARD_SKILL_KEYWORDS = [
  "javascript",
  "typescript",
  "react",
  "next.js",
  "nextjs",
  "node.js",
  "nodejs",
  "node",
  "python",
  "sql",
  "mysql",
  "postgresql",
  "postgres",
  "mongodb",
  "html",
  "css",
  "tailwind",
  "bootstrap",
  "sass",
  "redux",
  "graphql",
  "rest api",
  "api",
  "git",
  "github",
  "docker",
  "kubernetes",
  "aws",
  "azure",
  "gcp",
  "java",
  "c++",
  "c#",
  ".net",
  "php",
  "laravel",
  "django",
  "flask",
  "spring",
  "express",
  "linux",
  "firebase",
  "figma",
  "power bi",
  "tableau",
  "excel",
  "pandas",
  "numpy",
  "machine learning",
  "data analysis",
  "data visualization",
  "ui/ux",
  "responsive design",
  "testing",
  "jest",
  "cypress",
  "playwright",
  "photoshop",
];

const ROLE_HINTS = [
  { keywords: ["react", "javascript", "typescript", "html", "css", "tailwind", "next.js"], role: "Frontend developer" },
  { keywords: ["node", "express", "api", "postgresql", "mongodb", "sql"], role: "Full-stack developer" },
  { keywords: ["python", "pandas", "numpy", "machine learning", "data analysis", "sql"], role: "Data-focused developer" },
];

function getCompressionIndex(level = 0) {
  return Math.max(0, Math.min(level, MAX_RESUME_COMPRESSION_LEVEL));
}

function cleanSpacing(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function stripFiller(text = "") {
  let nextText = String(text || "");

  FILLER_PATTERNS.forEach((pattern) => {
    nextText = nextText.replace(pattern, " ");
  });

  return cleanSpacing(nextText);
}

function finalizeText(text = "") {
  return cleanSpacing(
    String(text || "")
      .replace(/^[,.;:!?\-\u2022|/]+/, "")
      .replace(/[,.;:!?\-|/]+$/, ""),
  );
}

function trimToWordLimit(text = "", maxWords = 14) {
  const words = cleanSpacing(text).split(" ").filter(Boolean);

  if (words.length <= maxWords) {
    return finalizeText(words.join(" "));
  }

  return finalizeText(words.slice(0, maxWords).join(" "));
}

function scoreFragment(fragment = "") {
  let score = 0;

  if (/\d|%/.test(fragment)) {
    score += 4;
  }

  if (/\b(led|built|created|designed|developed|implemented|improved|increased|reduced|launched|optimized|automated|analyzed|delivered|managed|scaled)\b/i.test(fragment)) {
    score += 3;
  }

  score += Math.min(fragment.split(" ").filter(Boolean).length, 12) / 12;
  return score;
}

function pickBestFragment(text = "") {
  const fragments = String(text || "")
    .split(/[;:](?=\s|$)|\s[\-\u2013]\s/)
    .map((fragment) => finalizeText(fragment))
    .filter(Boolean);

  if (fragments.length <= 1) {
    return finalizeText(text);
  }

  return fragments.sort((left, right) => scoreFragment(right) - scoreFragment(left))[0];
}

function compressBullet(text = "", maxWords = 14) {
  const cleanedText = stripFiller(text)
    .replace(/\b(our|my|we)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return trimToWordLimit(pickBestFragment(cleanedText), maxWords);
}

function compressSummary(summary = "", maxWords = 30) {
  const cleanedText = stripFiller(summary);

  if (!cleanedText) {
    return "";
  }

  const sentences = cleanedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => finalizeText(sentence))
    .filter(Boolean);

  const limitedSentences = [];
  let currentWordCount = 0;

  sentences.forEach((sentence) => {
    const sentenceWordCount = sentence.split(" ").filter(Boolean).length;

    if (limitedSentences.length >= 2 || currentWordCount + sentenceWordCount > maxWords) {
      return;
    }

    limitedSentences.push(sentence);
    currentWordCount += sentenceWordCount;
  });

  const summaryText = limitedSentences.join(" ") || cleanedText;
  return trimToWordLimit(summaryText, maxWords);
}

function normalizeSkillName(skill = "") {
  return cleanSpacing(String(skill || "").replace(/[|/]+/g, " / "));
}

function isSoftSkill(skill = "") {
  return SOFT_SKILL_PATTERNS.some((pattern) => pattern.test(skill.trim()));
}

function looksLikeHardSkill(skill = "") {
  const normalizedSkill = skill.trim();
  const lowerSkill = normalizedSkill.toLowerCase();

  if (!normalizedSkill || isSoftSkill(normalizedSkill)) {
    return false;
  }

  if (HARD_SKILL_KEYWORDS.some((keyword) => lowerSkill.includes(keyword))) {
    return true;
  }

  if (/[+#./0-9]/.test(normalizedSkill)) {
    return true;
  }

  if (/\b(js|ts|sql|api|qa|ui|ux)\b/i.test(normalizedSkill)) {
    return true;
  }

  if (/\b(development|developer|design|analysis|testing|database|framework|library|cloud)\b/i.test(normalizedSkill)) {
    return true;
  }

  return false;
}

function sanitizeSkills(skills = [], maxItems = 18) {
  return uniqueStrings(skills.map((item) => normalizeSkillName(item?.name || item || "")))
    .filter(Boolean)
    .filter((skill) => !isSoftSkill(skill))
    .filter((skill) => looksLikeHardSkill(skill))
    .slice(0, maxItems);
}

function inferRole(skills = [], experience = []) {
  const firstRole = String(experience?.find((item) => item?.jobTitle?.trim())?.jobTitle || "").trim();

  if (firstRole) {
    return firstRole;
  }

  const lowerSkills = skills.map((skill) => skill.toLowerCase());
  const matchedRole = ROLE_HINTS.find((hint) => hint.keywords.some((keyword) => lowerSkills.some((skill) => skill.includes(keyword))));

  return matchedRole?.role || "Developer";
}

function inferFocus(summary = "", experience = [], projects = []) {
  const content = [summary, ...experience.map((item) => item?.description || ""), ...projects.map((item) => item?.description || "")]
    .join(" ")
    .toLowerCase();

  if (content.includes("performance")) {
    return "performance optimization and scalable solutions";
  }

  if (content.includes("api")) {
    return "API integration and reliable application delivery";
  }

  if (content.includes("data")) {
    return "data-driven features and maintainable workflows";
  }

  if (content.includes("design") || content.includes("ui") || content.includes("ux")) {
    return "responsive interfaces and maintainable user experiences";
  }

  return "maintainable, scalable applications";
}

function buildRoleFirstSummary(resumeData = {}, maxWords = 30) {
  const hardSkills = sanitizeSkills(resumeData?.skills || [], 3);
  const role = inferRole(hardSkills, resumeData?.experience || []);
  const focus = inferFocus(resumeData?.summary || "", resumeData?.experience || [], resumeData?.projects || []);
  const skillText = hardSkills.length ? ` using ${hardSkills.join(", ")}` : "";
  const summary = `${role} with experience building web applications${skillText}. Focused on ${focus}.`;

  return trimToWordLimit(summary, maxWords);
}

function compressLineBlock(text = "", { maxItems = 4, maxWords = 14 } = {}) {
  return splitLines(text)
    .map((line) => compressBullet(line, maxWords))
    .filter(Boolean)
    .slice(0, maxItems)
    .join("\n");
}

function compressInlineCsv(text = "", maxItems = 8) {
  return uniqueStrings(splitCsv(text))
    .map((item) => normalizeSkillName(item))
    .filter(Boolean)
    .filter((item) => looksLikeHardSkill(item))
    .slice(0, maxItems)
    .join(", ");
}

export function getResumeCompressionSettings(level = 0) {
  return COMPRESSION_SETTINGS[getCompressionIndex(level)];
}

export function compressResumeData(resumeData = {}, options = {}) {
  const settings = getResumeCompressionSettings(options.level);
  const skills = sanitizeSkills(resumeData?.skills || [], settings.maxSkills);

  return {
    ...resumeData,
    // Keep the summary verbatim so preview/PDF always match the form input.
    summary: typeof resumeData?.summary === "string" ? resumeData.summary : "",
    experience: (resumeData?.experience || []).map((item) => ({
      ...item,
      description: compressLineBlock(item?.description || "", {
        maxItems: settings.maxExperienceBullets,
        maxWords: settings.maxBulletWords,
      }),
    })),
    projects: (resumeData?.projects || []).map((item) => ({
      ...item,
      description: compressLineBlock(item?.description || "", {
        maxItems: settings.maxProjectBullets,
        maxWords: settings.maxBulletWords,
      }),
      technologies: compressInlineCsv(item?.technologies || "", 5),
    })),
    skills: skills.map((name) => ({ name })),
    customSections: (resumeData?.customSections || []).map((section) => ({
      ...section,
      content: compressLineBlock(section?.content || "", {
        maxItems: settings.maxCustomBullets,
        maxWords: settings.maxBulletWords,
      }),
    })),
  };
}
