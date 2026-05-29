"use client";

import Link from "next/link";

import SectionHeader from "@/components/SectionHeader";
import { getUser } from "@/lib/auth";

export default function CompanyDashboardPage() {
  const user = getUser();

  return (
    <div>
      <SectionHeader
        title={`Welcome, ${user?.full_name || "Company"}`}
        description="Manage your job postings and find the best candidates."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/company-dashboard/jobs"
          className="dashboard-card group rounded-2xl border p-6 transition hover:-translate-y-1 hover:border-cyan-300/25"
        >
          <h3 className="text-base font-semibold text-white group-hover:text-cyan-100">
            Company Jobs
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/[0.58]">
            Create and manage job postings. Find candidates for each role.
          </p>
        </Link>

        <Link
          href="/company-dashboard/candidates"
          className="dashboard-card group rounded-2xl border p-6 transition hover:-translate-y-1 hover:border-cyan-300/25"
        >
          <h3 className="text-base font-semibold text-white group-hover:text-cyan-100">
            Candidates
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/[0.58]">
            Find and rank candidates using AI-powered matching against your jobs.
          </p>
        </Link>

        <Link
          href="/company-dashboard/profile"
          className="dashboard-card group rounded-2xl border p-6 transition hover:-translate-y-1 hover:border-cyan-300/25"
        >
          <h3 className="text-base font-semibold text-white group-hover:text-cyan-100">
            Company Profile
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/[0.58]">
            View and manage your company account details.
          </p>
        </Link>
      </div>
    </div>
  );
}
