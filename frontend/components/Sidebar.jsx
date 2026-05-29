"use client";

import { AuthenticatedNavbar } from "@/components/AuthenticatedLayout";
import { userNavItems } from "@/components/authenticatedNavItems";

export default function Sidebar({ user }) {
  return (
    <AuthenticatedNavbar
      user={user}
      navItems={userNavItems}
      homeHref="/dashboard"
      brandSubtitle="Smart Recruitment Platform"
    />
  );
}
