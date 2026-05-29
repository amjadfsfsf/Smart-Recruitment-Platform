"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { companyNavItems } from "@/components/authenticatedNavItems";

export default function CompanyInterviewResultsRedirectPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/company-dashboard/interview/results/${params.sessionId}`);
  }, [params.sessionId, router]);

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
        Opening interview results...
      </div>
    </AuthenticatedLayout>
  );
}
