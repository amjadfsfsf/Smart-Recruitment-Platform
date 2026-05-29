"use client";

export default function ConfirmSectionDeleteModal({
  open,
  sectionTitle = "",
  isPending = false,
  onCancel,
  onConfirm,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="dashboard-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="dashboard-modal w-full max-w-lg rounded-[32px] border p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">Soft delete</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Delete {sectionTitle}?</h2>
        <p className="mt-3 text-sm leading-6 text-white/[0.62]">
          This removes the section from the form, preview, and PDF right away, but keeps the data safe in the database.
          You can undo the delete for 10 seconds if you change your mind.
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="premium-secondary-action rounded-2xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="premium-danger-action rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Deleting..." : "Delete Section"}
          </button>
        </div>
      </div>
    </div>
  );
}
