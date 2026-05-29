"use client";

import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { companyNavItems } from "@/components/authenticatedNavItems";

export default function CompanyDashboardLayout({ children }) {
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
      {children}
    </AuthenticatedLayout>
  );
}
