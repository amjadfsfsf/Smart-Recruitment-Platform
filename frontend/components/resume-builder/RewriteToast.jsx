"use client";

export default function RewriteToast({ open, message = "", onDismiss }) {
  if (!open || !message) {
    return null;
  }

  return (
    <div className="dashboard-modal fixed bottom-5 left-5 z-50 w-full max-w-sm rounded-[28px] border p-4 no-print">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#DDD6FE]">Rewrite complete</p>
          <p className="mt-1 text-sm text-white/[0.62]">{message}</p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="premium-secondary-action rounded-full px-2.5 py-1 text-xs font-medium transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
