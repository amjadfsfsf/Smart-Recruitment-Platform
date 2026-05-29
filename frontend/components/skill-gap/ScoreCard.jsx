export default function ScoreCard({ score, previousScore, scoreDelta, totalMissing }) {
  const animatedWidth = `${score}%`;
  
  const formattedDelta = (() => {
    if (scoreDelta === null) return "No baseline";
    if (scoreDelta === 0) return "0 pts";
    const absolute = Math.abs(scoreDelta);
    const formatted = Number.isInteger(absolute) ? absolute : absolute.toFixed(1);
    return `${scoreDelta > 0 ? "+" : "-"}${formatted} pts`;
  })();

  const deltaColor =
    scoreDelta > 0
      ? "premium-status-success"
      : scoreDelta < 0
        ? "premium-status-danger"
        : "border-white/[0.08] bg-white/[0.06] text-white/[0.62]";

  return (
    <article className="dashboard-card flex h-full flex-col justify-between rounded-[1.5rem] border p-6">
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.52]">Match Score</p>
            <h3 className="mt-3 text-6xl font-bold tracking-normal text-white">{score}%</h3>
          </div>
          
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${deltaColor}`}>
            {formattedDelta}
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-white/[0.68]">
            <span>Skill Alignment</span>
            <span>{score}%</span>
          </div>
          <div className="premium-progress-track h-4 w-full rounded-full">
            <div
              className="premium-progress-fill h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: animatedWidth }}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-8 flex items-center justify-between border-t border-white/[0.08] pt-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/[0.5]">Total Missing</p>
          <p className="mt-1 text-xl font-semibold text-white">{totalMissing} Skills</p>
        </div>
      </div>
    </article>
  );
}
