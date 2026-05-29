import SkillChip from "./SkillChip";

export default function MatchedSkillsSection({ exactMatches = [], semanticMatches = [] }) {
  const exactCount = exactMatches.length;
  const semanticCount = semanticMatches.length;

  if (exactCount === 0 && semanticCount === 0) {
    return null;
  }

  return (
    <section className="dashboard-card rounded-[1.5rem] border p-6">
      <div className="mb-6 border-b border-white/[0.08] pb-4">
        <h3 className="text-xl font-semibold tracking-normal text-white">Matched Skills</h3>
        <p className="mt-2 text-sm leading-6 text-white/[0.62]">
          Skills already covered by your profile, split into exact matches and AI-detected semantic matches.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wide text-cyan-100/80">
              Exact Matches
            </span>
            <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-0.5 text-xs font-bold text-cyan-100">
              {exactCount}
            </span>
          </div>
          <div className="dashboard-subcard flex-1 rounded-2xl border p-4">
            {exactCount > 0 ? (
              <div className="flex flex-wrap gap-2">
                {exactMatches.map((skill) => (
                  <SkillChip key={`exact-${skill}`} skill={skill} variant="success" />
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-white/[0.45]">No exact matches yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wide text-fuchsia-100/80">
              Semantic Matches
            </span>
            <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-400/10 px-2.5 py-0.5 text-xs font-bold text-fuchsia-100">
              {semanticCount}
            </span>
          </div>
          <div className="dashboard-subcard flex-1 rounded-2xl border p-4">
            {semanticCount > 0 ? (
              <div className="flex flex-wrap gap-2">
                {semanticMatches.map((entry) => {
                  const similarityPct = Math.round((entry.similarity || 0) * 100);
                  const tooltip = entry.matchedWith
                    ? `Matched with "${entry.matchedWith}" - similarity ${similarityPct}%`
                    : `Similarity ${similarityPct}%`;
                  return (
                    <SkillChip
                      key={`semantic-${entry.skill}`}
                      skill={entry.skill}
                      variant="semantic"
                      tooltip={tooltip}
                      trailing={
                        <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-100">
                          {similarityPct}%
                        </span>
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm italic text-white/[0.45]">
                No semantic matches detected.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
