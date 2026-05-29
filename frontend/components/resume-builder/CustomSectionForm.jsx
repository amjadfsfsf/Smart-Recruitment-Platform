"use client";

import { Controller } from "react-hook-form";
import RewriteFieldAction from "./RewriteFieldAction";

export default function CustomSectionForm({
  section,
  fieldName,
  control,
  setValue,
  titleErrorMessage = "",
  errorMessage = "",
  onTitleChange,
  onRewriteSuccess,
  onRewriteError,
}) {
  return (
    <section className="resume-editor-panel rounded-[1.5rem] border p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">{section.title || "Custom Section"}</h2>
        <p className="mt-1 text-sm leading-6 text-white/[0.62]">
          Use this section for awards, languages, volunteer work, publications, or other ATS-safe content.
        </p>
      </div>

      <div className="grid gap-4">
        <div>
          <label htmlFor={`${section.id}-title`} className="mb-1.5 block text-sm font-medium text-white/[0.78]">
            Title
          </label>
          <input
            id={`${section.id}-title`}
            type="text"
            value={section.title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15"
          />
          {titleErrorMessage ? <p className="mt-1.5 text-xs text-rose-200">{titleErrorMessage}</p> : null}
        </div>

        <div>
          <Controller
            name={fieldName}
            control={control}
            rules={{
              validate: (value) =>
                !section.visible || String(value || "").trim().length > 0 || "Content is required for visible custom sections.",
            }}
            defaultValue=""
            render={({ field }) => (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor={`${section.id}-content`} className="block text-sm font-medium text-white/[0.78]">
                    Content
                  </label>
                  <RewriteFieldAction
                    value={field.value || ""}
                    onRewrite={(rewritten) => {
                      if (setValue) {
                        setValue(fieldName, rewritten, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        });
                      } else {
                        field.onChange(rewritten);
                      }
                    }}
                    successMessage={`${section.title || "Custom section"} content rewritten successfully.`}
                    onSuccess={onRewriteSuccess}
                    onError={onRewriteError}
                    section="custom"
                    fieldName="content"
                    fieldLabel={section.title || "Custom section content"}
                  />
                </div>
                <textarea
                  {...field}
                  id={`${section.id}-content`}
                  rows={5}
                  placeholder="Add one bullet or short statement per line."
                  value={field.value || ""}
                  className="dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm leading-6 text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15"
                />
              </>
            )}
          />
          <p className="mt-1 text-xs text-white/[0.46]">
            Each line becomes a clean ATS-friendly bullet point in the preview and PDF.
          </p>
          {errorMessage ? <p className="mt-1.5 text-xs text-rose-200">{errorMessage}</p> : null}
        </div>
      </div>
    </section>
  );
}
