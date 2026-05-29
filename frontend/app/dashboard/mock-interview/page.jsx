"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import SectionHeader from "@/components/SectionHeader";
import { getCurrentUser } from "@/lib/api";
import { getToken } from "@/lib/auth";

const INTERVIEW_TYPES = [
  { value: "general", label: "General" },
  { value: "behavioral", label: "Behavioral" },
  { value: "technical", label: "Technical" },
  { value: "product", label: "Product / PM" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

export default function InterviewSetupPage() {
  const router = useRouter();
  const [interviewType, setInterviewType] = useState(INTERVIEW_TYPES[0].value);
  const [language, setLanguage] = useState("en");
  const [loadingPref, setLoadingPref] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadPreferredLanguage = async () => {
      setLoadingPref(true);
      setError("");
      try {
        const token = getToken();
        if (!token) {
          setLoadingPref(false);
          return;
        }
        const user = await getCurrentUser(token);
        if (user?.preferred_language) {
          setLanguage(user.preferred_language);
        }
      } catch (err) {
        setError(err?.message || "Could not load preferences");
      } finally {
        setLoadingPref(false);
      }
    };
    loadPreferredLanguage();
  }, []);

  const handleStart = () => {
    if (!language) {
      setError("Please choose an interview language.");
      return;
    }
    const params = new URLSearchParams({ interviewType, language });
    router.push(`/dashboard/interview/session?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="AI Interview"
        description="Select the interview type and start your live interview session."
        actions={
          <button
            type="button"
            onClick={handleStart}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Start
          </button>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
            <span>Interview Type</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value)}
            >
              {INTERVIEW_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
            <span>Interview Language</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={loadingPref}
            >
              {LANGUAGE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Your profile data (experience level, desired job title, target-role context, field of study, skills) will be
          used automatically during the interview.
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>
    </div>
  );
}
