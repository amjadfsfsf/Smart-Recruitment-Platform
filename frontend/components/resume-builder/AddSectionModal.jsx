"use client";

import { useEffect, useState } from "react";

export default function AddSectionModal({ open, availableBuiltInSections = [], onClose, onAddBuiltInSection, onAddCustomSection }) {
  const [customTitle, setCustomTitle] = useState("New Section");

  useEffect(() => {
    if (!open) {
      return;
    }

    setCustomTitle("New Section");
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="dashboard-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="dashboard-modal w-full max-w-3xl rounded-[32px] border p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Add Section</h2>
            <p className="mt-1 text-sm text-white/[0.62]">
              Add back a built-in resume section or create a brand-new custom section.
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

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="dashboard-subcard rounded-3xl border p-5">
            <h3 className="text-base font-semibold text-white">Built-in Sections</h3>
            <p className="mt-1 text-sm text-white/[0.58]">
              Add ATS-safe sections that are not currently on this resume.
            </p>

            <div className="mt-4 space-y-3">
              {availableBuiltInSections.length ? (
                availableBuiltInSections.map((section) => (
                  <button
                    key={section.id || section.type}
                    type="button"
                    onClick={() => onAddBuiltInSection(section)}
                    className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.045] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[0.07]"
                  >
                    <p className="text-sm font-semibold text-white">{section.title}</p>
                    <p className="mt-1 text-xs text-white/[0.52]">Add this section into the form, preview, and PDF.</p>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.04] px-4 py-3 text-sm text-white/[0.52]">
                  All built-in sections are already present.
                </p>
              )}
            </div>
          </section>

          <section className="dashboard-subcard rounded-3xl border p-5">
            <h3 className="text-base font-semibold text-white">Custom Section</h3>
            <p className="mt-1 text-sm text-white/[0.58]">
              Create a flexible section for awards, languages, volunteer work, or anything else.
            </p>

            <label htmlFor="custom-section-title" className="mt-4 block text-sm font-medium text-white/[0.78]">
              Section Title
            </label>
            <input
              id="custom-section-title"
              type="text"
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              className="dashboard-field mt-2 w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white/95 outline-none transition focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/20"
            />

            <button
              type="button"
              onClick={() => onAddCustomSection(customTitle)}
              className="premium-action mt-4 rounded-2xl px-5 py-2.5 text-sm font-semibold transition"
            >
              Add custom section
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
