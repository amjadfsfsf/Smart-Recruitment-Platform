"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import SectionHeader from "@/components/SectionHeader";
import { acceptCompanyInterview, getCandidateCompanyInterviews } from "@/lib/api";
import { getToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const statusStyles = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  accepted: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  reviewed: "bg-purple-50 text-purple-700 ring-purple-200",
};

function statusLabel(status) {
  return (status || "pending").replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CompanyInterviewsPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");

  const loadInterviews = async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const data = await getCandidateCompanyInterviews(token);
      setInterviews(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load company interviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInterviews();
  }, []);

  const handleAccept = async (interview) => {
    setWorkingId(interview.id);
    setError("");
    try {
      const token = getToken();
      await acceptCompanyInterview(token, interview.id);
      await loadInterviews();
    } catch (err) {
      setError(err.message || "Could not accept interview");
    } finally {
      setWorkingId(null);
    }
  };

  const handleStart = (interview) => {
    router.push(`/dashboard/interview/session?companyInterviewId=${interview.id}`);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Company Interviews"
        description="Review interview invitations from companies and complete custom interview sessions."
      />

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          Loading interview invitations...
        </div>
      ) : interviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">No company interviews yet.</p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {interviews.map((interview) => (
            <article key={interview.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <CompanyLogo company={interview.company} />
                  <div>
                  <h2 className="text-base font-semibold text-slate-900">{interview.job?.title || "Company Interview"}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">{interview.company?.full_name || "Company"}</p>
                  <p className="mt-1 max-w-md text-xs text-slate-500">
                    {interview.company?.about || interview.company?.industry || "Review the company profile before starting."}
                  </p>
                  {interview.company?.id ? (
                    <Link href={`/company/${interview.company.id}`} className="mt-2 inline-flex text-xs font-semibold text-brand-700 hover:text-brand-600">
                      View company profile
                    </Link>
                  ) : null}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusStyles[interview.status] || statusStyles.pending}`}>
                  {statusLabel(interview.status)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Info label="Type" value={interview.interview_type} />
                <Info label="Language" value={interview.language === "ar" ? "Arabic" : "English"} />
                <Info label="Questions" value={interview.questions?.length || 0} />
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                {interview.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => handleAccept(interview)}
                    disabled={workingId === interview.id}
                    className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                  >
                    {workingId === interview.id ? "Accepting..." : "Accept Interview"}
                  </button>
                ) : null}
                {["pending", "accepted", "in_progress"].includes(interview.status) ? (
                  <button
                    type="button"
                    onClick={() => handleStart(interview)}
                    className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Start Interview
                  </button>
                ) : null}
                {interview.status === "completed" ? (
                  <span className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">
                    Completed
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function CompanyLogo({ company }) {
  const name = company?.full_name || "Company";
  const [imageError, setImageError] = useState(false);
  const logoSrc = toAbsolute(company?.logo_url);

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
      {logoSrc && !imageError ? (
        <img
          src={logoSrc}
          alt={`${name} logo`}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className="text-sm font-bold text-brand-700">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

function toAbsolute(path) {
  const value = String(path || "").trim();
  if (!value || value.startsWith("blob:") || value.includes("\\fakepath\\")) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return `${API_BASE}/${value.replace(/^\/+/, "")}`;
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-slate-800">{value || "N/A"}</p>
    </div>
  );
}
