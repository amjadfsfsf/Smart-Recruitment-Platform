/**
 * Deterministic AI skill-gap helpers.
 *
 * `analyzeSkillGap(...)` performs normalization, semantic matching, false-missing
 * cleanup, and true completion scoring across the prioritized skill list.
 *
 * `calculateAIMatchScore(...)` is kept for embedding-based scoring workflows that
 * already depend on an OpenAI client.
 */

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const PRIORITY_LEVELS = ["high", "medium", "low"];
const CATEGORY_KEYS = ["technical", "tools", "soft"];
const MAX_SKILL_WORDS = 3;
const CATEGORY_ORDER = Object.freeze({
  technical: 0,
  tools: 1,
  soft: 2,
});
const PRIORITY_ORDER = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});
const STOP_WORDS = new Set(["and", "for", "of", "the", "a", "an", "to", "with"]);

const DEFAULT_SYNONYMS = {
  "pv systems": "photovoltaic systems",
  photovoltaic: "photovoltaic systems",
  "solar pv": "photovoltaic systems",
  "amazon web services": "aws",
  autocad: "autocad",
  "auto cad": "autocad",
  "cloud platform": "cloud platforms",
  js: "javascript",
  ts: "typescript",
  nlp: "natural language processing",
  "natural-language-processing": "natural language processing",
  "natural language understanding": "natural language processing",
  ml: "machine learning",
  "machine-learning": "machine learning",
  dl: "deep learning",
  "node js": "node.js",
  nodejs: "node.js",
  "react js": "react",
  reactjs: "react",
  "google cloud": "gcp",
  "google cloud platform": "gcp",
  "microsoft azure": "azure",
  "next js": "next.js",
  nextjs: "next.js",
  torch: "pytorch",
  "scikit learn": "scikit-learn",
  sklearn: "scikit-learn",
  "data viz": "data visualization",
  "data visualisation": "data visualization",
  "deep learning framework": "deep learning frameworks",
  "deep learning libraries": "deep learning frameworks",
  "communication skills": "communication",
  "presentation skills": "presentation",
  "problem solving": "problem solving",
  "problem-solving": "problem solving",
  "problem-solving skills": "problem solving",
  "critical thinking skills": "critical thinking",
  "team work": "collaboration",
  teamwork: "collaboration",
};

const SOFT_SKILL_SET = new Set([
  "adaptability",
  "analytical thinking",
  "attention to detail",
  "collaboration",
  "communication",
  "conflict resolution",
  "critical thinking",
  "leadership",
  "mentoring",
  "negotiation",
  "ownership",
  "presentation",
  "problem solving",
  "stakeholder management",
  "time management",
  "written communication",
]);

const TOOL_SKILL_SET = new Set([
  "airflow",
  "ansible",
  "autocad",
  "aws",
  "azure",
  "ci/cd",
  "confluence",
  "dbt",
  "docker",
  "django",
  "express",
  "fastapi",
  "figma",
  "flask",
  "gcp",
  "git",
  "github",
  "github actions",
  "gitlab",
  "grafana",
  "hadoop",
  "jenkins",
  "jira",
  "kafka",
  "keras",
  "kubernetes",
  "linux",
  "matplotlib",
  "mongodb",
  "mysql",
  "next.js",
  "node.js",
  "numpy",
  "opencv",
  "pandas",
  "plotly",
  "postgresql",
  "power bi",
  "prometheus",
  "pvsyst",
  "pytorch",
  "react",
  "redis",
  "scikit-learn",
  "seaborn",
  "spark",
  "spring",
  "spring boot",
  "tableau",
  "tensorflow",
  "terraform",
]);

const TOOL_KEYWORDS = [
  "api",
  "apis",
  "cloud",
  "database",
  "databases",
  "framework",
  "frameworks",
  "library",
  "libraries",
  "platform",
  "platforms",
  "sdk",
  "tool",
  "tools",
];

const FAMILY_CANONICALS = Object.freeze({
  "cloud-platforms": "cloud platforms",
  "machine-learning": "machine learning",
  "natural-language-processing": "natural language processing",
  "deep-learning": "deep learning",
  "deep-learning-frameworks": "deep learning frameworks",
  "data-visualization": "data visualization",
  "version-control": "version control",
});

const FAMILY_MEMBERS = Object.freeze({
  "cloud-platforms": new Set(["cloud platforms", "aws", "gcp", "azure"]),
  "machine-learning": new Set(["machine learning"]),
  "natural-language-processing": new Set(["natural language processing"]),
  "deep-learning": new Set(["deep learning"]),
  "deep-learning-frameworks": new Set([
    "deep learning frameworks",
    "pytorch",
    "tensorflow",
    "keras",
    "jax",
    "mxnet",
    "caffe",
  ]),
  "data-visualization": new Set([
    "data visualization",
    "matplotlib",
    "seaborn",
    "plotly",
    "tableau",
    "power bi",
  ]),
  "version-control": new Set(["version control", "git", "github", "gitlab"]),
});
const CLOUD_PROVIDER_COMPACT_ALIASES = Object.freeze([
  ["amazonwebservices", "aws"],
  ["googlecloudplatform", "gcp"],
  ["googlecloud", "gcp"],
  ["microsoftazure", "azure"],
  ["aws", "aws"],
  ["gcp", "gcp"],
  ["azure", "azure"],
]);
const CLOUD_PROVIDER_EXACT_ALIASES = new Set([
  "aws",
  "amazon web services",
  "gcp",
  "google cloud",
  "google cloud platform",
  "azure",
  "microsoft azure",
]);
const REDUNDANT_GENERIC_SKILLS = Object.freeze({
  "cloud platforms": new Set(["aws", "gcp", "azure"]),
});

function roundScore(value) {
  return Math.round(value * 100) / 100;
}

function normalizeSkillText(value, synonyms = DEFAULT_SYNONYMS) {
  if (typeof value !== "string") {
    return "";
  }

  let normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  normalized = normalized
    .replace(/[\u2019']/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[_]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ");

  while (synonyms[normalized] && synonyms[normalized] !== normalized) {
    normalized = synonyms[normalized];
  }

  return normalized;
}

function countSkillWords(value) {
  return normalizeSkillText(value)
    .replace(/[().,/:-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function expandCloudProviderCompound(value) {
  const normalized = normalizeSkillText(value);
  if (!normalized) {
    return [];
  }

  let compact = normalized.replace(/[^a-z0-9]/g, "");
  if (!compact) {
    return [];
  }

  let sawGenericLabel = false;
  ["cloudplatforms", "cloudplatform"].forEach((label) => {
    if (compact.startsWith(label)) {
      compact = compact.slice(label.length);
      sawGenericLabel = true;
    }
  });
  ["cloudplatforms", "cloudplatform"].forEach((label) => {
    if (compact.endsWith(label)) {
      compact = compact.slice(0, -label.length);
      sawGenericLabel = true;
    }
  });

  if (!compact) {
    return [];
  }

  const expanded = [];
  let remaining = compact;
  while (remaining.length > 0) {
    const match = CLOUD_PROVIDER_COMPACT_ALIASES.find(([alias]) => remaining.startsWith(alias));
    if (!match) {
      return [];
    }

    const [alias, canonical] = match;
    expanded.push(canonical);
    remaining = remaining.slice(alias.length);
  }

  if (sawGenericLabel || expanded.length > 1 || CLOUD_PROVIDER_EXACT_ALIASES.has(normalized)) {
    return expanded;
  }

  return [];
}

function splitLongSkillPhrase(value) {
  const normalized = normalizeSkillText(value);
  if (!normalized.includes(" and ")) {
    return [value];
  }

  const parts = value
    .split(/\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return [value];
  }

  if (parts.some((part) => countSkillWords(part) > MAX_SKILL_WORDS)) {
    return [value];
  }

  return parts;
}

function expandSkillText(value) {
  if (typeof value !== "string") {
    return [];
  }

  const cleaned = value.trim();
  if (!cleaned) {
    return [];
  }

  const cloudProviders = expandCloudProviderCompound(cleaned);
  if (cloudProviders.length) {
    return [...new Set(cloudProviders)];
  }

  const splitValues = splitLongSkillPhrase(cleaned);
  if (splitValues.length > 1) {
    return splitValues.flatMap((part) => expandSkillText(part));
  }

  if (countSkillWords(cleaned) > MAX_SKILL_WORDS) {
    return [];
  }

  return [cleaned];
}

function getRedundantGenericSkills(canonicals) {
  const present = new Set(canonicals);
  const redundant = new Set();

  Object.entries(REDUNDANT_GENERIC_SKILLS).forEach(([generic, members]) => {
    if (present.has(generic) && [...members].some((member) => present.has(member))) {
      redundant.add(generic);
    }
  });

  return redundant;
}

function pruneRedundantGenericDescriptors(descriptors) {
  const redundant = getRedundantGenericSkills(descriptors.map((descriptor) => descriptor.canonical));
  if (!redundant.size) {
    return descriptors;
  }

  return descriptors.filter((descriptor) => !redundant.has(descriptor.canonical));
}

function pruneRedundantGenericPriorityGroups(groups) {
  const redundant = getRedundantGenericSkills(
    PRIORITY_LEVELS.flatMap((level) => groups[level]),
  );
  if (!redundant.size) {
    return groups;
  }

  return PRIORITY_LEVELS.reduce(
    (accumulator, level) => ({
      ...accumulator,
      [level]: groups[level].filter((skill) => !redundant.has(skill)),
    }),
    {},
  );
}

function tokenizeSkill(value) {
  return normalizeSkillText(value)
    .replace(/[().,/:-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token));
}

function bigramDiceCoefficient(left, right) {
  const a = normalizeSkillText(left);
  const b = normalizeSkillText(right);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const buildBigrams = (text) => {
    if (text.length < 2) {
      return [text];
    }

    const out = [];
    for (let index = 0; index < text.length - 1; index += 1) {
      out.push(text.slice(index, index + 2));
    }
    return out;
  };

  const leftBigrams = buildBigrams(a);
  const rightBigrams = buildBigrams(b);
  const rightCounts = new Map();

  rightBigrams.forEach((bigram) => {
    rightCounts.set(bigram, (rightCounts.get(bigram) || 0) + 1);
  });

  let overlap = 0;
  leftBigrams.forEach((bigram) => {
    const count = rightCounts.get(bigram) || 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(bigram, count - 1);
    }
  });

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function levenshteinDistance(left, right) {
  const a = normalizeSkillText(left);
  const b = normalizeSkillText(right);

  if (a === b) {
    return 0;
  }

  if (!a) {
    return b.length;
  }

  if (!b) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];

    for (let column = 1; column <= b.length; column += 1) {
      const substitutionCost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost,
      );
    }

    previous = current;
  }

  return previous[b.length];
}

function levenshteinSimilarity(left, right) {
  const a = normalizeSkillText(left);
  const b = normalizeSkillText(right);
  const longest = Math.max(a.length, b.length);

  if (!longest) {
    return 0;
  }

  return 1 - levenshteinDistance(a, b) / longest;
}

function getSkillFamilies(canonical) {
  const families = new Set();

  Object.entries(FAMILY_MEMBERS).forEach(([tag, members]) => {
    if (members.has(canonical)) {
      families.add(tag);
    }
  });

  return families;
}

function isGenericFamilySkill(canonical, familyTag) {
  return FAMILY_CANONICALS[familyTag] === canonical;
}

function inferSkillCategory(skill) {
  const canonical = normalizeSkillText(skill);
  if (!canonical) {
    return "technical";
  }

  if (SOFT_SKILL_SET.has(canonical)) {
    return "soft";
  }

  if (TOOL_SKILL_SET.has(canonical)) {
    return "tools";
  }

  const softPattern = /\b(communication|collaboration|leadership|mentoring|stakeholder|teamwork|presentation|adaptability|ownership|negotiation|critical thinking|problem-solving|time management)\b/;
  const normalizedSoftPattern = /\b(communication|collaboration|leadership|mentoring|stakeholder|presentation|adaptability|ownership|negotiation|critical thinking|problem solving|time management)\b/;
  if (softPattern.test(canonical) || normalizedSoftPattern.test(canonical)) {
    return "soft";
  }

  if (TOOL_KEYWORDS.some((keyword) => canonical.includes(keyword))) {
    return "tools";
  }

  return "technical";
}

function normalizeCategory(value, fallbackSkill = "") {
  const normalized = normalizeSkillText(value);

  if (normalized === "tool") {
    return "tools";
  }

  if (CATEGORY_KEYS.includes(normalized)) {
    return normalized;
  }

  if (normalized === "soft skill" || normalized === "soft skills") {
    return "soft";
  }

  if (normalized === "technical skill" || normalized === "technical skills") {
    return "technical";
  }

  return inferSkillCategory(fallbackSkill);
}

function normalizePriority(value) {
  const normalized = normalizeSkillText(value);
  return PRIORITY_LEVELS.includes(normalized) ? normalized : null;
}

function comparePriority(left, right) {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  return PRIORITY_ORDER[left] - PRIORITY_ORDER[right];
}

function buildSkillDescriptor(skill, options = {}) {
  const canonical = normalizeSkillText(skill, options.synonyms || DEFAULT_SYNONYMS);
  if (!canonical) {
    return null;
  }

  return {
    raw: skill,
    canonical,
    tokens: tokenizeSkill(canonical),
    category: normalizeCategory(options.category, canonical),
    priority: normalizePriority(options.priority),
    families: getSkillFamilies(canonical),
  };
}

function tokenOverlapMetrics(requiredDescriptor, userDescriptor) {
  const requiredTokens = new Set(requiredDescriptor.tokens);
  const userTokens = new Set(userDescriptor.tokens);
  const sharedTokens = [...requiredTokens].filter((token) => userTokens.has(token));
  const sharedCount = sharedTokens.length;
  const unionCount = new Set([...requiredTokens, ...userTokens]).size || 1;

  return {
    requiredCoverage: requiredTokens.size ? sharedCount / requiredTokens.size : 0,
    jaccard: sharedCount / unionCount,
    sharedCount,
  };
}

function getFamilySimilarity(requiredDescriptor, userDescriptor) {
  let best = 0;

  requiredDescriptor.families.forEach((familyTag) => {
    if (!userDescriptor.families.has(familyTag)) {
      return;
    }

    const requiredIsGeneric = isGenericFamilySkill(requiredDescriptor.canonical, familyTag);
    const userIsGeneric = isGenericFamilySkill(userDescriptor.canonical, familyTag);

    if (requiredIsGeneric && !userIsGeneric) {
      best = Math.max(best, 0.85);
      return;
    }

    if (!requiredIsGeneric && userIsGeneric) {
      best = Math.max(best, 0.85);
      return;
    }

    if (requiredIsGeneric && userIsGeneric) {
      best = Math.max(best, 1);
      return;
    }

    best = Math.max(best, 0.3);
  });

  return best;
}

function skillSimilarity(requiredDescriptor, userDescriptor) {
  if (!requiredDescriptor || !userDescriptor) {
    return 0;
  }

  if (requiredDescriptor.canonical === userDescriptor.canonical) {
    return 1;
  }

  const familyScore = getFamilySimilarity(requiredDescriptor, userDescriptor);
  const { requiredCoverage, jaccard, sharedCount } = tokenOverlapMetrics(
    requiredDescriptor,
    userDescriptor,
  );
  const dice = bigramDiceCoefficient(requiredDescriptor.canonical, userDescriptor.canonical);
  const editSimilarity = levenshteinSimilarity(requiredDescriptor.canonical, userDescriptor.canonical);

  let containmentScore = 0;
  if (
    requiredDescriptor.canonical.includes(userDescriptor.canonical) ||
    userDescriptor.canonical.includes(requiredDescriptor.canonical)
  ) {
    containmentScore = Math.max(0.45, 0.5 + requiredCoverage * 0.35);
  }

  if (sharedCount > 0 && requiredCoverage === 1) {
    containmentScore = Math.max(containmentScore, 0.72);
  }

  const lexicalScore =
    requiredCoverage * 0.45 +
    jaccard * 0.2 +
    dice * 0.2 +
    editSimilarity * 0.15;

  return Math.max(0, Math.min(1, Math.max(familyScore, containmentScore, lexicalScore)));
}

function getBestSemanticMatch(requiredDescriptor, userDescriptors) {
  return userDescriptors.reduce(
    (best, userDescriptor) => {
      const similarity = skillSimilarity(requiredDescriptor, userDescriptor);
      if (similarity > best.similarity) {
        return { similarity, userDescriptor };
      }

      if (
        similarity === best.similarity &&
        best.userDescriptor &&
        userDescriptor.canonical < best.userDescriptor.canonical
      ) {
        return { similarity, userDescriptor };
      }

      if (similarity === best.similarity && best.userDescriptor == null) {
        return { similarity, userDescriptor };
      }

      return best;
    },
    { similarity: 0, userDescriptor: null },
  );
}

function parseSkillItems(input, defaultCategory = null) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap((item) => {
      if (typeof item === "string") {
        return expandSkillText(item).map((skill) => ({ skill, category: defaultCategory }));
      }

      if (item && typeof item === "object") {
        const skill =
          typeof item.skill === "string"
            ? item.skill
            : typeof item.name === "string"
              ? item.name
              : typeof item.title === "string"
                ? item.title
                : "";

        if (!skill) {
          return [];
        }

        return expandSkillText(skill).map((expandedSkill) => ({
          skill: expandedSkill,
          category: item.category || item.type || defaultCategory,
          priority: item.priority || null,
        }));
      }

      return [];
    });
  }

  if (typeof input === "object") {
    return CATEGORY_KEYS.flatMap((category) => parseSkillItems(input[category], category));
  }

  return [];
}

function upsertRoleSkill(roleSkillMap, descriptor) {
  if (!descriptor) {
    return null;
  }

  const existing = roleSkillMap.get(descriptor.canonical);
  if (!existing) {
    roleSkillMap.set(descriptor.canonical, {
      canonical: descriptor.canonical,
      category: descriptor.category,
      priority: descriptor.priority,
      tokens: descriptor.tokens,
      families: descriptor.families,
    });
    return roleSkillMap.get(descriptor.canonical);
  }

  if (existing.category === "technical" && descriptor.category !== "technical") {
    existing.category = descriptor.category;
  }

  if (comparePriority(descriptor.priority, existing.priority) < 0) {
    existing.priority = descriptor.priority;
  }

  return existing;
}

function buildRoleSkillCatalog(requiredSkills, skillPriority) {
  const roleSkillMap = new Map();

  parseSkillItems(requiredSkills).forEach((item) => {
    upsertRoleSkill(roleSkillMap, buildSkillDescriptor(item.skill, { category: item.category }));
  });

  const priorityDescriptors = PRIORITY_LEVELS.flatMap((priority) =>
    parseSkillItems(skillPriority?.[priority]).map((item) =>
      buildSkillDescriptor(item.skill, { category: item.category, priority }),
    ),
  ).filter(Boolean);

  priorityDescriptors.forEach((priorityDescriptor) => {
    const matchedRoleSkill = [...roleSkillMap.values()].reduce(
      (best, roleSkill) => {
        const similarity = skillSimilarity(priorityDescriptor, roleSkill);
        if (similarity < 0.7 || similarity < best.similarity) {
          return best;
        }

        if (similarity > best.similarity) {
          return { similarity, roleSkill };
        }

        if (best.roleSkill == null || roleSkill.canonical < best.roleSkill.canonical) {
          return { similarity, roleSkill };
        }

        return best;
      },
      { similarity: 0, roleSkill: null },
    );

    if (matchedRoleSkill.roleSkill) {
      if (comparePriority(priorityDescriptor.priority, matchedRoleSkill.roleSkill.priority) < 0) {
        matchedRoleSkill.roleSkill.priority = priorityDescriptor.priority;
      }
      return;
    }

    upsertRoleSkill(roleSkillMap, priorityDescriptor);
  });

  const roleSkills = pruneRedundantGenericDescriptors([...roleSkillMap.values()]);
  const hasPriorities = roleSkills.some((roleSkill) => roleSkill.priority);
  if (!hasPriorities) {
    roleSkills.forEach((roleSkill) => {
      roleSkill.priority = "medium";
    });
  }

  return roleSkills;
}

function buildUserSkillDescriptors(userSkills) {
  const userSkillMap = new Map();

  parseSkillItems(userSkills).forEach((item) => {
    const descriptor = buildSkillDescriptor(item.skill, { category: item.category });
    if (!descriptor || userSkillMap.has(descriptor.canonical)) {
      return;
    }
    userSkillMap.set(descriptor.canonical, descriptor);
  });

  return pruneRedundantGenericDescriptors([...userSkillMap.values()]);
}

function sortSkillNames(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function cleanMissingBuckets(missingSkills, blockedSkills) {
  const blocked = new Set(blockedSkills);
  const seen = new Set();

  return CATEGORY_KEYS.reduce(
    (accumulator, category) => {
      const values = Array.isArray(missingSkills[category]) ? missingSkills[category] : [];
      accumulator[category] = values.filter((skill) => {
        if (blocked.has(skill) || seen.has(skill)) {
          return false;
        }
        seen.add(skill);
        return true;
      });
      return accumulator;
    },
    { technical: [], tools: [], soft: [] },
  );
}

function getPriorityCategory(skill) {
  return normalizeCategory(null, skill);
}

function dedupeOrderedSkills(values) {
  const ordered = [];
  const seen = new Set();

  values.forEach((value) => {
    const canonical = normalizeSkillText(value);
    if (!canonical || seen.has(canonical)) {
      return;
    }

    seen.add(canonical);
    ordered.push(canonical);
  });

  return ordered;
}

export function isMatch(skill, userSkills) {
  const userDescriptors = buildUserSkillDescriptors(userSkills);
  const targetDescriptor = buildSkillDescriptor(skill);
  if (!targetDescriptor) {
    return false;
  }

  return userDescriptors.some(
    (userDescriptor) => skillSimilarity(targetDescriptor, userDescriptor) >= 0.7,
  );
}

function getMatchStrength(skill, userDescriptors) {
  const targetDescriptor = buildSkillDescriptor(skill);
  if (!targetDescriptor) {
    return { status: "missing", similarity: 0, descriptor: null };
  }

  const bestMatch = getBestSemanticMatch(targetDescriptor, userDescriptors);
  if (bestMatch.similarity >= 0.7) {
    return { status: "matched", similarity: bestMatch.similarity, descriptor: targetDescriptor };
  }

  return { status: "missing", similarity: bestMatch.similarity, descriptor: targetDescriptor };
}

/**
 * Analyze role-relevant skill coverage using deterministic normalization and
 * semantic similarity. Only strong semantic equivalents are treated as matched,
 * which keeps false missing low without inflating completion scores.
 *
 * @param {string[] | object[]} userSkills
 * @param {string[] | object[] | {technical?: string[], tools?: string[], soft?: string[]}} requiredSkills
 * @param {{high?: string[], medium?: string[], low?: string[]}} skillPriority
 * @returns {{existing_skills: string[], missing_skills: {technical: string[], tools: string[], soft: string[]}, match_score: number}}
 */
export function analyzeSkillGap(userSkills, requiredSkills, skillPriority) {
  const roleSkills = buildRoleSkillCatalog(requiredSkills, skillPriority);
  const userDescriptors = buildUserSkillDescriptors(userSkills);

  const evaluations = roleSkills.map((roleSkill) => {
    const bestMatch = getBestSemanticMatch(roleSkill, userDescriptors);
    const status = bestMatch.similarity >= 0.7 ? "matched" : "missing";

    return {
      canonical: roleSkill.canonical,
      category: roleSkill.category,
      priority: roleSkill.priority,
      similarity: Math.round(bestMatch.similarity * 1000) / 1000,
      status,
    };
  });

  const existingSkills = sortSkillNames(
    [...new Set(
      evaluations
        .filter((evaluation) => evaluation.status === "matched")
        .map((evaluation) => evaluation.canonical),
    )],
  );

  const missingSkills = evaluations.reduce(
    (accumulator, evaluation) => {
      if (evaluation.status !== "missing") {
        return accumulator;
      }

      accumulator[evaluation.category].push(evaluation.canonical);
      return accumulator;
    },
    { technical: [], tools: [], soft: [] },
  );
  const cleanedMissingSkills = cleanMissingBuckets(
    {
      technical: sortSkillNames(missingSkills.technical),
      tools: sortSkillNames(missingSkills.tools),
      soft: sortSkillNames(missingSkills.soft),
    },
    existingSkills,
  );
  const priorityGroups = PRIORITY_LEVELS.reduce(
    (accumulator, priority) => ({ ...accumulator, [priority]: [] }),
    {},
  );

  evaluations.forEach((evaluation) => {
    if (!priorityGroups[evaluation.priority]) {
      return;
    }

    priorityGroups[evaluation.priority].push(evaluation.canonical);
  });

  return {
    existing_skills: existingSkills,
    missing_skills: cleanedMissingSkills,
    match_score: calculateMatchScore(priorityGroups, cleanedMissingSkills),
  };
}

function normalizeMatchScoreSkill(value) {
  const descriptor = buildSkillDescriptor(value);
  return descriptor ? descriptor.canonical : "";
}

function normalizePriorityGroups(skillPriority) {
  const groups = {
    high: [],
    medium: [],
    low: [],
  };
  const seen = new Set();

  PRIORITY_LEVELS.forEach((level) => {
    const values = parseSkillItems(skillPriority?.[level]);

    values.forEach((item) => {
      const normalized = normalizeMatchScoreSkill(item.skill);
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      groups[level].push(normalized);
    });
  });

  return pruneRedundantGenericPriorityGroups(groups);
}

function flattenPriorityGroups(priorityGroups) {
  const allSkills = [];
  const seen = new Set();

  PRIORITY_LEVELS.forEach((level) => {
    priorityGroups[level].forEach((skill) => {
      if (!skill || seen.has(skill)) {
        return;
      }

      seen.add(skill);
      allSkills.push(skill);
    });
  });

  return allSkills;
}

function isSkillCoveredByUserDescriptors(skill, userDescriptors) {
  const result = getMatchStrength(skill, userDescriptors);
  return result.status === "matched";
}

/**
 * Remove any priority skill the user already has or semantically covers.
 * The returned buckets are normalized, deduped, and preserve the original
 * priority ordering deterministically.
 *
 * @param {string[] | object[]} userSkills
 * @param {{high?: string[], medium?: string[], low?: string[]}} skillPriority
 * @returns {{high: string[], medium: string[], low: string[]}}
 */
export function cleanSkillPriority(userSkills, skillPriority) {
  const priorityGroups = normalizePriorityGroups(skillPriority);
  const userDescriptors = buildUserSkillDescriptors(userSkills);
  const cleaned = {
    high: [],
    medium: [],
    low: [],
  };
  const seen = new Set();

  PRIORITY_LEVELS.forEach((level) => {
    priorityGroups[level].forEach((skill) => {
      if (!skill || seen.has(skill)) {
        return;
      }

      if (isSkillCoveredByUserDescriptors(skill, userDescriptors)) {
        return;
      }

      seen.add(skill);
      cleaned[level].push(skill);
    });
  });

  return cleaned;
}

function buildPrioritySkillLookup(priorityGroups) {
  const lookup = new Map();

  PRIORITY_LEVELS.forEach((level) => {
    priorityGroups[level].forEach((skill) => {
      if (!lookup.has(skill)) {
        lookup.set(skill, skill);
      }
    });
  });

  return lookup;
}

function normalizeMissingGroups(missingSkills, priorityGroups) {
  const lookup = buildPrioritySkillLookup(priorityGroups);
  const normalized = [];
  const seen = new Set();

  CATEGORY_KEYS.forEach((category) => {
    const values = Array.isArray(missingSkills?.[category]) ? missingSkills[category] : [];

    values.forEach((skill) => {
      const normalizedSkill = normalizeMatchScoreSkill(skill);
      if (!normalizedSkill || seen.has(normalizedSkill)) {
        return;
      }

      if (!lookup.has(normalizedSkill)) {
        return;
      }

      seen.add(normalizedSkill);
      normalized.push(lookup.get(normalizedSkill));
    });
  });

  return normalized;
}

/**
 * Calculate the true completion percentage of the current
 * `skillPriority` list.
 *
 * Rules:
 * - The score is based only on `skillPriority`.
 * - All priority buckets are combined into one deduped list.
 * - `missingSkills` is cleaned by intersecting it with `skillPriority`.
 * - Duplicate skills are removed deterministically.
 * - Missing skills outside `skillPriority` are ignored.
 *
 * @param {{high?: string[], medium?: string[], low?: string[]}} skillPriority
 * @param {{technical?: string[], tools?: string[], soft?: string[]}} missingSkills
 * @returns {number}
 */
export function calculateMatchScore(skillPriority, missingSkills) {
  const priorityGroups = normalizePriorityGroups(skillPriority);
  const allSkills = flattenPriorityGroups(priorityGroups);
  if (!allSkills.length) {
    console.debug({
      total_skills: 0,
      missing_skills_used: [],
      completed_skills: 0,
      final_score: 0,
    });
    return 0;
  }

  const cleanedMissingSkills = normalizeMissingGroups(missingSkills, priorityGroups);
  const missingKeys = new Set(cleanedMissingSkills);
  const totalSkills = allSkills.length;
  const missingCount = allSkills.filter((skill) => missingKeys.has(skill)).length;
  const completedCount = totalSkills - missingCount;
  const finalScore = roundScore(Math.max(0, Math.min(100, (completedCount / totalSkills) * 100)));

  console.debug({
    total_skills: totalSkills,
    missing_skills_used: cleanedMissingSkills,
    completed_skills: completedCount,
    final_score: finalScore,
  });

  return finalScore;
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const map = new Map();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const cleaned = value.trim();
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (!map.has(key)) {
      map.set(key, cleaned);
    }
  }

  return [...map.values()];
}

function normalizeSkill(raw, synonyms) {
  return normalizeSkillText(raw, synonyms);
}

function normalizeSkills(values, synonyms) {
  const out = [];
  const seen = new Set();

  for (const skill of uniqueStrings(values)) {
    const normalized = normalizeSkill(skill, synonyms);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function cosineSimilarity(left, right) {
  if (!left || !right || left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let normLeft = 0;
  let normRight = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    normLeft += left[index] * left[index];
    normRight += right[index] * right[index];
  }

  if (!normLeft || !normRight) {
    return 0;
  }

  return dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
}

function boundedAverage(scores) {
  if (!scores.length) {
    return 0;
  }

  const sum = scores.reduce((accumulator, value) => accumulator + value, 0);
  return sum / scores.length;
}

function toPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value * 10000) / 100));
}

function experienceRank(level) {
  const normalized = String(level || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["entry", "entry-level", "beginner", "junior"].includes(normalized)) {
    return 1;
  }

  if (["mid", "mid-level", "intermediate"].includes(normalized)) {
    return 2;
  }

  if (["senior", "lead", "principal", "staff", "expert"].includes(normalized)) {
    return 3;
  }

  return null;
}

function experienceAligned(candidateLevel, expectedLevel) {
  const candidateRank = experienceRank(candidateLevel);
  const expectedRank = experienceRank(expectedLevel);

  if (candidateRank == null || expectedRank == null) {
    return false;
  }

  return Math.abs(candidateRank - expectedRank) <= 1;
}

function calibrateScore(cosine, isExact) {
  if (isExact) {
    return 1;
  }

  const bounded = Math.max(-1, Math.min(1, cosine));

  if (bounded >= 0.82) {
    const t = (bounded - 0.82) / (1 - 0.82);
    return 0.7 + t * 0.2;
  }

  if (bounded >= 0.55) {
    const t = (bounded - 0.55) / (0.82 - 0.55);
    return 0.4 + t * 0.2;
  }

  return Math.max(0, Math.min(0.39, ((bounded + 1) / 2) * 0.39));
}

async function embedTexts(openai, texts, model) {
  if (!texts.length) {
    return new Map();
  }

  const response = await openai.embeddings.create({
    model,
    input: texts,
  });

  const out = new Map();
  for (let index = 0; index < response.data.length; index += 1) {
    out.set(texts[index], response.data[index].embedding);
  }
  return out;
}

function rankMissing(items) {
  const order = { required: 0, important: 1, soft: 2 };

  return [...items].sort((left, right) => {
    const categoryDiff = order[left.category] - order[right.category];
    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return left.score - right.score;
  });
}

/**
 * @param {object} input
 * @param {import("openai").default} input.openai
 * @param {string} [input.embeddingModel]
 * @param {object} input.role
 * @param {string[]} input.role.requiredSkills
 * @param {string[]} input.role.importantSkills
 * @param {string[]} input.role.softSkills
 * @param {string[]} [input.role.tools]
 * @param {string} [input.role.expectedExperienceLevel]
 * @param {object} input.candidate
 * @param {string[]} input.candidate.skills
 * @param {string[]} [input.candidate.tools]
 * @param {string} [input.candidate.experienceLevel]
 * @param {Record<string, string>} [input.synonyms]
 */
export async function calculateAIMatchScore(input) {
  const {
    openai,
    role,
    candidate,
    embeddingModel = DEFAULT_EMBEDDING_MODEL,
    synonyms: customSynonyms = {},
  } = input || {};

  if (!openai) {
    throw new Error("calculateAIMatchScore requires `openai` client.");
  }

  const synonyms = { ...DEFAULT_SYNONYMS, ...customSynonyms };

  const requiredSkills = normalizeSkills(role?.requiredSkills, synonyms);
  const importantSkills = normalizeSkills(role?.importantSkills, synonyms);
  const softSkills = normalizeSkills(role?.softSkills, synonyms);
  const roleTools = normalizeSkills(role?.tools || [], synonyms);

  const candidateSkills = normalizeSkills(candidate?.skills, synonyms);
  const candidateTools = normalizeSkills(candidate?.tools || [], synonyms);

  const allRoleSkills = [...requiredSkills, ...importantSkills, ...softSkills];
  const allCandidateSkills = candidateSkills;

  const uniqueTexts = [...new Set([...allRoleSkills, ...allCandidateSkills])];
  const embeddingMap = await embedTexts(openai, uniqueTexts, embeddingModel);

  const scoreSkillAgainstCandidate = (targetSkill, category) => {
    let bestScore = 0;
    let bestMatch = null;

    for (const userSkill of allCandidateSkills) {
      const isExact = targetSkill === userSkill;
      const cosine = isExact
        ? 1
        : cosineSimilarity(embeddingMap.get(targetSkill), embeddingMap.get(userSkill));
      const score = calibrateScore(cosine, isExact);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = userSkill;
      }
    }

    return {
      skill: targetSkill,
      category,
      score: Math.round(bestScore * 1000) / 1000,
      matchedWith: bestMatch,
    };
  };

  const requiredEvaluations = requiredSkills.map((skill) =>
    scoreSkillAgainstCandidate(skill, "required"),
  );
  const importantEvaluations = importantSkills.map((skill) =>
    scoreSkillAgainstCandidate(skill, "important"),
  );
  const softEvaluations = softSkills.map((skill) => scoreSkillAgainstCandidate(skill, "soft"));

  const requiredAvg = boundedAverage(requiredEvaluations.map((item) => item.score));
  const importantAvg = boundedAverage(importantEvaluations.map((item) => item.score));
  const softAvg = boundedAverage(softEvaluations.map((item) => item.score));

  let finalScore = (requiredAvg * 0.6 + importantAvg * 0.25 + softAvg * 0.15) * 100;

  const requiredAllMatched =
    requiredEvaluations.length > 0 && requiredEvaluations.every((item) => item.score >= 0.7);
  if (requiredAllMatched) {
    finalScore = Math.max(finalScore, 70);
  }

  const fewSkillsThreshold = 3;
  if (candidateSkills.length < fewSkillsThreshold) {
    finalScore = Math.min(finalScore, 40);
  }

  if (experienceAligned(candidate?.experienceLevel, role?.expectedExperienceLevel)) {
    finalScore += 5;
  }

  let toolsBoostApplied = false;
  if (roleTools.length && candidateTools.length) {
    const overlap = roleTools.filter((tool) => candidateTools.includes(tool));
    if (overlap.length > 0) {
      finalScore += 5;
      toolsBoostApplied = true;
    }
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  const allEvaluations = [
    ...requiredEvaluations,
    ...importantEvaluations,
    ...softEvaluations,
  ];

  const matchedSkills = allEvaluations.filter((item) => item.score >= 0.7);
  const partialSkills = allEvaluations.filter((item) => item.score >= 0.5 && item.score < 0.7);
  const missingSkills = rankMissing(allEvaluations.filter((item) => item.score < 0.5));

  return {
    matchScore: Math.round(finalScore * 100) / 100,
    breakdown: {
      required: toPercent(requiredAvg),
      important: toPercent(importantAvg),
      soft: toPercent(softAvg),
    },
    matchedSkills,
    partialSkills,
    missingSkills,
    meta: {
      embeddingModel,
      weights: { required: 0.6, important: 0.25, soft: 0.15 },
      edgeCases: {
        cappedForFewSkills: candidateSkills.length < fewSkillsThreshold,
        requiredMinimumApplied: requiredAllMatched,
      },
      bonuses: {
        experience: experienceAligned(candidate?.experienceLevel, role?.expectedExperienceLevel) ? 5 : 0,
        tools: toolsBoostApplied ? 5 : 0,
      },
    },
  };
}
