"use client";

import ResumeDocumentPreview from "./ResumeDocumentPreview";
import TemplateRenderer from "./templates/TemplateRenderer";

export default function TemplatePreviewCard({
  template,
  selectedTemplateId,
  resumeData,
  sections,
  showPersonalInfo,
  compressionLevel,
  previewContainerId,
  onSelect,
}) {
  const isSelected = template.id === selectedTemplateId;
  const selectTemplate = () => onSelect(template.id);
  const handlePreviewKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTemplate();
    }
  };

  return (
    <article
      className={`resume-template-card group rounded-[1.55rem] border p-3.5 transition duration-300 ${
        isSelected ? "resume-template-card-selected" : ""
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={selectTemplate}
        onKeyDown={handlePreviewKeyDown}
        className="resume-template-preview-surface relative w-full cursor-pointer overflow-hidden rounded-[1.25rem] border p-3.5 text-left outline-none transition duration-300 focus-visible:ring-2 focus-visible:ring-cyan-300/35"
        aria-label={`Select ${template.label} resume template`}
      >
        <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full border border-white/[0.1] bg-[#0B1020]/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/[0.64] shadow-[0_14px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            Live PDF preview
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              isSelected
                ? "border-cyan-300/25 bg-cyan-400/12 text-cyan-100"
                : "border-white/[0.08] bg-white/[0.055] text-white/[0.56]"
            }`}
          >
            {isSelected ? "Active" : "Preview"}
          </span>
        </div>

        <ResumeDocumentPreview
          className="pointer-events-none"
          stageClassName="resume-template-document-page"
          maxScale={0.58}
          minScale={0.18}
          initialScale={0.4}
          horizontalInset={0}
        >
          <TemplateRenderer
            templateId={template.id}
            containerId={previewContainerId}
            resumeData={resumeData}
            sections={sections}
            showPersonalInfo={showPersonalInfo}
            compressionLevel={compressionLevel}
            renderMode="print"
            showShadow={false}
            className="pointer-events-none"
          />
        </ResumeDocumentPreview>

      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{template.label}</h3>
          <p className="mt-1 text-xs leading-5 text-white/[0.58]">{template.description}</p>
        </div>

        <button
          type="button"
          onClick={selectTemplate}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
            isSelected
              ? "premium-action"
              : "premium-secondary-action"
          }`}
        >
          {isSelected ? "Selected" : "Select"}
        </button>
      </div>
    </article>
  );
}
