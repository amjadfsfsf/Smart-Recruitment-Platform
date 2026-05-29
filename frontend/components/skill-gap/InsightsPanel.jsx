import SkillChip from "./SkillChip";

export default function InsightsPanel({ improvementSummary, newlyAcquiredSkills, source }) {
  const sourceLabel = source === "local" 
    ? "Local recomputation from saved required skills" 
    : source === "database" 
      ? "Saved required skills from the database" 
      : "Fresh GPT required skills";

  return (
    <article className="dashboard-card flex h-full flex-col rounded-[1.5rem] border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold tracking-normal text-white">Improvement Insights</h3>
        <span className="premium-metric-badge rounded-full px-3 py-1 text-xs font-semibold">
          {sourceLabel}
        </span>
      </div>

      <p className="dashboard-subcard mb-6 rounded-2xl border p-4 text-sm leading-7 text-white/[0.68]">
        {improvementSummary}
      </p>

      {newlyAcquiredSkills && newlyAcquiredSkills.length > 0 ? (
        <div className="mt-auto">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-cyan-100/80">
            Newly Acquired Skills
          </h4>
          <div className="flex flex-wrap gap-2">
            {newlyAcquiredSkills.map((skill) => (
              <SkillChip key={skill} skill={skill} variant="success" />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-auto border-t border-white/[0.08] pt-4">
          <p className="text-sm italic text-white/[0.52]">No newly acquired skills detected since last analysis.</p>
        </div>
      )}
    </article>
  );
}
