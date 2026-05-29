export default function SectionHeader({ title, description, actions, eyebrow = "AI workspace" }) {
  return (
    <header className="relative isolate mb-9 overflow-hidden rounded-[1.75rem] border border-white/[0.055] bg-[linear-gradient(155deg,rgba(11,16,32,0.66),rgba(19,28,49,0.48)_48%,rgba(8,13,28,0.62))] px-5 py-5 shadow-[0_18px_54px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-lg md:mb-11 md:px-6 md:py-6 lg:px-7">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(6,182,212,0.055),transparent_34%,rgba(139,92,246,0.075)_78%,transparent)]" />
      <div className="pointer-events-none absolute left-3 top-4 h-28 w-[min(40rem,88%)] rounded-full bg-[radial-gradient(ellipse_at_left,rgba(139,92,246,0.20),rgba(6,182,212,0.08)_42%,transparent_72%)] blur-2xl md:left-5 md:top-5" />

      <div className="relative z-10 flex min-h-[8rem] flex-col justify-center gap-y-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="content-measure">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.065] bg-white/[0.035] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/[0.58] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.55)]" />
            {eyebrow}
          </div>
          <h1 className="section-title text-[1.95rem] leading-[1.06] sm:text-[2.35rem] md:text-[2.7rem]">{title}</h1>
          {description ? <p className="section-description mt-3 max-w-2xl text-sm leading-6 md:text-[15px] md:leading-7">{description}</p> : null}
        </div>
        {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}
