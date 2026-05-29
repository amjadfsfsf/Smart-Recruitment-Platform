"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Menu,
  Quote,
  Sparkles,
  X,
} from "lucide-react";
import {
  aboutHighlights,
  blogPosts,
  faqs,
  heroMetrics,
  navLinks,
  services,
  stats,
  teamMembers,
  testimonials,
  trustedBrands,
} from "./content";
import Footer from "./Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Reveal({ children, className = "", delay = 0 }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduceMotion ? 0 : 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({ eyebrow, title, description, align = "center", dark = false }) {
  return (
    <Reveal className={cn("max-w-3xl", align === "center" ? "mx-auto text-center" : "text-left")}>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/[0.58]">{eyebrow}</p>
      <h2 className={cn("mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-5xl", dark ? "text-white" : "text-[#03151a]")}>
        {title}
      </h2>
      {description ? (
        <p className={cn("mt-5 text-base leading-8 md:text-lg", dark ? "text-white/[0.68]" : "text-slate-600")}>{description}</p>
      ) : null}
    </Reveal>
  );
}

function GlassCard({ children, className = "" }) {
  return <div className={cn("cinematic-glass rounded-[1.75rem] border", className)}>{children}</div>;
}

const dashboardButtonBase =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition duration-200 hover:-translate-y-0.5 active:translate-y-0";

function PrimaryLink({ children, href, className = "" }) {
  return (
    <motion.div whileTap={{ scale: 0.98 }}>
      <Link
        href={href}
        className={cn(
          dashboardButtonBase,
          "premium-action",
          className,
        )}
      >
        {children}
      </Link>
    </motion.div>
  );
}

function SecondaryLink({ children, href, className = "" }) {
  return (
    <motion.div whileTap={{ scale: 0.98 }}>
      <Link
        href={href}
        className={cn(
          dashboardButtonBase,
          "premium-secondary-action",
          className,
        )}
      >
        {children}
      </Link>
    </motion.div>
  );
}

function IconBadge({ icon: Icon }) {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.045] text-cyan-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function AnimatedNumber({ value, suffix, display }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isInView) return;
    if (reduceMotion) {
      setCount(value);
      return;
    }

    const duration = 1100;
    const startedAt = performance.now();
    let frameId;

    function tick(now) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(value * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isInView, reduceMotion, value]);

  return (
    <span ref={ref}>
      {display.includes("K") ? (count >= value ? display : `${Math.floor(count / 1000)}K${suffix}`) : `${count}${suffix}`}
    </span>
  );
}

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState("services");
  const [scrolled, setScrolled] = useState(false);
  const spring = { type: "spring", stiffness: 180, damping: 26, mass: 0.85 };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 14);
      const current = navLinks.findLast((link) => {
        const section = document.getElementById(link.id);
        return section ? section.getBoundingClientRect().top <= 140 : false;
      });
      if (current) setActiveId(current.id);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 px-4 pt-3 sm:px-6">
      <motion.nav
        initial={false}
        animate={{
          minHeight: scrolled ? 70 : 82,
          maxWidth: scrolled ? "min(90vw, 1320px)" : "min(93vw, 1400px)",
          borderRadius: scrolled ? "1.25rem" : "1.6rem",
          backgroundColor: scrolled ? "rgba(8, 13, 28, 0.82)" : "rgba(8, 13, 28, 0.7)",
          backdropFilter: scrolled ? "blur(20px) saturate(1.16)" : "blur(15px) saturate(1.08)",
          boxShadow: scrolled
            ? "0 14px 34px rgba(0,0,0,0.24), 0 0 18px rgba(103,232,249,0.02), inset 0 1px 0 rgba(255,255,255,0.055)"
            : "0 16px 44px rgba(0,0,0,0.19), 0 0 22px rgba(103,232,249,0.026), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
        transition={spring}
        className={cn(
          "relative mx-auto flex w-full flex-wrap items-center justify-between overflow-visible border border-white/[0.07] bg-[linear-gradient(135deg,rgba(7,11,22,0.84),rgba(17,24,39,0.70))] transition-colors duration-300",
          scrolled ? "gap-x-3 gap-y-1.5 px-4 py-1.5 sm:px-5 lg:px-5" : "gap-x-5 gap-y-2.5 px-4 py-2.5 sm:px-5 lg:px-6",
        )}
      >
        <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(167,139,250,0.042),transparent_42%,rgba(103,232,249,0.038))] transition-[border-radius,opacity] duration-300",
            scrolled ? "rounded-[1.25rem] opacity-65" : "rounded-[1.6rem] opacity-85",
          )}
        />
        <Link
          href="/"
          className={cn(
            "group relative z-10 order-1 inline-flex shrink-0 items-center rounded-full px-1.5 text-sm font-semibold text-white transition hover:bg-white/[0.04]",
            scrolled ? "gap-2 py-0.5" : "gap-2.5 py-1",
          )}
          aria-label="Smart Recruitment Platform home"
        >
          <motion.span
            animate={{ scale: scrolled ? 0.94 : 1 }}
            transition={spring}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.05] text-white shadow-[0_8px_18px_rgba(0,0,0,0.14)] transition duration-200 group-hover:-translate-y-0.5"
          >
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
          </motion.span>
          <span className="hidden tracking-tight sm:inline-block">
            <span className="block text-[13.5px] leading-4 transition-all duration-300">Smart Recruitment Platform</span>
            <span
              className={cn(
                "mt-0.5 hidden text-[8.5px] font-medium uppercase tracking-[0.16em] text-white/[0.38] transition-opacity duration-300 xl:block",
                scrolled ? "opacity-45" : "opacity-85",
              )}
            >
              Smart Recruitment Platform
            </span>
          </span>
        </Link>

        <div className="relative z-10 order-3 hidden w-full min-w-0 justify-center overflow-visible md:flex xl:order-2 xl:w-auto xl:flex-1">
          <div
            className={cn(
              "flex flex-wrap items-center justify-center rounded-full border border-white/[0.038] bg-white/[0.014] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.022)] transition-[gap,background-color,border-color] duration-300 xl:flex-nowrap",
              scrolled ? "gap-0.5 bg-white/[0.022]" : "gap-1",
            )}
          >
            {navLinks.map((link) => (
              <a
                key={link.id}
                href={link.href}
                className={cn(
                  "group/nav relative inline-flex h-8 items-center rounded-full px-2.5 text-[11.5px] font-semibold tracking-normal transition duration-200",
                  activeId === link.id
                    ? "bg-white/[0.082] text-white ring-1 ring-white/[0.085] shadow-[0_6px_16px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.05)]"
                    : "text-white/[0.58] hover:bg-white/[0.045] hover:text-white/[0.88]",
                )}
              >
                {activeId === link.id ? (
                  <span className="absolute inset-x-4 bottom-1 h-px rounded-full bg-gradient-to-r from-transparent via-[#67E8F9] to-transparent opacity-35" />
                ) : null}
                <span className="relative">{link.label}</span>
              </a>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "relative z-10 order-2 hidden shrink-0 items-center gap-1.5 rounded-full border border-white/[0.045] bg-white/[0.014] px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.022)] transition-all duration-300 md:flex xl:order-3",
            scrolled ? "py-1" : "py-1.5",
          )}
        >
          <Link href="/login" className="inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold text-white/[0.62] transition hover:bg-white/[0.045] hover:text-white">
            Login
          </Link>
          <PrimaryLink href="/signup" className="h-9 rounded-full px-3 text-xs">
            Sign up
          </PrimaryLink>
        </div>

        <button
          type="button"
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsOpen((value) => !value)}
          className="premium-secondary-action relative z-10 order-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:-translate-y-0.5 md:hidden"
        >
          {isOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </motion.nav>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mx-auto mt-2 max-w-[min(93vw,1400px)] overflow-hidden rounded-[1.25rem] border border-white/[0.07] bg-[rgba(8,13,28,0.9)] shadow-[0_18px_44px_rgba(0,0,0,0.24)] backdrop-blur-2xl md:hidden"
          >
            <div className="grid gap-2 px-5 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "rounded-xl px-4 py-3 text-sm font-semibold transition",
                    activeId === link.id ? "bg-white/[0.082] text-white ring-1 ring-white/[0.085]" : "text-white/[0.62] hover:bg-white/[0.045] hover:text-white",
                  )}
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link href="/login" className={cn(dashboardButtonBase, "premium-secondary-action")}>
                  Login
                </Link>
                <Link href="/signup" className={cn(dashboardButtonBase, "premium-action")}>
                  Sign up
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function CareerPreview() {
  return (
    <Reveal className="relative">
      <div className="dashboard-card relative min-h-[31rem] overflow-hidden rounded-[1.35rem] border p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/20 to-transparent" />
        <div className="pointer-events-none absolute left-3 top-4 h-28 w-[min(40rem,88%)] rounded-full bg-[radial-gradient(ellipse_at_left,rgba(139,92,246,0.16),rgba(6,182,212,0.06)_42%,transparent_72%)] blur-2xl md:left-5 md:top-5" />
        <div className="relative flex h-full min-h-[28rem] flex-col rounded-[1.2rem] border border-white/[0.08] bg-[#0A0F1C]/[0.74] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/[0.065] bg-white/[0.035] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/[0.58] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.55)]" />
                Live guidance hub
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-normal text-white">Smart Recruitment Platform Command Center</h3>
            </div>
            <span className="premium-metric-badge rounded-full px-3 py-1 text-xs font-bold">
              Active
            </span>
          </div>

          <div className="dashboard-subcard mt-6 rounded-2xl border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/[0.58]">Target role</p>
                <p className="mt-1 text-2xl font-semibold tracking-normal text-white">AI Product Manager</p>
              </div>
              <div className="premium-metric-badge rounded-2xl px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.58]">Match</p>
                <p className="text-2xl font-bold text-white">92%</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {[
                { label: "Skill coverage", value: "84%" },
                { label: "Resume strength", value: "88%" },
                { label: "Interview readiness", value: "76%" },
              ].map((item, index) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm text-white/[0.68]">
                    <span>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                  <div className="premium-progress-track mt-2 h-2.5 rounded-full">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: item.value }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: index * 0.08, ease: "easeOut" }}
                      className="premium-progress-fill h-full rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto grid gap-3 pt-5 sm:grid-cols-3">
            {heroMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="dashboard-subcard rounded-2xl border p-4">
                  <Icon className="h-4 w-4 text-cyan-100/78" aria-hidden="true" />
                  <p className="mt-4 text-xs text-white/[0.48]">{metric.label}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{metric.value}</p>
                </div>
              );
            })}
          </div>
        </div>

        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut" }}
          className="dashboard-subcard !absolute left-4 top-28 hidden rounded-2xl border p-4 backdrop-blur-xl sm:block"
        >
          <p className="text-xs text-white/[0.55]">Next milestone</p>
          <p className="mt-1 text-sm font-semibold text-white">Ship SQL portfolio</p>
        </motion.div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 6.4, repeat: Infinity, ease: "easeInOut" }}
          className="dashboard-subcard !absolute bottom-20 right-4 hidden rounded-2xl border p-4 backdrop-blur-xl sm:block"
        >
          <p className="text-xs text-white/[0.55]">Momentum</p>
          <p className="mt-1 text-sm font-semibold text-cyan-100">+18% this week</p>
        </motion.div>
      </div>
    </Reveal>
  );
}

function HeroSection() {
  return (
    <section className="relative z-10 mx-auto grid max-w-[1480px] gap-8 px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:px-8 lg:pb-20 xl:px-10">
      <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-3xl">
        <motion.div variants={fadeUp} className="inline-flex items-center gap-2 rounded-full border border-white/[0.065] bg-white/[0.035] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/[0.58] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-lg">
          <Sparkles className="h-3.5 w-3.5 text-cyan-100/78" aria-hidden="true" />
          AI-powered smart recruitment platform
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-7 max-w-4xl text-5xl font-bold leading-[0.98] tracking-normal text-white sm:text-6xl lg:text-7xl"
        >
          Build a career that compounds.
        </motion.h1>

        <motion.p variants={fadeUp} className="mt-6 max-w-2xl text-base leading-8 text-white/[0.72] md:text-lg">
          Discover better-fit roles, understand your skill gaps, strengthen your resume, and practice interviews from one guided system built to move you forward with confidence.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/signup">
            Get started free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryLink>
          <SecondaryLink href="#services">
            Explore features
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </SecondaryLink>
        </motion.div>
      </motion.div>

      <CareerPreview />
    </section>
  );
}

function BrandStrip() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-10 sm:px-6 lg:px-8">
      <GlassCard className="px-5 py-6 sm:px-8">
        <p className="text-center text-sm text-white/45">Trusted by ambitious learners and career teams worldwide</p>
        <div className="mt-6 grid grid-cols-2 gap-4 text-center sm:grid-cols-3 lg:grid-cols-6">
          {trustedBrands.map((brand) => (
            <span key={brand} className="text-base font-semibold tracking-[0.08em] text-white/32 transition hover:text-white/65">
              {brand}
            </span>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}

function ServicesSection() {
  return (
    <section id="services" className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Services"
        title="Everything you need to plan, prepare, and progress."
        description="A connected suite for role discovery, skill intelligence, resume readiness, and interview preparation."
        dark
      />

      <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <motion.article
              key={service.title}
              variants={fadeUp}
              whileHover={{ y: -6, scale: 1.01 }}
              className="cinematic-glass group rounded-[1.75rem] border p-6 transition hover:border-[#DC758F]/25"
            >
              <IconBadge icon={Icon} />
              <h3 className="mt-6 text-xl font-semibold tracking-[-0.02em] text-white">{service.title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/58">{service.description}</p>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#F0D6DD]/90 opacity-0 transition group-hover:opacity-100">
                Learn more
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </motion.article>
          );
        })}
      </motion.div>
    </section>
  );
}

function AboutSection() {
  return (
    <section id="about" className="relative z-10 mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
        <Reveal className="dashboard-card rounded-[1.35rem] border p-5 md:p-6 lg:p-7">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/18 to-transparent" />
          <p className="inline-flex items-center gap-2 rounded-full border border-white/[0.065] bg-white/[0.035] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/[0.58] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.42)]" />
            About Smart Recruitment Platform
          </p>
          <h2 className="mt-5 text-3xl font-bold leading-[1.08] tracking-normal text-white md:text-5xl">A smarter operating system for career growth.</h2>
          <p className="mt-5 text-base leading-8 text-white/[0.68]">
            Smart Recruitment Platform is designed to remove the fragmentation from recruitment and career planning. Instead of juggling disconnected tools, you get one premium workspace where discovery, learning, applications, and interview preparation stay in sync.
          </p>
          <div className="mt-7 grid gap-3">
            {aboutHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="dashboard-subcard flex gap-4 rounded-2xl border p-4">
                  <IconBadge icon={Icon} />
                  <div>
                    <h3 className="text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-white/[0.58]">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal className="dashboard-card rounded-[1.35rem] border p-5 md:p-6 lg:p-7">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/18 to-transparent" />
          <div className="pointer-events-none absolute left-4 top-4 h-36 w-[min(34rem,86%)] rounded-full bg-[radial-gradient(ellipse_at_left,rgba(103,232,249,0.10),rgba(139,92,246,0.08)_44%,transparent_74%)] blur-2xl" />
          <div className="relative grid gap-3 sm:grid-cols-2">
            {[
              { title: "Role fit", value: "92%", caption: "Current alignment with target role" },
              { title: "Priority skills", value: "05", caption: "Highest-impact gaps identified" },
              { title: "Resume signals", value: "18", caption: "Improvements surfaced automatically" },
              { title: "Interview prompts", value: "12", caption: "Practice scenarios recommended" },
            ].map((item) => (
              <div key={item.title} className="dashboard-subcard rounded-2xl border p-4 sm:p-5">
                <p className="text-sm text-white/[0.54]">{item.title}</p>
                <p className="mt-4 text-4xl font-bold tracking-normal text-white/[0.94]">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-white/[0.58]">{item.caption}</p>
              </div>
            ))}
          </div>
          <div className="dashboard-subcard relative mt-3 overflow-hidden rounded-2xl border p-4 sm:p-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(103,232,249,0.08),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.04),transparent_45%)]" />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/[0.54]">Weekly trajectory</p>
                <p className="mt-1 text-lg font-semibold tracking-normal text-white/[0.92]">Momentum improving steadily</p>
              </div>
              <span className="premium-metric-badge rounded-full px-3 py-1 text-sm font-bold">+18%</span>
            </div>
            <div className="relative mt-6 h-32 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#050816]/35">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:100%_25%] opacity-45" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 520 148" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="trajectoryLine" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#67E8F9" stopOpacity="0.55" />
                    <stop offset="58%" stopColor="#A78BFA" stopOpacity="0.46" />
                    <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.62" />
                  </linearGradient>
                  <linearGradient id="trajectoryArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#67E8F9" stopOpacity="0.16" />
                    <stop offset="58%" stopColor="#A78BFA" stopOpacity="0.07" />
                    <stop offset="100%" stopColor="#050816" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 116 C58 104 74 86 126 91 C178 96 198 66 248 72 C303 79 318 47 372 48 C428 48 454 27 520 24 L520 148 L0 148 Z"
                  fill="url(#trajectoryArea)"
                />
                <motion.path
                  initial={{ opacity: 0, pathLength: 0 }}
                  whileInView={{ opacity: 1, pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  d="M0 116 C58 104 74 86 126 91 C178 96 198 66 248 72 C303 79 318 47 372 48 C428 48 454 27 520 24"
                  fill="none"
                  stroke="url(#trajectoryLine)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-x-5 bottom-4 flex items-center justify-between text-[11px] font-medium text-white/[0.38]">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
                <span>Sun</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section id="results" className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <GlassCard className="p-5 sm:p-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.article key={stat.label} variants={fadeUp} whileHover={{ y: -5 }} className="rounded-[1.5rem] border border-white/10 bg-[#0C101E]/70 p-6">
                <Icon className="h-5 w-5 text-[#F0D6DD]" aria-hidden="true" />
                <p className="mt-7 text-4xl font-semibold tracking-[-0.04em] text-white">
                  <AnimatedNumber value={stat.value} suffix={stat.suffix} display={stat.display} />
                </p>
                <p className="mt-2 text-sm text-white/55">{stat.label}</p>
              </motion.article>
            );
          })}
        </motion.div>
      </GlassCard>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Testimonials"
        title="Guidance that feels specific, useful, and calm."
        description="The experience is designed to replace guesswork with clarity, so users can make better decisions faster."
        dark
      />

      <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="mt-12 grid gap-4 md:grid-cols-2">
        {testimonials.map((testimonial) => (
          <motion.article
            key={testimonial.name}
            variants={fadeUp}
            whileHover={{ y: -6, scale: 1.01 }}
            className="cinematic-glass rounded-[1.75rem] border p-6"
          >
            <Quote className="h-6 w-6 text-[#F0D6DD]" aria-hidden="true" />
            <p className="mt-5 text-base leading-8 text-white/64">{testimonial.quote}</p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.08] text-sm font-semibold text-white">
                {testimonial.initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{testimonial.name}</p>
                <p className="text-sm text-white/48">{testimonial.role}</p>
              </div>
            </div>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Team"
        title="Built by people who care about direction, not noise."
        description="Strategy, product, learning, and coaching expertise working together behind one experience."
        dark
      />

      <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {teamMembers.map((member) => (
          <motion.article key={member.name} variants={fadeUp} whileHover={{ y: -6 }} className="cinematic-glass rounded-[1.75rem] border p-5 text-center">
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[1.75rem] bg-[radial-gradient(circle_at_30%_20%,rgba(220,117,143,0.24),transparent_42%),linear-gradient(145deg,rgba(93,115,126,0.12),rgba(12,16,30,0.7))] text-2xl font-semibold text-white">
              {member.initials}
            </div>
            <h3 className="mt-5 text-lg font-semibold text-white">{member.name}</h3>
            <p className="mt-1 text-sm text-white/52">{member.role}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

function BlogSection() {
  return (
    <section id="blog" className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Insights"
        title="Fresh thinking for smarter career moves."
        description="Short, practical reads that help users understand the why behind better decisions."
        dark
      />

      <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="mt-12 grid gap-4 lg:grid-cols-3">
        {blogPosts.map((post, index) => (
          <motion.article
            key={post.title}
            variants={fadeUp}
            whileHover={{ y: -6, scale: 1.01 }}
            className="cinematic-glass overflow-hidden rounded-[1.75rem] border"
          >
            <div
              className={cn(
                "h-44 border-b border-white/10",
                index === 0 &&
                  "bg-[radial-gradient(circle_at_20%_20%,rgba(220,117,143,0.24),transparent_30%),linear-gradient(135deg,#0C101E,#171A2B)]",
                index === 1 &&
                  "bg-[radial-gradient(circle_at_80%_10%,rgba(135,61,72,0.22),transparent_32%),linear-gradient(135deg,#0C101E,#191A29)]",
                index === 2 &&
                  "bg-[radial-gradient(circle_at_50%_0%,rgba(93,115,126,0.18),transparent_34%),linear-gradient(135deg,#0C101E,#121726)]",
              )}
            />
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#F0D6DD]/85">{post.category}</p>
              <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-white">{post.title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/56">{post.excerpt}</p>
              <div className="mt-6 flex items-center justify-between text-sm text-white/48">
                <span>{post.readTime}</span>
                <span className="inline-flex items-center gap-1 text-[#F0D6DD]">
                  Read
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="mx-auto max-w-4xl px-5 py-20 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="FAQ"
        title="Your questions, answered."
        description="Quick answers about how Smart Recruitment Platform supports planning, preparation, and better recruitment decisions."
        dark
      />

      <div className="mt-10 grid gap-3">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <motion.article key={faq.question} layout className="cinematic-glass rounded-[1.5rem] border">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-base font-medium text-white">{faq.question}</span>
                <ChevronDown className={cn("h-5 w-5 shrink-0 text-[#F0D6DD] transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
              </button>
              <motion.div initial={false} animate={isOpen ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }} className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-7 text-white/58">{faq.answer}</p>
              </motion.div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
      <Reveal className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(220,117,143,0.2),transparent_34%),linear-gradient(135deg,rgba(93,115,126,0.14),rgba(12,16,30,0.72))] p-8 backdrop-blur-xl md:p-12">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] opacity-45" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#F0D6DD]/90">Ready when you are</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-white md:text-5xl">
              Start building a smarter career plan today.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/62">
              Create your profile, discover your strongest options, and move forward with guidance that stays connected from first insight to final interview.
            </p>
          </div>
          <PrimaryLink href="/signup">
            Get started free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryLink>
        </div>
      </Reveal>
    </section>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-shell dark-grid-overlay isolate min-h-screen overflow-hidden app-shell-gradient text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(139,92,246,0.18),transparent_31%),radial-gradient(circle_at_92%_6%,rgba(103,232,249,0.09),transparent_26%),radial-gradient(circle_at_70%_74%,rgba(251,113,133,0.075),transparent_30%),linear-gradient(180deg,var(--cinematic-bg-deep)_0%,var(--cinematic-bg)_56%,#0a1327_100%)]" />
      </div>

      <Navbar />
      <HeroSection />
      <BrandStrip />
      <ServicesSection />
      <AboutSection />
      <StatsSection />
      <TestimonialsSection />
      <TeamSection />
      <BlogSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
