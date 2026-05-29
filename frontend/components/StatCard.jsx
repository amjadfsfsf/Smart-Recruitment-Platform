export default function StatCard({ title, value, subtitle }) {
  return (
    <article className="dashboard-card group rounded-[1.35rem] border p-4 transition duration-200 hover:-translate-y-1 hover:border-white/[0.16] hover:shadow-[0_26px_70px_rgba(0,0,0,0.34)] md:p-5">
      <div className="relative z-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/[0.56]">{title}</p>
        <h3 className="mt-3 text-3xl font-semibold tracking-normal text-white md:text-[2.15rem]">{value}</h3>
        {subtitle ? <p className="mt-2 text-xs leading-5 text-white/[0.66] md:text-sm md:leading-6">{subtitle}</p> : null}
      </div>
      <div className="pointer-events-none absolute right-4 top-4 h-10 w-10 rounded-full bg-[#A78BFA]/10 blur-xl transition group-hover:bg-[#67E8F9]/12" />
    </article>
  );
}
