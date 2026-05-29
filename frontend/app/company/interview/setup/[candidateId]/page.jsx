"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { companyNavItems } from "@/components/authenticatedNavItems";

export default function CompanyInterviewSetupRedirectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(
      `/company-dashboard/interview/setup/${params.candidateId}${query ? `?${query}` : ""}`,
    );
  }, [params.candidateId, router, searchParams]);

  return (
    <AuthenticatedLayout
      navItems={companyNavItems}
      allowedRole="company"
      loadingLabel="Loading Smart Recruitment Platform dashboard..."
      homeHref="/company-dashboard"
      brandSubtitle="Smart Recruitment Platform"
      roleLabel="Company"
      contentClassName="max-w-[1320px]"
    >
      <div className="dashboard-card mx-auto max-w-md rounded-2xl border px-6 py-4 text-sm text-white/[0.68]">
        Opening interview setup...
      </div>
    </AuthenticatedLayout>
  );
}
