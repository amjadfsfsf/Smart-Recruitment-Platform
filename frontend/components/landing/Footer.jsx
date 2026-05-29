import { GraduationCap, Mail } from "lucide-react";

import { navLinks } from "./content";

export default function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 md:grid-cols-[1.2fr_0.8fr_0.8fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-white">Smart Recruitment Platform</span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/52">
            A premium AI recruitment platform for job matching, skill analysis, roadmaps, resumes, and mock interview preparation.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/78">Sections</h3>
          <div className="mt-4 grid gap-3 text-sm text-white/52">
            {navLinks.map((link) => (
              <a key={link.id} href={link.href} className="transition hover:text-white">
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/78">Contact</h3>
          <div className="mt-4 grid gap-3 text-sm text-white/52">
            <a href="mailto:hello@smartrecruitmentplatform.ai" className="inline-flex items-center gap-2 transition hover:text-white">
              <Mail className="h-4 w-4" aria-hidden="true" />
              hello@smartrecruitmentplatform.ai
            </a>
            <span>AI recruitment support</span>
            <span>Remote-first platform</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-5 text-center text-sm text-white/40">Copyright 2026 Smart Recruitment Platform. All rights reserved.</div>
    </footer>
  );
}
