"use client";

/**
 * Renders the FULL set of job required skills, classified into:
 *   - Exact matches
 *   - Semantic matches  (blue, with similarity tooltip)
 *   - Missing skills  (red)
 *
 * The component never slices, truncates, or filters the source arrays.
 * It only re-buckets the original `requiredSkills` strings using the
 * lookup dictionaries derived from the API response so a long skill
 * label like "Natural Language Processing" is rendered verbatim.
 */
export default function JobSkillsBreakdown({
  requiredSkills = [],
  exactMatches = [],
  semanticMatches = [],
  missingSkills = [],
  matchBreakdown = {},
  className = "",
  debugLabel = "",
}) {
  const safeRequired = Array.isArray(requiredSkills) ? requiredSkills.filter(Boolean) : [];
  const safeExact = Array.isArray(exactMatches) ? exactMatches.filter(Boolean) : [];
  const safeSemantic = Array.isArray(semanticMatches) ? semanticMatches.filter(Boolean) : [];
  const safeMissing = Array.isArray(missingSkills) ? missingSkills.filter(Boolean) : [];

  const lower = (value) => String(value || "").trim().toLowerCase();
  const exactSet = new Set(safeExact.map(lower));
  const semanticMap = new Map(
    safeSemantic
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [lower(entry.skill), entry]),
  );
  const missingSet = new Set(safeMissing.map(lower));

  // Re-derive the buckets from the ORIGINAL required-skills array. This
  // guarantees no skill goes missing in the UI even if the API forgot
  // to repeat one of them in the matched/missing lists.
  const exactBucket = [];
  const semanticBucket = [];
  const missingBucket = [];

  safeRequired.forEach((skill) => {
    const key = lower(skill);
    if (exactSet.has(key)) {
      exactBucket.push(skill);
      return;
    }
    if (semanticMap.has(key)) {
      semanticBucket.push({ skill, ...semanticMap.get(key) });
      return;
    }
    if (missingSet.has(key)) {
      missingBucket.push(skill);
      return;
    }
    // Fallback: if the API didn't classify the skill, surface it as
    // missing so the user still sees every required skill.
    missingBucket.push(skill);
  });

  if (typeof window !== "undefined" && debugLabel) {
    // eslint-disable-next-line no-console
    console.debug(`[JobSkillsBreakdown:${debugLabel}]`, {
      requiredSkills: safeRequired,
      exactMatches: exactBucket,
      semanticMatches: semanticBucket.map((entry) => ({
        skill: entry.skill,
        matched_with: entry.matched_with,
        similarity: entry.similarity,
      })),
      missingSkills: missingBucket,
      totalDisplayed: exactBucket.length + semanticBucket.length + missingBucket.length,
      totalRequired: safeRequired.length,
    });
  }

  if (safeRequired.length === 0) {
    return (
      <p className="text-xs italic text-white/[0.45]">
        This job has no required skills configured.
      </p>
    );
  }

  return (
    <div className={`flex flex-col gap-3 min-w-0 ${className}`}>
      <SkillsBucket
        title="Exact Matches"
        count={exactBucket.length}
        accent="emerald"
        empty="No exact matches yet."
      >
        {exactBucket.map((skill) => (
          <SkillChip key={`exact-${skill}`} skill={skill} variant="exact" />
        ))}
      </SkillsBucket>

      <SkillsBucket
        title="Semantic Matches"
        count={semanticBucket.length}
        accent="sky"
        empty="No semantic matches detected."
      >
        {semanticBucket.map((entry) => (
          <SkillChip
            key={`semantic-${entry.skill}`}
            skill={entry.skill}
            variant="semantic"
            similarity={entry.similarity}
            matchedWith={entry.matched_with}
          />
        ))}
      </SkillsBucket>

      <MatchBreakdown scores={matchBreakdown} />

      <SkillsBucket
        title="Missing Skills"
        count={missingBucket.length}
        accent="rose"
        empty="No missing skills - full coverage."
      >
        {missingBucket.map((skill) => (
          <SkillChip key={`missing-${skill}`} skill={skill} variant="missing" />
        ))}
      </SkillsBucket>
    </div>
  );
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function MatchBreakdown({ scores = {} }) {
  const rows = [
    { label: "Skills Score", value: scores.skills_score },
    { label: "Description Score", value: scores.desc_score },
    { label: "Experience Score", value: scores.major_score },
    { label: "Title Score", value: scores.title_score },
  ];

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100/80">
          Match Breakdown
        </span>
      </div>
      <div className="dashboard-subcard rounded-xl border p-2.5">
        <div className="grid gap-2">
          {rows.map((row) => {
            const value = normalizePercent(row.value);
            return (
              <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="truncate text-[11px] font-medium text-white/[0.58]">{row.label}</span>
                <span className="text-[11px] font-bold tabular-nums text-white/[0.82]">{value}%</span>
                <div className="premium-progress-track col-span-2 h-1.5 rounded-full">
                  <div
                    className="premium-progress-fill h-full rounded-full"
                    style={{ width: `${value}%` }}
                    aria-label={`${row.label} ${value}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const accentStyles = {
  emerald: {
    title: "text-cyan-100/80",
    badge: "border border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
    border: "dashboard-subcard border-white/[0.08]",
  },
  sky: {
    title: "text-sky-100/80",
    badge: "border border-sky-300/15 bg-sky-400/10 text-sky-100",
    border: "dashboard-subcard border-white/[0.08]",
  },
  rose: {
    title: "text-rose-100/80",
    badge: "border border-rose-300/15 bg-rose-500/10 text-rose-100",
    border: "dashboard-subcard border-white/[0.08]",
  },
};

function SkillsBucket({ title, count, accent = "emerald", empty, children }) {
  const styles = accentStyles[accent] || accentStyles.emerald;
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold uppercase tracking-wide ${styles.title}`}>
          {title}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles.badge}`}>
          {count}
        </span>
      </div>
      <div
        className={`rounded-xl border p-2.5 min-w-0 overflow-visible ${styles.border}`}
        style={{ overflow: "visible" }}
      >
        {hasItems ? (
          <div className="flex flex-wrap gap-1.5 overflow-visible">{children}</div>
        ) : (
          <p className="text-xs italic text-white/[0.45]">{empty}</p>
        )}
      </div>
    </div>
  );
}

const variantStyles = {
  exact:
    "border border-cyan-300/15 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15",
  semantic:
    "border border-sky-300/15 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15",
  missing:
    "border border-rose-300/15 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15",
};

function SkillChip({ skill, variant = "exact", similarity, matchedWith }) {
  const tone = variantStyles[variant] || variantStyles.exact;
  const semanticPct =
    variant === "semantic" && typeof similarity === "number" && Number.isFinite(similarity)
      ? `${(similarity * 100).toFixed(0)}%`
      : null;

  let tooltip;
  if (variant === "semantic") {
    const parts = ["Semantic Match"];
    if (semanticPct) parts.push(`(${semanticPct} similarity)`);
    if (matchedWith) parts.push(`- via "${matchedWith}"`);
    tooltip = parts.join(" ");
  } else if (variant === "exact") {
    tooltip = "Exact Match";
  } else {
    tooltip = "Missing skill";
  }

  return (
    <span
      title={tooltip}
      className={`inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full px-2.5 py-1 text-[11px] font-medium transition ${tone}`}
    >
      {variant === "semantic" && matchedWith ? (
        <span className="break-words">
          {skill} <span aria-hidden="true">&harr;</span> {matchedWith}
          {semanticPct ? ` (${semanticPct})` : ""}
        </span>
      ) : (
        <span className="break-words">{skill}</span>
      )}
    </span>
  );
}
