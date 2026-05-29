"use client";

import TemplatePreviewCard from "./TemplatePreviewCard";

export default function TemplateSwitcher({
  templates = [],
  selectedTemplateId,
  onChange,
  compactMode = false,
  onToggleCompactMode,
  showTemplates = true,
  onToggleVisibility,
  resumeData,
  sections = [],
  showPersonalInfo = true,
  compressionLevel = 0,
}) {
  return (
    <section className="resume-editor-panel rounded-[1.7rem] border p-4 no-print">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/10 bg-cyan-300/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
            Template studio
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Choose Template</p>
          <p className="mt-1 text-xs leading-5 text-white/[0.62]">
            Compare realistic paper previews before saving or exporting the final PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleVisibility?.(!showTemplates)}
            className="premium-secondary-action rounded-full px-3 py-1.5 text-xs font-semibold transition"
          >
            {showTemplates ? "Hide Templates" : "Show Templates"}
          </button>

          <button
            type="button"
            onClick={() => onToggleCompactMode?.(!compactMode)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              compactMode
                ? "premium-action"
                : "premium-secondary-action"
            }`}
          >
            Compact Mode {compactMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ${showTemplates ? "mt-4 max-h-[6200px] opacity-100" : "mt-0 max-h-0 opacity-0"}`}
      >
        <div className="grid gap-5">
          {templates.map((template) => (
            <TemplatePreviewCard
              key={template.id}
              template={template}
              selectedTemplateId={selectedTemplateId}
              resumeData={resumeData}
              sections={sections}
              showPersonalInfo={showPersonalInfo}
              compressionLevel={compressionLevel}
              previewContainerId={`switcher-template-preview-${template.id}`}
              onSelect={onChange}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
