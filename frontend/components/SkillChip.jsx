"use client";

import { Tag } from "@/components/ui/DashboardUI";

const TYPE_TO_VARIANT = {
  technical: "slate",
  tool: "accent",
  soft: "success",
  neutral: "neutral",
};

export default function SkillChip({ label, type = "technical", onRemove }) {
  if (!label) return null;

  const removable = typeof onRemove === "function";

  return (
    <Tag variant={TYPE_TO_VARIANT[type] || "slate"} className="gap-1.5 py-1.5 text-xs">
      <span>{label}</span>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full text-current/70 transition hover:text-current"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      ) : null}
    </Tag>
  );
}

