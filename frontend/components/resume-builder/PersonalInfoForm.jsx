"use client";

import { Controller, useFieldArray } from "react-hook-form";

import { EMAIL_PATTERN, PHONE_PATTERN, isHttpUrl } from "@/lib/resumeBuilder";

const inputClassName =
  "dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15";

function ControlledInput({
  name,
  control,
  rules,
  type = "text",
  placeholder,
  inputMode,
  label,
  errorMessage = "",
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-white/[0.78]">
        {label}
      </label>
      <Controller
        name={name}
        control={control}
        rules={rules}
        defaultValue=""
        render={({ field }) => (
          <input
            {...field}
            id={name}
            type={type}
            inputMode={inputMode}
            placeholder={placeholder}
            value={field.value || ""}
            className={inputClassName}
          />
        )}
      />
      {errorMessage ? <p className="mt-1.5 text-xs text-rose-200">{errorMessage}</p> : null}
    </div>
  );
}

export default function PersonalInfoForm({ control, errors = {}, actions = null }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "personalInfo.links",
  });

  return (
    <section className="resume-editor-panel rounded-[1.5rem] border p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Personal Information</h2>
          <p className="mt-1 text-sm text-white/[0.58]">
            When active, this block appears at the top of the live ATS preview and exported PDF.
          </p>
        </div>
        {actions}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ControlledInput
          name="personalInfo.fullName"
          control={control}
          label="Full Name"
          placeholder="Jane Doe"
          rules={{ required: "Full name is required." }}
          errorMessage={errors?.personalInfo?.fullName?.message || errors?.fullName?.message || ""}
        />

        <ControlledInput
          name="personalInfo.email"
          control={control}
          label="Email"
          type="email"
          placeholder="jane@email.com"
          rules={{
            required: "Email is required.",
            pattern: {
              value: EMAIL_PATTERN,
              message: "Enter a valid email address.",
            },
          }}
          errorMessage={errors?.personalInfo?.email?.message || errors?.email?.message || ""}
        />

        <ControlledInput
          name="personalInfo.phone"
          control={control}
          label="Phone Number"
          type="tel"
          placeholder="+1 555 010 2345"
          rules={{
            required: "Phone number is required.",
            pattern: {
              value: PHONE_PATTERN,
              message: "Enter a valid phone number.",
            },
          }}
          errorMessage={errors?.personalInfo?.phone?.message || errors?.phone?.message || ""}
        />

        <ControlledInput
          name="personalInfo.location"
          control={control}
          label="City / Country"
          placeholder="Amman, Jordan"
          rules={{ required: "City / Country is required." }}
          errorMessage={errors?.personalInfo?.location?.message || errors?.location?.message || ""}
        />

        <div className="md:col-span-2 mt-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/[0.78]">Links</h3>
            <button
              type="button"
              onClick={() => append({ label: "", url: "" })}
              className="text-sm font-semibold text-[#DDD6FE] transition hover:text-white"
            >
              + Add Link
            </button>
          </div>
          
          <div className="grid gap-3">
            {fields.map((field, index) => {
              const linkError = errors?.personalInfo?.links?.[index]?.url?.message || errors?.links?.[index]?.url?.message;
              
              return (
                <div key={field.id} className="flex flex-col sm:flex-row gap-3">
                  <div className="w-full sm:w-1/3">
                    <Controller
                      name={`personalInfo.links.${index}.label`}
                      control={control}
                      defaultValue={field.label}
                      render={({ field: inputField }) => (
                        <input
                          {...inputField}
                          type="text"
                          placeholder="Label (e.g. GitHub)"
                          className={inputClassName}
                        />
                      )}
                    />
                  </div>
                  <div className="w-full sm:w-flex-1 flex gap-2">
                    <div className="flex-1">
                      <Controller
                        name={`personalInfo.links.${index}.url`}
                        control={control}
                        defaultValue={field.url}
                        rules={{
                          validate: (value) =>
                            !value || isHttpUrl(value) || "Must be a valid URL starting with http:// or https://",
                        }}
                        render={({ field: inputField }) => (
                          <input
                            {...inputField}
                            type="url"
                            placeholder="URL"
                            className={inputClassName}
                          />
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-white/[0.48] transition hover:border-red-300/25 hover:bg-red-500/10 hover:text-red-100"
                      title="Remove Link"
                    >
                      x
                    </button>
                  </div>
                  {linkError ? <p className="mt-1.5 text-xs text-rose-200 sm:hidden">{linkError}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
