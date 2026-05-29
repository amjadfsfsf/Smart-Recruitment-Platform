"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  Globe2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { getPublicCompanyProfile } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function PublicCompanyProfilePage() {
  const params = useParams();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageErrors, setImageErrors] = useState({ logo: false, banner: false });

  useEffect(() => {
    const loadCompany = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getPublicCompanyProfile(params.id);
        setCompany(data);
        setImageErrors({ logo: false, banner: false });
      } catch (err) {
        setError(err.message || "Could not load company profile");
      } finally {
        setLoading(false);
      }
    };
    loadCompany();
  }, [params.id]);

  if (loading) {
    return (
      <main className="dark-app-shell dark-grid-overlay min-h-screen app-shell-gradient px-4 py-8 text-white">
        <div className="dashboard-card mx-auto max-w-5xl rounded-2xl border px-6 py-4 text-sm text-white/[0.68]">
          Loading company profile...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="dark-app-shell dark-grid-overlay min-h-screen app-shell-gradient px-4 py-8 text-white">
        <div className="mx-auto max-w-5xl rounded-2xl border border-red-400/20 bg-red-500/10 px-6 py-4 text-sm text-red-100">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="dark-app-shell dark-grid-overlay isolate min-h-screen app-shell-gradient px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Link
          href="/dashboard"
          className="premium-secondary-action inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:-translate-y-0.5"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>

        <section className="dashboard-card overflow-hidden rounded-[1.35rem] border p-0">
          <div className="relative h-64 overflow-hidden bg-[#050816] sm:h-72">
            {toAbsolute(company?.banner_url) && !imageErrors.banner ? (
              <img
                src={toAbsolute(company.banner_url)}
                alt={`${company?.full_name || "Company"} cover`}
                className="h-full w-full object-cover"
                onError={() => setImageErrors((current) => ({ ...current, banner: true }))}
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_18%_0%,rgba(103,232,249,0.24),transparent_34%),radial-gradient(circle_at_80%_15%,rgba(167,139,250,0.2),transparent_30%),linear-gradient(135deg,#050816,#111827_52%,#0a1327)]" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,22,0.18)_0%,rgba(5,8,22,0.56)_54%,rgba(5,8,22,0.94)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(103,232,249,0.12),transparent_30%),linear-gradient(90deg,rgba(5,8,22,0.78),transparent_54%)]" />
          </div>
          <div className="relative px-5 pb-6 pt-16 md:px-8">
            <div className="absolute -top-16 left-5 md:left-8">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.35rem] border border-white/[0.16] bg-[#0A0F1C]/90 shadow-[0_22px_58px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
                {toAbsolute(company?.logo_url) && !imageErrors.logo ? (
                  <img
                    src={toAbsolute(company.logo_url)}
                    alt={`${company?.full_name || "Company"} logo`}
                    className="h-full w-full object-cover"
                    onError={() => setImageErrors((current) => ({ ...current, logo: true }))}
                  />
                ) : (
                  <span className="text-3xl font-bold text-cyan-100">{(company?.full_name || "C").slice(0, 1)}</span>
                )}
              </div>
            </div>
            <div className="md:ml-36">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="min-w-0">
                  <h1 className="section-title text-3xl md:text-4xl">{company?.full_name || "Company"}</h1>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-white/[0.58]">
                    <MapPin className="h-4 w-4 text-cyan-100/70" aria-hidden="true" />
                    {[company?.industry, company?.location].filter(Boolean).join(" / ") || "Company profile"}
                  </p>
                </div>
                {company?.verified_company ? (
                  <span className="premium-metric-badge inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Verified Company
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Fact icon={UsersRound} label="Company size" value={company?.company_size} />
                <Fact icon={CalendarDays} label="Founded" value={company?.founded_year} />
                <Fact icon={Building2} label="Work mode" value={company?.work_mode} />
                <Fact icon={Clock3} label="Working hours" value={company?.working_hours} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <InfoPanel title="About Company" value={company?.about} />
          <InfoPanel title="Company Culture" value={company?.culture} />
          <InfoPanel title="Mission" value={company?.mission} />
          <InfoPanel title="Vision" value={company?.vision} />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <TagPanel title="Main Technologies" items={company?.technologies} />
          <TagPanel title="Hiring Focus Areas" items={company?.hiring_focus_areas} tone="teal" />
          <TagPanel title="Benefits" items={company?.benefits} tone="emerald" />
          <SocialPanel company={company} />
        </section>

        <section className="dashboard-card rounded-[1.35rem] border p-5 md:p-6">
          <h2 className="text-base font-semibold text-white">Contact Information</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Fact icon={Mail} label="HR email" value={company?.hr_email} />
            <Fact icon={Mail} label="Support email" value={company?.support_email} />
            <Fact icon={Phone} label="Phone number" value={company?.phone_number} />
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoPanel({ title, value }) {
  return (
    <article className="dashboard-card rounded-[1.35rem] border p-5 transition duration-200 hover:-translate-y-1 hover:border-white/[0.16] md:p-6">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/[0.64]">{value || "Not available"}</p>
    </article>
  );
}

function TagPanel({ title, items, tone = "indigo" }) {
  const tags = Array.isArray(items) ? items : [];
  const classes = {
    indigo: "border-[#A78BFA]/15 bg-[#A78BFA]/12 text-[#DDD6FE]",
    teal: "border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
    emerald: "border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
  }[tone];

  return (
    <article className="dashboard-card rounded-[1.35rem] border p-5 transition duration-200 hover:-translate-y-1 hover:border-white/[0.16] md:p-6">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((item) => (
            <span key={item} className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-white/[0.5]">Not available</p>
      )}
    </article>
  );
}

function SocialPanel({ company }) {
  const links = [
    ["Website", company?.website],
    ["LinkedIn", company?.linkedin || company?.social_links?.linkedin],
    ["GitHub", company?.github || company?.social_links?.github],
    ["Twitter/X", company?.twitter || company?.social_links?.twitter],
    ["Facebook", company?.facebook || company?.social_links?.facebook],
  ].filter(([, href]) => href);

  return (
    <article className="dashboard-card rounded-[1.35rem] border p-5 transition duration-200 hover:-translate-y-1 hover:border-white/[0.16] md:p-6">
      <h2 className="text-base font-semibold text-white">Social Links</h2>
      {links.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {links.map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="premium-secondary-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
            >
              {label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-white/[0.5]">Not available</p>
      )}
    </article>
  );
}

function Fact({ icon: Icon = Globe2, label, value }) {
  return (
    <div className="dashboard-subcard rounded-2xl border px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-100/72" aria-hidden="true" />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/[0.45]">{label}</p>
      </div>
      <p className="mt-2 text-sm font-semibold text-white/[0.9]">{value || "Not available"}</p>
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
