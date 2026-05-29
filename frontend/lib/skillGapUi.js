const ORDERED_LEVELS = ["HIGH", "MEDIUM", "LOW"];

export function buildMissingSkillsByLevel(response = {}) {
  const missingByLevel = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  const seenByLevel = {
    HIGH: new Set(),
    MEDIUM: new Set(),
    LOW: new Set(),
  };

  for (const item of response?.skills || []) {
    const skill = String(item?.skill || "").trim();
    const level = String(item?.level || "").trim().toUpperCase();
    const matched = Boolean(item?.matched);

    if (!skill || matched || !ORDERED_LEVELS.includes(level)) {
      continue;
    }

    const key = skill.toLowerCase();
    if (seenByLevel[level].has(key)) {
      continue;
    }

    seenByLevel[level].add(key);
    missingByLevel[level].push(skill);
  }

  return {
    score: Number(response?.score || 0),
    missing_by_level: missingByLevel,
  };
}

export const MISSING_SKILL_LEVELS = ORDERED_LEVELS;
