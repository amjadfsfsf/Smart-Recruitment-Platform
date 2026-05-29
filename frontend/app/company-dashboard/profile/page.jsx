"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import SectionHeader from "@/components/SectionHeader";
import { getCompanyProfile, updateCompanyProfile, uploadCompanyProfileAsset } from "@/lib/api";
import { getToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const initialForm = {
  full_name: "",
  industry: "",
  company_size: "",
  founded_year: "",
  website: "",
  linkedin: "",
  location: "",
  country: "",
  city: "",
  about: "",
  mission: "",
  vision: "",
  culture: "",
  technologies: "",
  hiring_focus_areas: "",
  work_mode: "",
  working_hours: "",
  benefits: "",
  hr_email: "",
  support_email: "",
  phone_number: "",
  github: "",
  twitter: "",
  facebook: "",
};

export default function CompanyProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [imageErrors, setImageErrors] = useState({ logo: false, banner: false });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = getToken();
        const data = await getCompanyProfile(token);
        setProfile(data);
        setForm(profileToForm(data));
      } catch (err) {
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const technologyTags = useMemo(() => splitTags(form.technologies), [form.technologies]);
  const benefitTags = useMemo(() => splitTags(form.benefits), [form.benefits]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleAssetUpload = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    setError("");
    setSuccess("");
    try {
      const token = getToken();
      const uploaded = await uploadCompanyProfileAsset(token, kind, file);
      const key = kind === "logo" ? "logo_url" : "banner_url";
      setImageErrors((current) => ({ ...current, [kind]: false }));
      setProfile((current) => ({ ...current, [key]: uploaded.url }));
      setSuccess(`${kind === "logo" ? "Logo" : "Cover image"} uploaded successfully`);
    } catch (err) {
      setError(err.message || "Could not upload image");
    } finally {
      setUploading("");
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const token = getToken();
      const payload = {
        ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value])),
        full_name: form.full_name.trim(),
        founded_year: form.founded_year ? Number(form.founded_year) : null,
        technologies: splitTags(form.technologies),
        hiring_focus_areas: splitTags(form.hiring_focus_areas),
        benefits: splitTags(form.benefits),
        social_links: {
          linkedin: form.linkedin.trim(),
          github: form.github.trim(),
          twitter: form.twitter.trim(),
          facebook: form.facebook.trim(),
        },
      };
      const updated = await updateCompanyProfile(token, payload);
      setProfile(updated);
      setForm(profileToForm(updated));
      setSuccess("Company profile updated successfully");
    } catch (err) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const bannerSrc = toAbsolute(profile?.banner_url);
  const logoSrc = toAbsolute(profile?.logo_url);
  const showBannerImage = Boolean(bannerSrc) && !imageErrors.banner;
  const showLogoImage = Boolean(logoSrc) && !imageErrors.logo;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-smooth">
          Loading company profile...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Company Profile"
        description="Build a trusted public profile candidates can review before interviews, CV requests, and applications."
        actions={
          profile?.id ? (
            <Link
              href={`/company/${profile.id}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              View Public Profile
            </Link>
          ) : null
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-52 bg-slate-200">
          {showBannerImage ? (
            <img
              src={bannerSrc}
              alt={`${form.full_name || "Company"} cover`}
              className="h-full w-full object-cover"
              onError={() => setImageErrors((current) => ({ ...current, banner: true }))}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-brand-600 via-indigo-500 to-teal-500" />
          )}
          <label className="absolute right-4 top-4 cursor-pointer rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white">
            {uploading === "banner" ? "Uploading..." : "Upload Cover"}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => handleAssetUpload("banner", event.target.files?.[0])} />
          </label>
        </div>

        <div className="relative px-5 pb-5 pt-16">
          <div className="absolute -top-12 left-5">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-sm">
              {showLogoImage ? (
                <img
                  src={logoSrc}
                  alt={`${form.full_name || "Company"} logo`}
                  className="h-full w-full object-cover"
                  onError={() => setImageErrors((current) => ({ ...current, logo: true }))}
                />
              ) : (
                <span className="text-2xl font-semibold text-brand-700">{(form.full_name || "C").slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <label className="mt-2 block cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700">
              {uploading === "logo" ? "Uploading..." : "Upload Logo"}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => handleAssetUpload("logo", event.target.files?.[0])} />
            </label>
          </div>
          <div className="ml-0 md:ml-32">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <h2 className="text-2xl font-semibold text-slateplus">{form.full_name || "Company Name"}</h2>
              {profile?.verified_company ? (
                <span className="w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                  Verified Company
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {[form.industry, form.location || [form.city, form.country].filter(Boolean).join(", ")].filter(Boolean).join(" / ") || "Industry and location help candidates understand your company."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {technologyTags.slice(0, 6).map((item) => (
                <Chip key={item}>{item}</Chip>
              ))}
              {benefitTags.slice(0, 3).map((item) => (
                <Chip key={item} tone="teal">{item}</Chip>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{success}</p> : null}

      <form onSubmit={handleSave} className="space-y-5">
        <ProfileSection title="Basic Information">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Company Name" value={form.full_name} onChange={(value) => setField("full_name", value)} />
            <Field label="Industry" value={form.industry} onChange={(value) => setField("industry", value)} />
            <Field label="Company Size" value={form.company_size} onChange={(value) => setField("company_size", value)} placeholder="51-200 employees" />
            <Field label="Founded Year" type="number" value={form.founded_year} onChange={(value) => setField("founded_year", value)} />
            <Field label="Website URL" value={form.website} onChange={(value) => setField("website", value)} />
            <Field label="LinkedIn URL" value={form.linkedin} onChange={(value) => setField("linkedin", value)} />
            <Field label="Location" value={form.location} onChange={(value) => setField("location", value)} placeholder="Amman, Jordan" />
            <Field label="Country" value={form.country} onChange={(value) => setField("country", value)} />
            <Field label="City" value={form.city} onChange={(value) => setField("city", value)} />
          </div>
        </ProfileSection>

        <ProfileSection title="Company Description">
          <div className="grid gap-4 lg:grid-cols-2">
            <TextArea label="About Company" value={form.about} onChange={(value) => setField("about", value)} />
            <TextArea label="Company Culture" value={form.culture} onChange={(value) => setField("culture", value)} />
            <TextArea label="Mission" value={form.mission} onChange={(value) => setField("mission", value)} />
            <TextArea label="Vision" value={form.vision} onChange={(value) => setField("vision", value)} />
          </div>
        </ProfileSection>

        <ProfileSection title="Hiring Information">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Main Technologies" value={form.technologies} onChange={(value) => setField("technologies", value)} helper="Comma-separated, e.g. React, Python, AWS" />
            <Field label="Hiring Focus Areas" value={form.hiring_focus_areas} onChange={(value) => setField("hiring_focus_areas", value)} helper="Comma-separated, e.g. AI, Product, Data" />
            <Field label="Remote / Hybrid / On-site" value={form.work_mode} onChange={(value) => setField("work_mode", value)} placeholder="Hybrid" />
            <Field label="Working Hours" value={form.working_hours} onChange={(value) => setField("working_hours", value)} placeholder="Sun-Thu, flexible hours" />
            <Field label="Benefits" value={form.benefits} onChange={(value) => setField("benefits", value)} helper="Comma-separated, e.g. Health insurance, Learning budget" className="md:col-span-2" />
          </div>
        </ProfileSection>

        <ProfileSection title="Contact & Social Links">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="HR Email" value={form.hr_email} onChange={(value) => setField("hr_email", value)} />
            <Field label="Support Email" value={form.support_email} onChange={(value) => setField("support_email", value)} />
            <Field label="Phone Number" value={form.phone_number} onChange={(value) => setField("phone_number", value)} />
            <Field label="GitHub" value={form.github} onChange={(value) => setField("github", value)} />
            <Field label="Twitter/X" value={form.twitter} onChange={(value) => setField("twitter", value)} />
            <Field label="Facebook" value={form.facebook} onChange={(value) => setField("facebook", value)} />
          </div>
        </ProfileSection>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Company Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileSection({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slateplus">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", helper = "", className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-300"
      />
      {helper ? <span className="mt-1 block text-xs text-slate-500">{helper}</span> : null}
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none transition focus:ring-2 focus:ring-indigo-300"
      />
    </label>
  );
}

function Chip({ children, tone = "indigo" }) {
  const classes = tone === "teal" ? "bg-teal-50 text-teal-700 ring-teal-100" : "bg-indigo-50 text-indigo-700 ring-indigo-100";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classes}`}>{children}</span>;
}

function profileToForm(profile = {}) {
  return {
    ...initialForm,
    full_name: profile.full_name || "",
    industry: profile.industry || "",
    company_size: profile.company_size || "",
    founded_year: profile.founded_year || "",
    website: profile.website || "",
    linkedin: profile.linkedin || profile.social_links?.linkedin || "",
    location: profile.location || "",
    country: profile.country || "",
    city: profile.city || "",
    about: profile.about || "",
    mission: profile.mission || "",
    vision: profile.vision || "",
    culture: profile.culture || "",
    technologies: listToText(profile.technologies),
    hiring_focus_areas: listToText(profile.hiring_focus_areas),
    work_mode: profile.work_mode || "",
    working_hours: profile.working_hours || "",
    benefits: listToText(profile.benefits),
    hr_email: profile.hr_email || "",
    support_email: profile.support_email || "",
    phone_number: profile.phone_number || "",
    github: profile.github || profile.social_links?.github || "",
    twitter: profile.twitter || profile.social_links?.twitter || "",
    facebook: profile.facebook || profile.social_links?.facebook || "",
  };
}

function listToText(value) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toAbsolute(path) {
  const value = String(path || "").trim();
  if (!value || value.startsWith("blob:") || value.includes("\\fakepath\\")) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return `${API_BASE}/${value.replace(/^\/+/, "")}`;
}
