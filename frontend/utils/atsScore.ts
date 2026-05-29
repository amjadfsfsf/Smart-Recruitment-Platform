import {
  DEFAULT_SECTION_ORDER,
  findCustomSectionData,
  getResumeCompletionIssues,
  getVisibleSections,
  hasText,
  splitCsv,
  splitLines,
} from "@/lib/resumeBuilder";

const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "by",
  "can",
  "collaborate",
  "company",
  "cross",
  "day",
  "deliver",
  "develop",
  "for",
  "from",
  "have",
  "help",
  "highly",
  "in",
  "into",
  "is",
  "it",
  "its",
  "job",
  "knowledge",
  "looking",
  "maintain",
  "must",
  "of",
  "on",
  "or",
  "our",
  "partner",
  "preferred",
  "role",
  "skills",
  "team",
  "that",
  "the",
  "their",
  "them",
  "this",
  "through",
  "to",
  "using",
  "we",
  "well",
  "will",
  "with",
  "work",
  "you",
  "your",
]);

const KNOWN_PHRASES = [
  "react",
  "next.js",
  "nextjs",
  "tailwind css",
  "tailwind",
  "typescript",
  "javascript",
  "node.js",
  "node",
  "express",
  "graphql",
  "rest api",
  "api design",
  "design systems",
  "responsive design",
  "accessibility",
  "performance optimization",
  "testing",
  "jest",
  "cypress",
  "playwright",
  "docker",
  "aws",
  "azure",
  "sql",
  "postgresql",
  "mongodb",
  "analytics",
  "leadership",
  "communication",
  "collaboration",
  "agile",
  "scrum",
  "ci/cd",
  "figma",
  "product",
  "stakeholder management",
  "frontend",
  "backend",
  "full stack",
];

export const ACTION_VERBS = [
  "Achieved",
  "Built",
  "Collaborated",
  "Created",
  "Delivered",
  "Designed",
  "Developed",
  "Drove",
  "Enhanced",
  "Executed",
  "Implemented",
  "Improved",
  "Increased",
  "Launched",
  "Led",
  "Managed",
  "Optimized",
  "Reduced",
  "Scaled",
  "Spearheaded",
  "Streamlined",
];

const IMPACT_TERMS = [
  "achieved",
  "boosted",
  "cut",
  "decreased",
  "delivered",
  "generated",
  "grew",
  "improved",
  "increased",
  "launched",
  "optimized",
  "reduced",
  "saved",
  "scaled",
  "streamlined",
];

const ATS_WEIGHTS = {
  keywords: 0.3,
  completeness: 0.25,
  formatting: 0.15,
  actionVerbs: 0.15,
  bulletQuality: 0.15,
};

const REQUIRED_SECTIONS = [
  { key: "summary", label: "Summary" },
  { key: "education", label: "Education" },
  { key: "experience", label: "Work Experience" },
  { key: "skills", label: "Skills" },
];

type BulletScore = {
  section: string;
  itemIndex: number;
  bulletIndex: number;
  text: string;
  reasons?: string[];
};

function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeToken(value = "") {
  return normalizeWhitespace(value).toLowerCase();
}

function getResumeSkills(resumeData: any) {
  return (resumeData?.skills || [])
    .map((item: { name?: string }) => normalizeWhitespace(item?.name || ""))
    .filter(Boolean);
}

function getVisibleSectionTypes(sections: any[] = []) {
  return new Set(getVisibleSections(sections).map((section: any) => section.type));
}

function getResumeBulletObjects(resumeData: any, sections: any[] = []) {
  const visibleTypes = getVisibleSectionTypes(sections);
  const bullets: BulletScore[] = [];

  if (visibleTypes.has("experience")) {
    bullets.push(
      ...(resumeData?.experience || []).flatMap((item: any, itemIndex: number) =>
        splitLines(item?.description || "").map((text, bulletIndex) => ({
          section: "Work Experience",
          itemIndex,
          bulletIndex,
          text,
        })),
      ),
    );
  }

  if (visibleTypes.has("projects")) {
    bullets.push(
      ...(resumeData?.projects || []).flatMap((item: any, itemIndex: number) =>
        splitLines(item?.description || "").map((text, bulletIndex) => ({
          section: "Projects",
          itemIndex,
          bulletIndex,
          text,
        })),
      ),
    );
  }

  getVisibleSections(sections)
    .filter((section: any) => section.type === "custom")
    .forEach((section: any) => {
      const customSection = findCustomSectionData(resumeData?.customSections || [], section.id);

      bullets.push(
        ...splitLines(customSection?.content || "").map((text, bulletIndex) => ({
          section: section.title || "Custom Section",
          itemIndex: 0,
          bulletIndex,
          text,
        })),
      );
    });

  return bullets;
}

function getResumeSearchText(resumeData: any) {
  const educationText = (resumeData?.education || [])
    .map((item: any) => [item?.universityName, item?.degree, item?.gpa].filter(Boolean).join(" "))
    .join(" ");
  const experienceText = (resumeData?.experience || [])
    .map((item: any) => [item?.jobTitle, item?.companyName, item?.description].filter(Boolean).join(" "))
    .join(" ");
  const projectText = (resumeData?.projects || [])
    .map((item: any) => [item?.name, item?.description, item?.technologies].filter(Boolean).join(" "))
    .join(" ");
  const certificationText = (resumeData?.certifications || [])
    .map((item: any) => [item?.name, item?.provider, item?.year].filter(Boolean).join(" "))
    .join(" ");
  const languageText = (resumeData?.languages || [])
    .map((item: any) => [item?.language, item?.level].filter(Boolean).join(" "))
    .join(" ");
  const customText = (resumeData?.customSections || [])
    .map((item: any) => item?.content || "")
    .filter(Boolean)
    .join(" ");

  return normalizeWhitespace(
    [
      resumeData?.summary,
      getResumeSkills(resumeData).join(" "),
      educationText,
      experienceText,
      projectText,
      certificationText,
      languageText,
      customText,
    ]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

function extractKeywordsFromText(text = "", weightBoost = 1) {
  const normalizedText = normalizeWhitespace(text).toLowerCase();
  const frequencies = new Map<string, number>();

  if (!normalizedText) {
    return frequencies;
  }

  for (const phrase of KNOWN_PHRASES) {
    const normalizedPhrase = phrase.toLowerCase();
    if (!normalizedText.includes(normalizedPhrase)) {
      continue;
    }

    const occurrences =
      normalizedText.match(new RegExp(normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length || 0;

    frequencies.set(phrase, (frequencies.get(phrase) || 0) + (occurrences + 1) * weightBoost);
  }

  const tokens = normalizedText.match(/[a-z0-9+#./-]{3,}/g) || [];

  tokens.forEach((token) => {
    if (STOPWORDS.has(token)) {
      return;
    }

    frequencies.set(token, (frequencies.get(token) || 0) + weightBoost);
  });

  return frequencies;
}

function mergeKeywordFrequencies(...maps: Map<string, number>[]) {
  const merged = new Map<string, number>();

  maps.forEach((map) => {
    map.forEach((value, key) => {
      merged.set(key, (merged.get(key) || 0) + value);
    });
  });

  return merged;
}

function extractTargetKeywords(jobTitle = "", jobDescription = "", limit = 12) {
  const jobTitleFrequency = extractKeywordsFromText(jobTitle, 3);
  const jobDescriptionFrequency = extractKeywordsFromText(jobDescription, 1);
  const frequencies = mergeKeywordFrequencies(jobTitleFrequency, jobDescriptionFrequency);

  return Array.from(frequencies.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return right[0].length - left[0].length;
    })
    .map(([keyword]) => keyword)
    .filter((keyword) => !STOPWORDS.has(keyword))
    .slice(0, limit);
}

export function extractJobKeywords(jobDescription = "", limit = 10) {
  return extractTargetKeywords("", jobDescription, limit);
}

function getKeywordScore(resumeData: any, jobTitle = "", jobDescription = "") {
  const keywords = extractTargetKeywords(jobTitle, jobDescription, 12);

  if (!keywords.length) {
    return {
      score: 0,
      keywords: [],
      matchedKeywords: [],
      missingKeywords: [],
      targetSource: "No job title or job description provided",
      explanation: "Add a target job title or job description to calculate keyword alignment.",
    };
  }

  const resumeText = getResumeSearchText(resumeData);
  const matchedKeywords = keywords.filter((keyword) => resumeText.includes(normalizeToken(keyword)));
  const missingKeywords = keywords.filter((keyword) => !resumeText.includes(normalizeToken(keyword)));
  const score = Math.round((matchedKeywords.length / keywords.length) * 100);

  return {
    score,
    keywords,
    matchedKeywords,
    missingKeywords,
    targetSource: jobDescription ? "Job title + job description" : "Job title",
    explanation: `${matchedKeywords.length} of ${keywords.length} target keywords were found in summary, skills, experience, projects, and other visible resume text.`,
  };
}

function isSummaryPresent(resumeData: any) {
  return hasText(resumeData?.summary);
}

function isEducationPresent(resumeData: any) {
  return (resumeData?.education || []).some((item: any) => hasText(item?.universityName) || hasText(item?.degree));
}

function isExperiencePresent(resumeData: any) {
  return (resumeData?.experience || []).some((item: any) => hasText(item?.jobTitle) || hasText(item?.description));
}

function areSkillsPresent(resumeData: any) {
  return getResumeSkills(resumeData).length > 0;
}

function getMissingSections(resumeData: any) {
  const statuses = [
    { key: "summary", label: "Summary", present: isSummaryPresent(resumeData) },
    { key: "education", label: "Education", present: isEducationPresent(resumeData) },
    { key: "experience", label: "Work Experience", present: isExperiencePresent(resumeData) },
    { key: "skills", label: "Skills", present: areSkillsPresent(resumeData) },
  ];

  return statuses.filter((section) => !section.present).map((section) => section.label);
}

function getCompletenessScore(resumeData: any, sections: any[] = [], personalSectionDeleted = false) {
  const completionIssues = getResumeCompletionIssues(resumeData, sections, {
    requirePersonalInfo: !personalSectionDeleted,
  });

  const requiredSections = REQUIRED_SECTIONS.map((section) => {
    if (section.key === "summary") {
      return { ...section, present: isSummaryPresent(resumeData) };
    }

    if (section.key === "education") {
      return { ...section, present: isEducationPresent(resumeData) };
    }

    if (section.key === "experience") {
      return { ...section, present: isExperiencePresent(resumeData) };
    }

    return { ...section, present: areSkillsPresent(resumeData) };
  });

  const existingSections = requiredSections.filter((section) => section.present).length;
  const score = Math.round((existingSections / requiredSections.length) * 100);

  return {
    score,
    completionIssues,
    missingSections: requiredSections.filter((section) => !section.present).map((section) => section.label),
    requiredSections,
    existingSections,
    totalSections: requiredSections.length,
  };
}

function buildFormattingChecks(resumeData: any, sections: any[] = [], personalSectionDeleted = false) {
  const visibleTypes = getVisibleSectionTypes(sections);
  const requiredFieldIssues: string[] = [];
  const invalidDateIssues: string[] = [];
  const weirdCharacterIssues: string[] = [];
  let checkedFieldCount = 0;

  const checkTextField = (label: string, value: any, required = true) => {
    const normalizedValue = String(value || "");

    if (required) {
      checkedFieldCount += 1;

      if (!hasText(normalizedValue)) {
        requiredFieldIssues.push(`${label} is empty.`);
        return;
      }
    }

    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/.test(normalizedValue)) {
      weirdCharacterIssues.push(`${label} contains unsupported characters.`);
    }
  };

  const checkMonthRange = (label: string, startDate: string, endDate: string, isPresent = false) => {
    if (!hasText(startDate)) {
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(startDate)) {
      invalidDateIssues.push(`${label} start date is invalid.`);
      return;
    }

    if (isPresent) {
      return;
    }

    if (!hasText(endDate)) {
      invalidDateIssues.push(`${label} end date is missing.`);
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(endDate)) {
      invalidDateIssues.push(`${label} end date is invalid.`);
      return;
    }

    if (endDate < startDate) {
      invalidDateIssues.push(`${label} end date is before the start date.`);
    }
  };

  const checkYearRange = (label: string, startYear: any, endYear: any) => {
    if (!hasText(startYear) || !hasText(endYear)) {
      return;
    }

    const normalizedStart = Number(startYear);
    const normalizedEnd = Number(endYear);

    if (Number.isNaN(normalizedStart) || Number.isNaN(normalizedEnd)) {
      invalidDateIssues.push(`${label} has an invalid year.`);
      return;
    }

    if (normalizedEnd < normalizedStart) {
      invalidDateIssues.push(`${label} end year is before the start year.`);
    }
  };

  if (!personalSectionDeleted) {
    checkTextField("Full name", resumeData?.personalInfo?.fullName);
    checkTextField("Email", resumeData?.personalInfo?.email);
    checkTextField("Phone", resumeData?.personalInfo?.phone);
  }

  if (visibleTypes.has("summary")) {
    checkTextField("Summary", resumeData?.summary);
  }

  if (visibleTypes.has("education")) {
    (resumeData?.education || []).forEach((item: any, index: number) => {
      const hasAnyContent = [item?.universityName, item?.degree, item?.gpa, item?.startYear, item?.endYear].some(hasText);

      if (!hasAnyContent) {
        return;
      }

      checkTextField(`Education ${index + 1} university`, item?.universityName);
      checkTextField(`Education ${index + 1} degree`, item?.degree);
      checkTextField(`Education ${index + 1} start year`, item?.startYear);
      checkTextField(`Education ${index + 1} end year`, item?.endYear);
      checkYearRange(`Education ${index + 1}`, item?.startYear, item?.endYear);
    });
  }

  if (visibleTypes.has("experience")) {
    (resumeData?.experience || []).forEach((item: any, index: number) => {
      const hasAnyContent = [item?.jobTitle, item?.companyName, item?.startDate, item?.endDate, item?.description].some(hasText);

      if (!hasAnyContent && !item?.isPresent) {
        return;
      }

      checkTextField(`Experience ${index + 1} job title`, item?.jobTitle);
      checkTextField(`Experience ${index + 1} company`, item?.companyName);
      checkTextField(`Experience ${index + 1} start date`, item?.startDate);

      if (!item?.isPresent) {
        checkTextField(`Experience ${index + 1} end date`, item?.endDate);
      }

      checkTextField(`Experience ${index + 1} description`, item?.description);
      checkMonthRange(`Experience ${index + 1}`, item?.startDate || "", item?.endDate || "", Boolean(item?.isPresent));
    });
  }

  if (visibleTypes.has("skills")) {
    (resumeData?.skills || []).forEach((item: any, index: number) => {
      if (!hasText(item?.name)) {
        checkedFieldCount += 1;
        requiredFieldIssues.push(`Skill ${index + 1} is empty.`);
        return;
      }

      checkTextField(`Skill ${index + 1}`, item?.name);
    });
  }

  if (visibleTypes.has("projects")) {
    (resumeData?.projects || []).forEach((item: any, index: number) => {
      const hasAnyContent = [item?.name, item?.technologies, item?.description].some(hasText);

      if (!hasAnyContent) {
        return;
      }

      checkTextField(`Project ${index + 1} name`, item?.name);
      checkTextField(`Project ${index + 1} technologies`, item?.technologies);
      checkTextField(`Project ${index + 1} description`, item?.description);
    });
  }

  if (visibleTypes.has("certifications")) {
    (resumeData?.certifications || []).forEach((item: any, index: number) => {
      const hasAnyContent = [item?.name, item?.provider, item?.year].some(hasText);

      if (!hasAnyContent) {
        return;
      }

      checkTextField(`Certification ${index + 1} name`, item?.name);
      checkTextField(`Certification ${index + 1} provider`, item?.provider);
      checkTextField(`Certification ${index + 1} year`, item?.year);
    });
  }

  if (visibleTypes.has("languages")) {
    (resumeData?.languages || []).forEach((item: any, index: number) => {
      const hasAnyContent = [item?.language, item?.level].some(hasText);

      if (!hasAnyContent) {
        return;
      }

      checkTextField(`Language ${index + 1}`, item?.language);
      checkTextField(`Language ${index + 1} level`, item?.level);
    });
  }

  return {
    checkedFieldCount,
    requiredFieldIssues,
    invalidDateIssues,
    weirdCharacterIssues,
  };
}

function getFormattingScore(resumeData: any, sections: any[] = [], personalSectionDeleted = false) {
  const formattingChecks = buildFormattingChecks(resumeData, sections, personalSectionDeleted);
  const emptyFieldPenalty = formattingChecks.requiredFieldIssues.length * 4;
  const invalidDatePenalty = formattingChecks.invalidDateIssues.length * 7;
  const weirdCharacterPenalty = formattingChecks.weirdCharacterIssues.length * 10;
  const score = Math.max(0, 100 - emptyFieldPenalty - invalidDatePenalty - weirdCharacterPenalty);

  return {
    score,
    ...formattingChecks,
    penalties: {
      emptyFieldPenalty,
      invalidDatePenalty,
      weirdCharacterPenalty,
      totalPenalty: emptyFieldPenalty + invalidDatePenalty + weirdCharacterPenalty,
    },
  };
}

function bulletStartsWithActionVerb(text = "") {
  const normalizedBullet = String(text || "").trim().replace(/^[-*•\d.)\s]+/, "");
  return ACTION_VERBS.some((verb) => normalizedBullet.toLowerCase().startsWith(verb.toLowerCase()));
}

function getActionVerbScore(resumeData: any, sections: any[] = []) {
  const bullets = getResumeBulletObjects(resumeData, sections);

  if (!bullets.length) {
    return {
      score: 0,
      bullets,
      strongBullets: [],
      weakBullets: [],
      explanation: "No bullets were found in visible experience, projects, or custom sections.",
    };
  }

  const strongBullets = bullets.filter((bullet) => bulletStartsWithActionVerb(bullet.text));
  const weakBullets = bullets
    .filter((bullet) => !bulletStartsWithActionVerb(bullet.text))
    .map((bullet) => ({
      ...bullet,
      reasons: ["Does not start with a strong action verb"],
    }));

  return {
    score: Math.round((strongBullets.length / bullets.length) * 100),
    bullets,
    strongBullets,
    weakBullets,
    explanation: `${strongBullets.length} of ${bullets.length} bullets begin with a strong action verb.`,
  };
}

function getBulletQualityScore(resumeData: any, sections: any[] = []) {
  const bullets = getResumeBulletObjects(resumeData, sections);

  if (!bullets.length) {
    return {
      score: 0,
      strongBulletCount: 0,
      bullets,
      weakBullets: [],
      explanation: "No bullets were found to evaluate for measurable impact.",
    };
  }

  const weakBullets = bullets
    .map((bullet) => {
      const wordCount = bullet.text.split(/\s+/).filter(Boolean).length;
      const hasMetric = /\d/.test(bullet.text) || /%/.test(bullet.text);
      const hasActionVerb = bulletStartsWithActionVerb(bullet.text);
      const hasImpactLanguage = IMPACT_TERMS.some((term) => bullet.text.toLowerCase().includes(term));
      const reasons: string[] = [];

      if (!hasMetric) {
        reasons.push("Missing a number or measurable metric");
      }
      if (!hasActionVerb) {
        reasons.push("Missing a strong action verb at the start");
      }
      if (!hasImpactLanguage) {
        reasons.push("Impact is unclear");
      }
      if (wordCount < 7) {
        reasons.push("Bullet is too short");
      }

      return {
        ...bullet,
        reasons,
      };
    })
    .filter((bullet) => bullet.reasons.length);

  const strongBulletCount = bullets.length - weakBullets.length;
  const score = Math.round((strongBulletCount / bullets.length) * 100);

  return {
    score,
    strongBulletCount,
    bullets,
    weakBullets,
    explanation: `${strongBulletCount} of ${bullets.length} bullets contain action-oriented, measurable impact.`,
  };
}

function buildFeedback({
  keywordResult,
  completenessResult,
  formattingResult,
  actionVerbResult,
  bulletQualityResult,
}: {
  keywordResult: any;
  completenessResult: any;
  formattingResult: any;
  actionVerbResult: any;
  bulletQualityResult: any;
}) {
  const feedbackItems: string[] = [];

  if (!keywordResult.keywords.length) {
    feedbackItems.push("Add a target job title or job description to unlock keyword matching.");
  } else if (keywordResult.missingKeywords.length) {
    feedbackItems.push(`Add missing keywords such as ${keywordResult.missingKeywords.slice(0, 4).join(", ")}.`);
  }

  if (completenessResult.missingSections.length) {
    feedbackItems.push(`Complete these required sections: ${completenessResult.missingSections.join(", ")}.`);
  }

  if (formattingResult.requiredFieldIssues.length) {
    feedbackItems.push("Fill any blank required fields to improve formatting safety.");
  }

  if (formattingResult.invalidDateIssues.length) {
    feedbackItems.push("Fix invalid or reversed dates in education and work experience.");
  }

  if (actionVerbResult.weakBullets.length) {
    feedbackItems.push("Start more bullets with strong verbs like Built, Developed, Led, or Optimized.");
  }

  if (bulletQualityResult.weakBullets.length) {
    feedbackItems.push("Add numbers, metrics, and clearer impact to weak bullet points.");
  }

  return feedbackItems;
}

function logAtsBreakdown(payload: Record<string, unknown>) {
  if (typeof console === "undefined") {
    return;
  }

  console.groupCollapsed("[ATS] Score breakdown");
  Object.entries(payload).forEach(([label, value]) => {
    console.log(label, value);
  });
  console.groupEnd();
}

export function getAtsScore({
  resumeData,
  jobTitle = "",
  jobDescription = "",
  sections = [],
  sectionOrder = DEFAULT_SECTION_ORDER,
  personalSectionDeleted = false,
}: {
  resumeData: any;
  jobTitle?: string;
  jobDescription?: string;
  sections?: any[];
  sectionOrder?: string[];
  personalSectionDeleted?: boolean;
}) {
  const keywordResult = getKeywordScore(resumeData, jobTitle, jobDescription);
  const completenessResult = getCompletenessScore(resumeData, sections, personalSectionDeleted);
  const formattingResult = getFormattingScore(resumeData, sections, personalSectionDeleted);
  const actionVerbResult = getActionVerbScore(resumeData, sections);
  const bulletQualityResult = getBulletQualityScore(resumeData, sections);

  const weightedScores = {
    keywords: Number((keywordResult.score * ATS_WEIGHTS.keywords).toFixed(2)),
    completeness: Number((completenessResult.score * ATS_WEIGHTS.completeness).toFixed(2)),
    formatting: Number((formattingResult.score * ATS_WEIGHTS.formatting).toFixed(2)),
    actionVerbs: Number((actionVerbResult.score * ATS_WEIGHTS.actionVerbs).toFixed(2)),
    bulletQuality: Number((bulletQualityResult.score * ATS_WEIGHTS.bulletQuality).toFixed(2)),
  };

  const score = Math.round(
    weightedScores.keywords +
      weightedScores.completeness +
      weightedScores.formatting +
      weightedScores.actionVerbs +
      weightedScores.bulletQuality,
  );

  const label = score >= 80 ? "Good" : score >= 50 ? "Average" : "Needs improvement";
  const tone = score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
  const combinedWeakBullets = [...actionVerbResult.weakBullets, ...bulletQualityResult.weakBullets];
  const weakBullets = Array.from(
    new Map(
      combinedWeakBullets.map((bullet: any) => [
        `${bullet.section}-${bullet.itemIndex}-${bullet.bulletIndex}-${bullet.text}`,
        bullet,
      ]),
    ).values(),
  );

  const result = {
    score,
    label,
    tone,
    jobDescriptionPresent: hasText(jobDescription),
    sectionScores: {
      keywords: keywordResult.score,
      completeness: completenessResult.score,
      formatting: formattingResult.score,
      actionVerbs: actionVerbResult.score,
      bulletQuality: bulletQualityResult.score,
    },
    weights: ATS_WEIGHTS,
    weightedScores,
    matchedKeywords: keywordResult.matchedKeywords,
    missingKeywords: keywordResult.missingKeywords,
    missingSections: completenessResult.missingSections,
    weakBullets: weakBullets.slice(0, 6).map((bullet: any) => ({
      section: bullet.section,
      text: bullet.text,
      reason: (bullet.reasons || []).join(", "),
    })),
    feedbackItems: buildFeedback({
      keywordResult,
      completenessResult,
      formattingResult,
      actionVerbResult,
      bulletQualityResult,
    }),
    breakdown: {
      keywords: {
        source: keywordResult.targetSource,
        totalKeywords: keywordResult.keywords.length,
        matchedCount: keywordResult.matchedKeywords.length,
        keywords: keywordResult.keywords,
        explanation: keywordResult.explanation,
      },
      completeness: {
        existingSections: completenessResult.existingSections,
        totalSections: completenessResult.totalSections,
        requiredSections: completenessResult.requiredSections,
      },
      formatting: {
        checkedFieldCount: formattingResult.checkedFieldCount,
        emptyFieldCount: formattingResult.requiredFieldIssues.length,
        invalidDateCount: formattingResult.invalidDateIssues.length,
        weirdCharacterCount: formattingResult.weirdCharacterIssues.length,
        requiredFieldIssues: formattingResult.requiredFieldIssues,
        invalidDateIssues: formattingResult.invalidDateIssues,
        weirdCharacterIssues: formattingResult.weirdCharacterIssues,
        penalties: formattingResult.penalties,
      },
      actionVerbs: {
        totalBullets: actionVerbResult.bullets.length,
        strongBulletCount: actionVerbResult.strongBullets.length,
        explanation: actionVerbResult.explanation,
      },
      bulletQuality: {
        totalBullets: bulletQualityResult.bullets.length,
        strongBulletCount: bulletQualityResult.strongBulletCount,
        explanation: bulletQualityResult.explanation,
      },
      formula: {
        score,
        weights: ATS_WEIGHTS,
        weightedScores,
        sectionOrderLength: sectionOrder.length,
      },
    },
  };

  logAtsBreakdown({
    "Final ATS Score": score,
    "Keyword Score": {
      score: keywordResult.score,
      matchedKeywords: keywordResult.matchedKeywords,
      missingKeywords: keywordResult.missingKeywords,
      keywords: keywordResult.keywords,
      source: keywordResult.targetSource,
    },
    "Completeness Score": {
      score: completenessResult.score,
      existingSections: completenessResult.existingSections,
      totalSections: completenessResult.totalSections,
      missingSections: completenessResult.missingSections,
    },
    "Formatting Score": {
      score: formattingResult.score,
      checkedFieldCount: formattingResult.checkedFieldCount,
      requiredFieldIssues: formattingResult.requiredFieldIssues,
      invalidDateIssues: formattingResult.invalidDateIssues,
      weirdCharacterIssues: formattingResult.weirdCharacterIssues,
      penalties: formattingResult.penalties,
    },
    "Action Verb Score": {
      score: actionVerbResult.score,
      totalBullets: actionVerbResult.bullets.length,
      strongBulletCount: actionVerbResult.strongBullets.length,
    },
    "Bullet Quality Score": {
      score: bulletQualityResult.score,
      totalBullets: bulletQualityResult.bullets.length,
      strongBulletCount: bulletQualityResult.strongBulletCount,
    },
    "Weighted Formula": result.breakdown.formula,
  });

  return result;
}

export function getResumeKeywordCoverage(resumeData: any, jobTitle = "", jobDescription = "") {
  const keywordResult = getKeywordScore(resumeData, jobTitle, jobDescription);
  return {
    matchedKeywords: keywordResult.matchedKeywords,
    missingKeywords: keywordResult.missingKeywords,
  };
}

export function getResumeTechnologyKeywords(resumeData: any) {
  return [
    ...getResumeSkills(resumeData),
    ...(resumeData?.projects || []).flatMap((project: any) => splitCsv(project?.technologies || "")),
  ].filter(Boolean);
}
