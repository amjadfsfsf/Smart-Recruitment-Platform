"use client";

import { getResumeTemplate } from "@/lib/resumeBuilder";
import ResumeDocumentPreview from "./ResumeDocumentPreview";
import TemplateRenderer from "./templates/TemplateRenderer";

export default function ResumePreview({
  resumeData,
  aiGenerated,
  optimizedSections,
  previewRef,
  completionIssues = [],
  selectedTemplateId,
  sections = [],
  showPersonalInfo = true,
  compressionLevel = 0,
  compressionLabel = "Standard fit",
  hasOverflow = false,
}) {
  const template = getResumeTemplate(selectedTemplateId);
  const templateBadges = [];

  if (Object.values(aiGenerated || {}).some(Boolean)) {
    templateBadges.push({ label: "AI Generated", tone: "emerald" });
  }

  if (Object.values(optimizedSections || {}).some(Boolean)) {
    templateBadges.push({ label: "Optimized for Job", tone: "sky" });
  }

  templateBadges.push({
    label: hasOverflow ? "Needs more trimming" : compressionLabel,
    tone: hasOverflow ? "violet" : compressionLevel > 0 ? "slate" : "cyan",
  });

  const templateProps = {
    resumeData,
    previewRef,
    sections,
    showPersonalInfo,
    containerId: "cv-preview",
    compressionLevel,
    renderMode: "print",
  };

  return (
    <div className="resume-preview-shell rounded-[1.85rem] border p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/[0.56]">
            PDF-grade web preview
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Live ATS Preview</p>
          <p className="mt-1 text-xs leading-5 text-white/[0.58]">
            {template.label} template - single column - export uses this exact layout.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {templateBadges.map((badge) => (
            <span
              key={badge.label}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                badge.tone === "sky"
                  ? "border border-sky-300/15 bg-sky-400/10 text-sky-100"
                  : badge.tone === "violet"
                    ? "border border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100"
                  : badge.tone === "slate"
                      ? "border border-white/[0.08] bg-white/[0.07] text-white/[0.7]"
                      : "border border-cyan-300/15 bg-cyan-400/10 text-cyan-100"
              }`}
            >
              {badge.label}
            </span>
          ))}
          {completionIssues.length ? (
            <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-100">
              {completionIssues.length} validation gap{completionIssues.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              Ready for PDF
            </span>
          )}
        </div>
      </div>

      <div className="resume-paper-stage dashboard-scrollbar rounded-[1.45rem] p-4">
        <ResumeDocumentPreview
          className="resume-live-document-viewport"
          stageClassName="resume-live-document-page"
          maxScale={1}
          minScale={0.28}
          initialScale={0.72}
          horizontalInset={8}
        >
          <TemplateRenderer templateId={selectedTemplateId} {...templateProps} showShadow={false} />
        </ResumeDocumentPreview>
      </div>
    </div>
  );
}
