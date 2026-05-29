"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import SkillPicker from "@/components/SkillPicker";
import { parseCv, searchSkills, signUp } from "@/lib/api";
import { getDashboardPath, getToken } from "@/lib/auth";

const educationOptions = ["High School", "Diploma", "Bachelor", "Master", "PhD"];
const experienceOptions = ["Entry-Level", "Junior", "Mid-Level", "Senior"];

function normalizeSkillList(input) {
  const seen = new Set();
  const cleaned = [];

  (input || []).forEach((item) => {
    const name =
      typeof item === "string"
        ? item
        : item?.skill_name || item?.name || "";
    const trimmed = (name || "").trim().replace(/\s+/g, " ");
    if (!trimmed) return;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push({ skill_name: trimmed });
  });

  return cleaned;
}

export default function SignupPage() {
  const router = useRouter();

  const [step, setStep] = useState("choose"); // choose | upload | form
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    education_level: "",
    experience_level: "",
    desired_job_title: "",
    target_role: "",
    field_of_study: "",
  });
  const [skills, setSkills] = useState(() => normalizeSkillList([]));
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [parseError, setParseError] = useState("");
  const [cvFile, setCvFile] = useState(null);
  const [parsedMeta, setParsedMeta] = useState({ skills: [], summary: "" });
  const [infoMessage, setInfoMessage] = useState("");

  const fetchSkillSuggestions = useCallback(async (text) => {
    try {
      return await searchSkills(text);
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      router.replace(getDashboardPath());
    }
  }, [router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    const trimmedFieldOfStudy = form.field_of_study.trim();
    if (!trimmedFieldOfStudy) {
      setError("Field of study is required");
      return;
    }

    const trimmedDesiredJobTitle = form.desired_job_title.trim();
    if (!trimmedDesiredJobTitle) {
      setError("Desired job title is required");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const cleanedSkills = [];
    const seen = new Set();
    for (const skill of skills) {
      const name = (skill.skill_name || "").trim().replace(/\s+/g, " ");
      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        setError("Duplicate skills are not allowed");
        return;
      }
      seen.add(key);
      cleanedSkills.push({ skill_name: name });
    }

    if (!cleanedSkills.length) {
      setError("Please add at least one skill");
      return;
    }

    setLoading(true);

    try {
      await signUp({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        confirm_password: form.confirmPassword,
        education_level: form.education_level,
        experience_level: form.experience_level,
        desired_job_title: trimmedDesiredJobTitle,
        target_role: form.target_role.trim(),
        field_of_study: trimmedFieldOfStudy,
        skills: cleanedSkills,
      });

      router.push("/login");
    } catch (submitError) {
      setError(submitError.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setParseError("Only PDF files are supported.");
      setCvFile(null);
      return;
    }
    setCvFile(file || null);
    setParseError("");
  };

  const handleUpload = async () => {
    if (!cvFile) {
      setParseError("Please choose a PDF file first.");
      return;
    }
    setParsing(true);
    setParseError("");
    setError("");
    setInfoMessage("");

    try {
      const data = await parseCv(cvFile);
      setForm((prev) => ({
        ...prev,
        full_name: data.full_name || prev.full_name,
        email: data.email || prev.email,
        education_level: data.education_level || prev.education_level,
        experience_level: data.experience_level || prev.experience_level,
        desired_job_title: data.desired_job_title || prev.desired_job_title,
        target_role: data.target_role || prev.target_role,
      }));

      setParsedMeta({
        skills: Array.isArray(data.skills) ? data.skills : [],
        summary: data.summary || "",
      });

      setSkills(normalizeSkillList(data.skills));

      setInfoMessage("We pre-filled your details from the CV. Please review and add your password.");
      setStep("form");
    } catch (uploadErr) {
      setParseError(uploadErr.message || "Unable to parse CV. Please try again or fill manually.");
    } finally {
      setParsing(false);
    }
  };

  const showPreview = parsedMeta.skills.length > 0 || parsedMeta.summary;

  return (
    <main className="auth-shell dark-grid-overlay min-h-screen bg-hero-pattern">
      <header className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold text-slateplus">
            Smart Recruitment Platform
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-brand-200"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-14 pt-10">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-600">Sign up</p>
            <h1 className="text-3xl font-semibold text-slateplus">Get started with Smart Recruitment Platform</h1>
            <p className="text-sm text-slate-500">Choose how you want to begin your onboarding.</p>
          </div>
          <p className="text-sm text-slate-500">Step {step === "choose" ? "1" : "2"} of 2</p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            {step === "choose" ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-smooth">
                <h2 className="text-lg font-semibold text-slateplus">Choose your onboarding path</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Upload your CV for auto-fill or enter your details manually.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setStep("upload")}
                    className="h-full rounded-2xl border border-slate-200 bg-mist px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200"
                  >
                    <div className="text-sm font-semibold text-slateplus">Upload CV</div>
                    <p className="mt-2 text-sm text-slate-500">We will extract your details and pre-fill the form.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("form")}
                    className="h-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200"
                  >
                    <div className="text-sm font-semibold text-slateplus">Enter manually</div>
                    <p className="mt-2 text-sm text-slate-500">Fill out the form yourself—no upload needed.</p>
                  </button>
                </div>
              </div>
            ) : null}

            {step === "upload" ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-smooth">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slateplus">Upload your CV (PDF)</h2>
                  <button
                    type="button"
                    onClick={() => setStep("choose")}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Back to options
                  </button>
                </div>
                <p className="mt-1 text-sm text-slate-500">We only accept PDF files for accurate parsing.</p>

                <div className="mt-5 flex flex-col gap-3">
                  <label
                    htmlFor="cvFile"
                    className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-brand-200 bg-mist px-4 py-4 text-sm font-medium text-slate-700 hover:border-brand-300"
                  >
                    <div className="flex flex-col">
                      <span>{cvFile ? cvFile.name : "Choose a PDF to upload"}</span>
                      <span className="text-xs font-normal text-slate-500">Max 10MB • PDF only</span>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600">Browse</span>
                  </label>
                  <input id="cvFile" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />

                  {parseError ? (
                    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{parseError}</p>
                  ) : null}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={parsing}
                      className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                    >
                      {parsing ? "Parsing CV..." : "Upload & Extract"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("form")}
                      className="text-sm font-medium text-slate-600 hover:text-slateplus"
                    >
                      Skip and fill manually
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {step === "form" ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-smooth">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slateplus">Create your account</h2>
                  <button
                    type="button"
                    onClick={() => setStep("choose")}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Change option
                  </button>
                </div>
                <p className="mt-1 text-sm text-slate-500">Review your details and set a password to continue.</p>
                {infoMessage ? (
                  <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{infoMessage}</p>
                ) : null}

                <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="full_name">
                      Full Name
                    </label>
                    <input
                      id="full_name"
                      type="text"
                      required
                      value={form.full_name}
                      onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="education_level">
                      Education Level
                    </label>
                    <select
                      id="education_level"
                      required
                      value={form.education_level}
                      onChange={(event) => setForm({ ...form, education_level: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    >
                      <option value="">Select education level</option>
                      {educationOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="experience_level">
                      Experience Level
                    </label>
                    <select
                      id="experience_level"
                      required
                      value={form.experience_level}
                      onChange={(event) => setForm({ ...form, experience_level: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    >
                      <option value="">Select experience level</option>
                      {experienceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="field_of_study">
                      Field of Study
                    </label>
                    <input
                      id="field_of_study"
                      type="text"
                      required
                      value={form.field_of_study}
                      onChange={(event) => setForm({ ...form, field_of_study: event.target.value })}
                      placeholder="e.g. Computer Science"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="desired_job_title">
                      Desired Job Title
                    </label>
                    <input
                      id="desired_job_title"
                      type="text"
                      required
                      value={form.desired_job_title}
                      onChange={(event) => setForm({ ...form, desired_job_title: event.target.value })}
                      placeholder="e.g. Data Scientist"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="target_role">
                      Target Role
                    </label>
                    <textarea
                      id="target_role"
                      rows={4}
                      value={form.target_role}
                      onChange={(event) => setForm({ ...form, target_role: event.target.value })}
                      placeholder="Describe the kind of work, focus area, or career direction you want to pursue."
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                    <p className="mt-1 text-xs text-slate-500">Optional career description for richer recommendations.</p>
                  </div>

                  <div className="md:col-span-2">
                    <SkillPicker
                      label="Skills"
                      helperText="Search existing skills or press Enter to add a custom one. Duplicates are prevented automatically."
                      placeholder="e.g. Python, React, Data Analysis"
                      selectedSkills={skills}
                      onSelectedChange={setSkills}
                      fetchSuggestions={fetchSkillSuggestions}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      required
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
                      Confirm Password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      required
                      value={form.confirmPassword}
                      onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>

                  {error ? (
                    <div className="md:col-span-2">
                      <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
                    </div>
                  ) : null}

                  <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-slate-500">
                      By signing up you agree to our{" "}
                      <span className="font-medium text-slateplus">Terms</span> and{" "}
                      <span className="font-medium text-slateplus">Privacy Policy</span>.
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                    >
                      {loading ? "Creating account..." : "Finish sign up"}
                    </button>
                  </div>
                </form>

                <p className="mt-5 text-sm text-slate-500">
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
                    Login
                  </Link>
                </p>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-smooth">
              <h3 className="text-base font-semibold text-slateplus">What happens next</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>• Choose to upload your CV or fill the form manually.</li>
                <li>• We never set your password from the CV—only you type it.</li>
                <li>• Review extracted details before creating your account.</li>
              </ul>
            </div>

            {showPreview ? (
              <div className="rounded-3xl border border-brand-100 bg-mist p-6 shadow-smooth">
                <h3 className="text-base font-semibold text-slateplus">Extracted from your CV</h3>
                {parsedMeta.summary ? (
                  <p className="mt-3 text-sm text-slate-600">{parsedMeta.summary}</p>
                ) : null}
                {parsedMeta.skills.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {parsedMeta.skills.slice(0, 24).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-smooth">
                <h3 className="text-base font-semibold text-slateplus">Tips for better parsing</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>• Use a recent PDF with clear section headings (Summary, Skills, Experience).</li>
                  <li>• Keep your contact info visible on the first page.</li>
                  <li>• You can always adjust fields after we auto-fill them.</li>
                </ul>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
