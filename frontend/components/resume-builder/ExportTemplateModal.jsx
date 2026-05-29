"use client";

import { getResumeTemplate } from "@/lib/resumeBuilder";
import TemplatePreviewCard from "./TemplatePreviewCard";

export default function ExportTemplateModal({
  open,
  templates = [],
  selectedTemplateId,
  resumeData,
  sections = [],
  showPersonalInfo = true,
  compressionLevel = 0,
  loading = false,
  actionLabel = "Continue",
  onSelectTemplate,
  onContinue,
  onDownload,
  onClose,
}) {
  if (!open) {
    return null;
  }

  const selectedTemplate = getResumeTemplate(selectedTemplateId);

  return (
    <div className="dashboard-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="dashboard-modal max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-[32px] border p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Choose Resume Template</h2>
            <p className="mt-1 text-sm text-white/[0.62]">
              Preview every resume template, select the design you want, then continue so saving and PDF export use the same layout.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="premium-secondary-action rounded-2xl px-4 py-2 text-sm font-medium transition"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplatePreviewCard
              key={template.id}
              template={template}
              selectedTemplateId={selectedTemplateId}
              resumeData={resumeData}
              sections={sections}
              showPersonalInfo={showPersonalInfo}
              compressionLevel={compressionLevel}
              previewContainerId={`modal-template-preview-${template.id}`}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5">
          <div>
            <p className="text-sm font-semibold text-white">Selected template</p>
            <p className="mt-1 text-sm text-white/[0.58]">{selectedTemplate.label}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onClose}
              className="premium-secondary-action rounded-2xl px-4 py-2.5 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onContinue || onDownload}
              disabled={loading}
              className="premium-action inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Preparing...
                </>
              ) : (
                actionLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
