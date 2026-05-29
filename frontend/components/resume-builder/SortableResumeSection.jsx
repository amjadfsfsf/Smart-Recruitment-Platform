"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function SortableResumeSection({
  section,
  canDelete,
  onDelete,
  onToggleVisibility,
  deleteDisabled = false,
  children,
}) {
  const { id, title, visible } = section;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "opacity-85" : ""}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.48]">{title}</p>
          {!visible ? (
            <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/[0.58]">
              Hidden from preview
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleVisibility}
            className="premium-secondary-action rounded-full px-3 py-1 text-xs font-medium transition"
          >
            Eye {visible ? "Hide" : "Show"}
          </button>

          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteDisabled}
              className="premium-danger-action rounded-full px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          ) : null}

          <button
            type="button"
            className="premium-secondary-action rounded-full px-3 py-1 text-xs font-medium transition"
            {...attributes}
            {...listeners}
          >
            Move
          </button>
        </div>
      </div>
      <div className={visible ? "" : "opacity-80"}>{children}</div>
    </div>
  );
}
