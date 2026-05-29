"use client";

function formatSavedAt(value) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (_error) {
    return value;
  }
}

export default function SavedResumeVersionsPanel({
  draftName,
  versions = [],
  onDraftNameChange,
  onSave,
  onLoad,
  onDelete,
}) {
  return (
    <section className="resume-editor-panel rounded-[1.6rem] border p-4 no-print">
      <div>
        <p className="text-sm font-semibold text-white">Resume Versions</p>
        <p className="mt-1 text-xs leading-5 text-white/[0.58]">
          Save multiple drafts locally and switch between them without losing your current work.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={draftName}
          onChange={(event) => onDraftNameChange(event.target.value)}
          placeholder="Version name"
          className="dashboard-field flex-1 rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15"
        />
        <button
          type="button"
          onClick={onSave}
          className="premium-secondary-action rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
        >
          Save current version
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {versions.length ? (
          versions.map((version) => (
            <div key={version.id} className="dashboard-subcard rounded-2xl border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{version.name}</p>
                  <p className="mt-1 text-xs text-white/[0.54]">
                    {version.templateLabel} - Saved {formatSavedAt(version.savedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onLoad(version.id)}
                    className="premium-secondary-action rounded-2xl px-3 py-2 text-sm font-medium transition"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(version.id)}
                    className="premium-danger-action rounded-2xl px-3 py-2 text-sm font-medium transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-white/[0.08] bg-white/[0.045] px-4 py-3 text-sm text-white/[0.56]">
            No saved resume versions yet.
          </p>
        )}
      </div>
    </section>
  );
}
