import { Tag } from "@/components/ui/DashboardUI";

const VARIANT_MAP = {
  default: "slate",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "slate",
  semantic: "accent",
};

export default function SkillChip({ skill, variant = "default", tooltip = "", trailing = null }) {
  if (!skill) return null;

  return (
    <Tag variant={VARIANT_MAP[variant] || "slate"} className="gap-1.5 py-1.5 text-xs capitalize" title={tooltip || undefined}>
      <span>{skill}</span>
      {trailing}
    </Tag>
  );
}

