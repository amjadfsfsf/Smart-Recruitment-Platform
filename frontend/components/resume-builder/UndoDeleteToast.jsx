"use client";

export default function UndoDeleteToast({
  open,
  sectionTitle = "",
  secondsRemaining = 10,
  pendingSectionKey = "",
  toastSectionKey = "",
  onUndo,
  onDismiss,
}) {
  if (!open) {
    return null;
  }

  const isPending = pendingSectionKey === toastSectionKey;

  return (
    <div className="dashboard-modal fixed bottom-5 right-5 z-50 w-full max-w-sm rounded-[28px] border p-4 no-print">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{sectionTitle} deleted</p>
          <p className="mt-1 text-sm text-white/[0.62]">
            Undo is available for {secondsRemaining} more second{secondsRemaining === 1 ? "" : "s"}.
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="premium-secondary-action rounded-full px-2.5 py-1 text-xs font-medium transition"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onUndo}
          disabled={Boolean(pendingSectionKey)}
          className="premium-action rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Restoring..." : "Undo Delete"}
        </button>
      </div>
    </div>
  );
}
