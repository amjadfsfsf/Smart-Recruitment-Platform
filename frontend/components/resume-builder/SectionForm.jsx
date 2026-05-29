"use client";

import { Controller } from "react-hook-form";
import RewriteFieldAction from "./RewriteFieldAction";

const inputClassName =
  "dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15";

function getFieldError(errors, sectionName, index, fieldName) {
  return errors?.[sectionName]?.[index]?.[fieldName]?.message || "";
}

function canRewriteField(field) {
  if (field.rewriteable === false) {
    return false;
  }

  return field.type === "textarea" || !field.type || field.type === "text";
}

export default function SectionForm({
  title,
  description,
  name,
  fields,
  items,
  values = [],
  errors = {},
  control,
  setValue,
  onAdd,
  onRemove,
  addLabel = "Add entry",
  minItems = 1,
  badges = [],
  sectionError = "",
  onRewriteSuccess,
  onRewriteError,
}) {
  return (
    <section className="resume-editor-panel rounded-[1.5rem] border p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {badges.map((badge) => (
              <span
                key={`${title}-${badge.label}`}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  badge.tone === "sky"
                    ? "bg-sky-50 text-sky-700"
                    : badge.tone === "amber"
                      ? "border border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100"
                      : "border border-cyan-300/15 bg-cyan-400/10 text-cyan-100"
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>
          {description ? <p className="mt-1 text-sm leading-6 text-white/[0.62]">{description}</p> : null}
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="premium-secondary-action rounded-2xl px-3.5 py-2 text-sm font-semibold transition"
        >
          {addLabel}
        </button>
      </div>

      {sectionError ? (
        <p className="premium-status-danger mb-4 rounded-2xl border px-3 py-2 text-sm text-rose-100">{sectionError}</p>
      ) : null}

      <div className="space-y-4">
        {items.map((item, index) => {
          const itemValues = values?.[index] || {};

          return (
            <article key={item.id} className="resume-editor-item rounded-2xl border p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.5]">
                  {title} {index + 1}
                </h3>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={items.length <= minItems}
                  className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/[0.58] transition hover:border-red-300/25 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {fields.map((field) => {
                  if (field.hideWhen?.(itemValues)) {
                    return null;
                  }

                  const fieldName = `${name}.${index}.${field.name}`;
                  const errorMessage = getFieldError(errors, name, index, field.name);
                  const rules = typeof field.rules === "function" ? field.rules(index, itemValues) : field.rules;
                  const colSpanClass = field.fullWidth ? "md:col-span-2" : "";

                  if (field.type === "checkbox") {
                    return (
                      <div key={field.name} className={`flex items-center gap-3 ${colSpanClass}`}>
                        <Controller
                          name={fieldName}
                          control={control}
                          rules={rules}
                          defaultValue={Boolean(itemValues?.[field.name])}
                          render={({ field: controllerField }) => (
                            <input
                              id={fieldName}
                              type="checkbox"
                              checked={Boolean(controllerField.value)}
                              onChange={(event) => controllerField.onChange(event.target.checked)}
                              onBlur={controllerField.onBlur}
                              ref={controllerField.ref}
                                className="h-4 w-4 rounded border-white/20 bg-[#0A0F1C] text-[#A78BFA] focus:ring-[#A78BFA]"
                            />
                          )}
                        />
                        <label htmlFor={fieldName} className="text-sm font-medium text-white/[0.78]">
                          {field.label}
                        </label>
                      </div>
                    );
                  }

                  return (
                    <div key={field.name} className={colSpanClass}>
                      <Controller
                        name={fieldName}
                        control={control}
                        rules={rules}
                        defaultValue={itemValues?.[field.name] ?? ""}
                        render={({ field: controllerField }) => (
                          <>
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                              <label htmlFor={fieldName} className="block text-sm font-medium text-white/[0.78]">
                                {field.label}
                              </label>
                              {canRewriteField(field) ? (
                                <RewriteFieldAction
                                  value={controllerField.value ?? ""}
                                  onRewrite={(rewritten) => {
                                    if (setValue) {
                                      setValue(fieldName, rewritten, {
                                        shouldDirty: true,
                                        shouldTouch: true,
                                        shouldValidate: true,
                                      });
                                    } else {
                                      controllerField.onChange(rewritten);
                                    }
                                  }}
                                  successMessage={`${field.label} rewritten successfully.`}
                                  onSuccess={onRewriteSuccess}
                                  onError={onRewriteError}
                                  section={name}
                                  fieldName={field.name}
                                  fieldLabel={field.label}
                                />
                              ) : null}
                            </div>

                            {field.type === "textarea" ? (
                              <textarea
                                {...controllerField}
                                id={fieldName}
                                rows={field.rows || 4}
                                placeholder={field.placeholder}
                                value={controllerField.value || ""}
                                className={inputClassName}
                              />
                            ) : field.type === "select" ? (
                              <select
                                {...controllerField}
                                id={fieldName}
                                value={controllerField.value ?? ""}
                                className={inputClassName}
                              >
                                <option value="">{field.placeholder || `Select ${field.label}`}</option>
                                {(field.options || []).map((option) => {
                                  const optionValue = typeof option === "string" ? option : option?.value || "";
                                  const optionLabel = typeof option === "string" ? option : option?.label || optionValue;

                                  return (
                                    <option key={optionValue} value={optionValue}>
                                      {optionLabel}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <input
                                {...controllerField}
                                id={fieldName}
                                type={field.type || "text"}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                inputMode={field.inputMode}
                                placeholder={field.placeholder}
                                value={controllerField.value ?? ""}
                                onBlur={field.trim ? () => {
                                  const trimmed = (controllerField.value || "").trim();
                                  if (trimmed !== controllerField.value) controllerField.onChange(trimmed);
                                  controllerField.onBlur();
                                } : controllerField.onBlur}
                                className={inputClassName}
                              />
                            )}
                          </>
                        )}
                      />

                      {field.helperText ? <p className="mt-1 text-xs text-white/[0.5]">{field.helperText}</p> : null}
                      {errorMessage ? <p className="mt-1.5 text-xs text-rose-200">{errorMessage}</p> : null}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
