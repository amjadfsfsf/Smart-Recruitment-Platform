"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import SectionHeader from "@/components/SectionHeader";
import StatCard from "@/components/StatCard";
import { Badge, Button, Card, EmptyState, PageShell, Tag } from "@/components/ui/DashboardUI";
import { getCandidateCvRequests, getCurrentUser, getJobMatching, getSkillGap } from "@/lib/api";
import { getToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DashboardPage() {
  const [context, setContext] = useState(null);
  const [matches, setMatches] = useState([]);
  const [gap, setGap] = useState([]);
  const [cvRequests, setCvRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const token = getToken();

      if (!token) {
        if (active) {
          setError("No active session found. Please login again.");
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        const userSkills = currentUser.skills || currentUser.profile?.skills || [];
        const me = {
          ...currentUser,
          profile: {
            ...currentUser.profile,
            skills: userSkills,
            interests: currentUser.profile?.interests || [],
            target_career: currentUser.desired_job_title || currentUser.profile?.target_career || "",
            career_goal: currentUser.target_role || currentUser.profile?.career_goal || "",
          },
        };

        const [jobResponse, gapResponse, cvRequestResponse] = await Promise.all([
          getJobMatching(token, { skills: userSkills, top_k: 4 }).catch(() => ({
            recommended_jobs: [],
          })),
          getSkillGap(token, {
            education: currentUser.education_level || currentUser.profile?.education || "",
            field: currentUser.field_of_study || currentUser.profile?.field_of_study || "",
            experience: currentUser.experience_level || currentUser.profile?.experience || "",
            skills: userSkills,
            desired_job_title: currentUser.desired_job_title || currentUser.profile?.target_career || "",
            target_role: currentUser.target_role || currentUser.profile?.career_goal || "",
          }).catch(() => ({
            basic_analysis: { missing_skills: [] },
          })),
          getCandidateCvRequests(token).catch(() => []),
        ]);

        if (active) {
          setContext(me);
          setMatches(jobResponse.recommended_jobs || []);
          setGap(gapResponse.basic_analysis?.missing_skills || []);
          setCvRequests(Array.isArray(cvRequestResponse) ? cvRequestResponse : []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Failed to load dashboard data");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const profile = context?.profile || {
    skills: [],
    interests: [],
    target_career: "",
    career_goal: "",
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading dashboard data...</p>;
  }

  if (error) {
    return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>;
  }

  return (
    <PageShell>
      <SectionHeader
        title="Smart Recruitment Platform Dashboard"
        description="Track your profile strength, top job matches, and skill growth opportunities."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Profile completeness"
          value={`${Math.min(100, 35 + profile.skills.length * 8 + (profile.target_career ? 15 : 0))}%`}
          subtitle="Based on skills, desired job title, and goals"
        />
        <StatCard
          title="Skills listed"
          value={profile.skills.length || 0}
          subtitle="Keep adding role-specific skills"
        />
        <StatCard
          title="Recommended jobs"
          value={matches.length || 0}
          subtitle="Calculated using skill similarity"
        />
        <StatCard
          title="Missing skills"
          value={gap.length || 0}
          subtitle="From your desired job title benchmark"
        />
      </section>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slateplus">CV Requests</h3>
            <p className="mt-1 text-sm text-slate-500">
              Companies that asked you to complete and submit your CV before continuing.
            </p>
          </div>
          <Button
            as={Link}
            href="/dashboard/resume-builder"
          >
            Build CV
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {cvRequests.length ? (
            cvRequests.map((request) => (
              <Card key={request.id} as="article" variant="nested">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-3">
                    <CompanyLogo company={request.company} />
                    <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">CV Requested</p>
                    <h4 className="mt-1 text-sm font-semibold text-slateplus">
                      {request.company?.full_name || "Company"}
                    </h4>
                    <p className="mt-1 max-w-xl text-xs text-slate-500 line-clamp-2">
                      {request.company?.about || request.company?.industry || "View the company profile to learn more."}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {request.job?.title || "Interview process"}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      The company requested you to complete and submit your CV before continuing the interview process.
                    </p>
                    {request.company?.id ? (
                      <Link href={`/company/${request.company.id}`} className="mt-2 inline-flex text-xs font-semibold text-brand-700 hover:text-brand-600">
                        View company profile
                      </Link>
                    ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={request.status === "completed" ? "success" : "warning"} className="capitalize">
                      {request.status || "pending"}
                    </Badge>
                    <Badge variant="neutral">
                      {formatDate(request.created_at)}
                    </Badge>
                    {request.status !== "completed" ? (
                      <Button
                        as={Link}
                        href="/dashboard/resume-builder"
                        size="sm"
                      >
                        Build CV
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState title="No CV requests yet" description="Company requests will appear here when employers ask for a completed CV." className="py-7" />
          )}
        </div>
      </Card>

      <section>
        <Card as="article">
          <h3 className="text-base font-semibold text-slateplus">Profile Summary</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ProfileFact label="Desired Job Title" value={profile.target_career || "Not set yet"} />
            <ProfileFact label="Target Role" value={profile.career_goal || "Add your career direction in the profile page."} />
            <ProfileFact label="Top Interests" value={profile.interests?.length ? profile.interests.join(", ") : "Not added"} />
          </div>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card as="article">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slateplus">Top Job Recommendations</h3>
              <p className="mt-1 text-sm text-slate-500">Compact matches based on your profile and listed skills.</p>
            </div>
            <Link href="/dashboard/job-matching" className="text-sm font-semibold text-brand-700 hover:text-brand-600">
              Open Match
            </Link>
          </div>
          <div className="mt-4 grid gap-3">
            {matches.slice(0, 4).map((job) => (
              <JobRecommendationCard key={job.job_id || `${job.title}-${job.company}`} job={job} profileSkills={profile.skills || []} />
            ))}
            {!matches.length ? (
              <p className="text-sm text-slate-500">No matches yet. Add skills in profile.</p>
            ) : null}
          </div>
        </Card>

        <Card as="article">
          <h3 className="text-base font-semibold text-slateplus">Priority Skills To Learn</h3>
          <div className="mt-4 space-y-3">
            {gap.slice(0, 4).map((item) => (
              <div
                key={typeof item === "string" ? item : item.skill}
                className="dashboard-subcard flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <p className="text-sm font-medium text-slateplus">{typeof item === "string" ? item : item.skill}</p>
                {typeof item === "string" ? (
                  <Badge variant="warning">
                    Focus next
                  </Badge>
                ) : (
                  <Badge variant={item.importance === "High" ? "danger" : "warning"}>
                    {item.importance}
                  </Badge>
                )}
              </div>
            ))}
            {!gap.length ? (
              <p className="text-sm text-slate-500">
                You are well aligned with the selected desired job title.
              </p>
            ) : null}
          </div>
        </Card>
      </section>
    </PageShell>
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

function ProfileFact({ label, value }) {
  return (
    <div className="dashboard-subcard rounded-xl border px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold text-slateplus">{value}</p>
    </div>
  );
}

function JobRecommendationCard({ job, profileSkills }) {
  const title = job.title || job.job_title || "Untitled role";
  const company = job.company || "Company not listed";
  const score = Math.round(Number(job.score ?? job.match_score ?? 0));
  const jobSkills = Array.isArray(job.skills) ? job.skills.filter(Boolean) : [];
  const userSkillSet = new Set((profileSkills || []).map((skill) => String(skill).toLowerCase()));
  const matchingSkills = jobSkills.filter((skill) => userSkillSet.has(String(skill).toLowerCase()));
  const visibleSkills = (matchingSkills.length ? matchingSkills : jobSkills).slice(0, 5);
  const missingSkillsCount = jobSkills.filter((skill) => !userSkillSet.has(String(skill).toLowerCase())).length;
  const description = job.description || job.job_description || "No description preview available.";
  const applyUrl = job.apply_url || job.apply_link || job.url || "";
  const experience = job.experience_level || job.experience || job.contract_type || inferExperienceFromTitle(title);

  return (
    <article className="dashboard-subcard rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-smooth">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="line-clamp-1 text-sm font-semibold text-slateplus">{title}</h4>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{company}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${matchBadgeClass(score)}`}>
          {score}% Match
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tag>{experience}</Tag>
        <Tag variant="warning">
          {missingSkillsCount} missing skill{missingSkillsCount === 1 ? "" : "s"}
        </Tag>
      </div>

      <p className="mt-3 line-clamp-3 max-h-[4.5rem] text-sm leading-6 text-slate-600">
        {description}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {visibleSkills.length ? (
          visibleSkills.map((skill) => (
            <span
              key={skill}
              className=""
            >
              <Tag variant={userSkillSet.has(String(skill).toLowerCase()) ? "success" : "slate"}>{skill}</Tag>
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-400">No extracted skills listed</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
        {applyUrl ? (
          <>
            <a
              href={applyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              View Job
            </a>
            <a
              href={applyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Apply
            </a>
          </>
        ) : (
          <Link
            href="/dashboard/job-matching"
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Open Match
          </Link>
        )}
      </div>
    </article>
  );
}

function matchBadgeClass(score) {
  if (score >= 85) return "border-cyan-300/15 bg-cyan-400/10 text-cyan-100";
  if (score >= 70) return "border-blue-300/15 bg-blue-400/10 text-blue-100";
  if (score >= 50) return "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100";
  return "border-rose-300/15 bg-rose-500/10 text-rose-100";
}

function inferExperienceFromTitle(title) {
  const lowered = String(title || "").toLowerCase();
  if (/(senior|sr\.?|lead|principal|manager|director)/.test(lowered)) return "Senior";
  if (/(junior|entry|intern|associate|trainee)/.test(lowered)) return "Entry-Level";
  return "Experience not specified";
}

function toAbsolute(path) {
  const value = String(path || "").trim();
  if (!value || value.startsWith("blob:") || value.includes("\\fakepath\\")) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return `${API_BASE}/${value.replace(/^\/+/, "")}`;
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
