"use client";

const TITLE_MAP = {
  balanced: "General",
  impact: "Results",
  technical: "Tools",
};

const SUBTITLE_MAP = {
  balanced: "Balanced",
  impact: "Impact-driven",
  technical: "Technical",
};

export default function SummaryOptionCard({ option, selected, onSelect, onUse }) {
  const title = TITLE_MAP[option?.id] || option?.label || "Summary";
  const subtitle = SUBTITLE_MAP[option?.id] || option?.tone || "";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`rounded-[1.35rem] border p-4 text-left transition ${
        selected
          ? "dashboard-card border-cyan-300/25 ring-1 ring-cyan-300/20"
          : "dashboard-subcard border-white/[0.08] hover:border-white/[0.16]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {option?.optimized ? (
              <span className="rounded-full border border-sky-300/15 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100">
                Job aligned
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/[0.46]">{subtitle}</p>
        </div>
        {selected ? (
          <span className="premium-metric-badge rounded-full px-2.5 py-1 text-[11px] font-semibold">Selected</span>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-6 text-white/[0.68]">{option?.summary}</p>

      {option?.keywordsUsed?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {option.keywordsUsed.slice(0, 4).map((keyword) => (
            <span key={`${option.id}-${keyword}`} className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/[0.66]">
              {keyword}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.();
          }}
          className={`rounded-2xl border px-3.5 py-2 text-sm font-medium transition ${
            selected
              ? "premium-secondary-action"
              : "premium-secondary-action"
          }`}
        >
          {selected ? "Selected" : "Select"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onUse?.();
          }}
          className="premium-action rounded-2xl px-4 py-2 text-sm font-semibold transition"
        >
          Use this
        </button>
      </div>
    </article>
  );
}
