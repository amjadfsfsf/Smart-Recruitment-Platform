"use client";

import { AuthenticatedNavbar } from "@/components/AuthenticatedLayout";
import { companyNavItems } from "@/components/authenticatedNavItems";

export default function CompanySidebar({ user }) {
  return (
    <AuthenticatedNavbar
      user={user}
      navItems={companyNavItems}
      homeHref="/company-dashboard"
      brandSubtitle="Smart Recruitment Platform"
      roleLabel="Company"
    />
  );
}
