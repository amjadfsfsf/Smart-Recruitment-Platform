"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { LogOut } from "lucide-react";

import FloatingAssistant from "@/components/FloatingAssistant";
import Footer from "@/components/landing/Footer";
import { clearSession, getToken, getUser } from "@/lib/auth";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function isActivePath(pathname, href) {
  if (href === "/dashboard" || href === "/company-dashboard") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

function getDisplayName(user, fallback) {
  return user?.full_name || user?.username || fallback;
}

export default function AuthenticatedLayout({
  children,
  navItems,
  allowedRole = "user",
  loadingLabel = "Loading Smart Recruitment Platform...",
  homeHref = "/dashboard",
  brandSubtitle = "Smart Recruitment Platform",
  roleLabel,
  mainClassName = "",
  contentClassName = "max-w-[1480px]",
  showAssistant = true,
}) {
  const router = useRouter();
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const token = getToken();
    const savedUser = getUser();

    if (!token || !savedUser) {
      clearSession();
      router.replace("/login");
      return;
    }

    if (allowedRole === "company" && savedUser.role !== "company") {
      router.replace("/dashboard");
      return;
    }

    if (allowedRole !== "company" && savedUser.role === "company") {
      router.replace("/company-dashboard");
      return;
    }

    setUser(savedUser);
  }, [allowedRole, router]);

  if (user === undefined) {
    return (
      <div className="dark-app-shell dark-grid-overlay flex min-h-screen items-center justify-center app-shell-gradient">
        <div className="dashboard-card rounded-2xl border px-6 py-4 text-sm text-white/[0.68]">
          {loadingLabel}
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="authenticated-app-shell dark-app-shell dark-grid-overlay isolate min-h-screen app-shell-gradient">
      <AuthenticatedNavbar
        user={user}
        navItems={navItems}
        homeHref={homeHref}
        brandSubtitle={brandSubtitle}
        roleLabel={roleLabel}
      />
      <main
        className={cn(
          "authenticated-app-main relative z-10 min-w-0 px-4 pb-20 pt-[18rem] sm:px-6 sm:pt-52 md:pt-44 lg:px-8 lg:pt-40 xl:px-10 xl:pt-40 2xl:pt-36",
          mainClassName,
        )}
      >
        <div className={cn("mx-auto w-full", contentClassName)}>{children}</div>
      </main>
      <div className="relative z-10 mt-4">
        <Footer />
      </div>
      {showAssistant ? <FloatingAssistant /> : null}
    </div>
  );
}

export function AuthenticatedNavbar({ user, navItems, homeHref, brandSubtitle, roleLabel }) {
  const pathname = usePathname();
  const router = useRouter();
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);
  const spring = { type: "spring", stiffness: 180, damping: 26, mass: 0.85 };

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 40);
  });

  useEffect(() => {
    setIsScrolled(scrollY.get() > 40);
  }, [scrollY]);

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <header className="authenticated-app-header pointer-events-none fixed inset-x-0 top-0 z-[80] px-4 pt-3 sm:px-6">
      <motion.div
        initial={false}
        animate={{
          minHeight: isScrolled ? 78 : 96,
          maxWidth: isScrolled ? "min(90vw, 1320px)" : "min(93vw, 1400px)",
          borderRadius: isScrolled ? "1.25rem" : "1.6rem",
          backgroundColor: isScrolled ? "rgba(8, 13, 28, 0.82)" : "rgba(8, 13, 28, 0.7)",
          backdropFilter: isScrolled ? "blur(20px) saturate(1.16)" : "blur(15px) saturate(1.08)",
          boxShadow: isScrolled
            ? "0 14px 34px rgba(0,0,0,0.24), 0 0 18px rgba(103,232,249,0.02), inset 0 1px 0 rgba(255,255,255,0.055)"
            : "0 16px 44px rgba(0,0,0,0.19), 0 0 22px rgba(103,232,249,0.026), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
        transition={spring}
        className={cn(
          "pointer-events-auto relative mx-auto flex w-full flex-wrap items-center justify-between overflow-visible border border-white/[0.07] bg-[linear-gradient(135deg,rgba(7,11,22,0.84),rgba(17,24,39,0.70))] transition-colors duration-300",
          isScrolled ? "gap-x-3 gap-y-1.5 px-4 py-1.5 sm:px-5 lg:px-5" : "gap-x-5 gap-y-2.5 px-4 py-2.5 sm:px-5 lg:px-6",
        )}
      >
        <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(167,139,250,0.042),transparent_42%,rgba(103,232,249,0.038))] transition-[border-radius,opacity] duration-300",
            isScrolled ? "rounded-[1.25rem] opacity-65" : "rounded-[1.6rem] opacity-85",
          )}
        />

        <Link
          href={homeHref}
          className={cn(
            "group relative z-10 order-1 inline-flex shrink-0 items-center rounded-full px-1.5 text-sm font-semibold text-white transition hover:bg-white/[0.04]",
            isScrolled ? "gap-2 py-0.5" : "gap-2.5 py-1",
          )}
          aria-label="Smart Recruitment Platform home"
        >
          <motion.span
            animate={{ scale: isScrolled ? 0.94 : 1 }}
            transition={spring}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.05] text-[12px] font-bold text-white shadow-[0_8px_18px_rgba(0,0,0,0.14)] transition duration-200 group-hover:-translate-y-0.5"
          >
            SRP
          </motion.span>
          <span className="hidden tracking-tight sm:inline-block">
            <span className={cn("block leading-4 transition-all duration-300", isScrolled ? "text-[13px]" : "text-[13.5px]")}>Smart Recruitment Platform</span>
            <span
              className={cn(
                "mt-0.5 hidden text-[8.5px] font-medium uppercase tracking-[0.16em] text-white/[0.38] transition-opacity duration-300 xl:block",
                isScrolled ? "opacity-45" : "opacity-85",
              )}
            >
              {brandSubtitle}
            </span>
          </span>
          {roleLabel ? (
            <span className="hidden rounded-full border border-white/[0.07] bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/[0.58] lg:inline-flex">
              {roleLabel}
            </span>
          ) : null}
        </Link>

        <nav className="relative z-10 order-3 flex w-full min-w-0 justify-center overflow-visible xl:order-2 xl:w-auto xl:flex-1" aria-label="Authenticated navigation">
          <ul
            className={cn(
              "flex flex-wrap items-center justify-center rounded-full border border-white/[0.038] bg-white/[0.014] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.022)] transition-[gap,background-color,border-color] duration-300 xl:flex-nowrap",
              isScrolled ? "gap-0.5 bg-white/[0.022]" : "gap-1",
            )}
          >
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              const displayLabel = item.shortLabel || item.label;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group/nav relative inline-flex items-center rounded-full text-[11px] font-semibold tracking-normal transition duration-200 sm:text-[11.5px]",
                      isScrolled ? "h-7 gap-1.5 px-2" : "h-8 gap-1.5 px-2.5",
                      active
                        ? "bg-white/[0.082] text-white ring-1 ring-white/[0.085] shadow-[0_6px_16px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.05)]"
                        : "text-white/[0.58] hover:bg-white/[0.045] hover:text-white/[0.88]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-x-4 bottom-1 h-px rounded-full bg-gradient-to-r from-transparent via-[#67E8F9] to-transparent transition duration-200",
                        active ? "opacity-35" : "opacity-0",
                      )}
                    />
                    <Icon className={cn("h-3.5 w-3.5 shrink-0 transition", active ? "text-cyan-100/78" : "text-white/[0.38] group-hover/nav:text-white/[0.66]")} aria-hidden="true" />
                    <span className="whitespace-nowrap">{displayLabel}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className={cn(
            "relative z-10 order-2 hidden shrink-0 items-center gap-1.5 rounded-full border border-white/[0.045] bg-white/[0.014] px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.022)] transition-all duration-300 md:flex xl:order-3",
            isScrolled ? "py-1" : "py-1.5",
          )}
        >
          <div className="max-w-[7.8rem] pl-1.5 text-right">
            <p className="truncate text-[11.5px] font-semibold leading-4 text-white">{getDisplayName(user, "User")}</p>
            <p className={cn("mt-0.5 truncate text-[9px] text-white/[0.42] transition-opacity duration-300", isScrolled ? "opacity-50" : "opacity-82")}>
              {user?.email || "Workspace live"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="premium-secondary-action inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition hover:-translate-y-0.5"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden xl:inline">Logout</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="premium-secondary-action relative z-10 order-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:-translate-y-0.5 md:hidden"
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </motion.div>
    </header>
  );
}
