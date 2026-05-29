"use client";

const PRIORITY_LEVELS = ["HIGH", "MEDIUM", "LOW"];

const PRIORITY_META = {
  HIGH: {
    title: "High",
    description: "Critical gaps to close first for this role.",
    cardClassName: "premium-status-danger",
    countClassName: "border border-rose-300/15 bg-rose-500/10 text-rose-100",
    skillClassName: "border-rose-300/15 bg-rose-500/10 text-rose-100",
  },
  MEDIUM: {
    title: "Medium",
    description: "Important skills that will strengthen role readiness.",
    cardClassName: "premium-status-warning",
    countClassName: "border border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100",
    skillClassName: "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100",
  },
  LOW: {
    title: "Low",
    description: "Helpful skills that can further round out the profile.",
    cardClassName: "premium-status-success",
    countClassName: "border border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
    skillClassName: "border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
  },
};

function normalizeSkills(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map();

  value.forEach((skill) => {
    const label = String(skill || "").trim();
    if (!label) {
      return;
    }

    const key = label.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, label);
    }
  });

  return Array.from(deduped.values());
}

export default function SkillPriorityBenchmark({ data }) {
  const groups = PRIORITY_LEVELS.map((level) => ({
    level,
    skills: normalizeSkills(data?.[level] || data?.[level.toLowerCase()]),
  })).filter((group) => group.skills.length);

  const totalMissingSkills = groups.reduce((total, group) => total + group.skills.length, 0);

  return (
    <article className="dashboard-card rounded-[1.5rem] border p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold tracking-normal text-white">Skill Priority Benchmark</h3>
          <p className="mt-2 text-sm leading-6 text-white/[0.62]">
            Only priority skill gaps are grouped by level. Empty groups stay hidden.
          </p>
        </div>
        <span className="premium-metric-badge rounded-full px-3 py-1 text-xs font-semibold">
          {totalMissingSkills} missing
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {groups.length ? (
          groups.map((group) => {
            const meta = PRIORITY_META[group.level];

            return (
              <section
                key={group.level}
                className={`rounded-2xl border p-4 ${meta.cardClassName}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{meta.title}</h4>
                    <p className="mt-1 text-sm text-white/[0.64]">{meta.description}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.countClassName}`}
                  >
                    {group.skills.length}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {group.skills.map((skill) => (
                    <span
                      key={`${group.level}-${skill}`}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${meta.skillClassName}`}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <div className="premium-status-success rounded-2xl border p-4 text-sm">
            No priority gaps were identified for this analysis.
          </div>
        )}
      </div>
    </article>
  );
}
