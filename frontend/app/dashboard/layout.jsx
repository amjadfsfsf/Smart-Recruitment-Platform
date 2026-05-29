"use client";

import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { userNavItems } from "@/components/authenticatedNavItems";
import { GlobalStateProvider } from "./GlobalStateProvider";

export default function DashboardLayout({ children }) {
  return (
    <AuthenticatedLayout
      navItems={userNavItems}
      allowedRole="user"
      loadingLabel="Loading Smart Recruitment Platform dashboard..."
      homeHref="/dashboard"
      brandSubtitle="Smart Recruitment Platform"
      contentClassName="max-w-[1480px]"
    >
      <GlobalStateProvider>
        {children}
      </GlobalStateProvider>
    </AuthenticatedLayout>
  );
}
