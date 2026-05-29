export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const buttonVariants = {
  primary: "premium-action",
  secondary: "premium-secondary-action",
  ghost:
    "border-transparent bg-transparent text-white/[0.68] hover:bg-white/[0.06] hover:text-white",
  danger: "premium-danger-action",
};

export function Button({ as: Component = "button", variant = "primary", size = "md", className = "", children, ...props }) {
  const sizes = {
    sm: "h-9 rounded-xl px-3 text-xs",
    md: "h-10 rounded-xl px-4 text-sm",
    lg: "h-11 rounded-2xl px-5 text-sm",
  };

  return (
    <Component
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 border font-semibold shadow-sm transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50",
        sizes[size] || sizes.md,
        buttonVariants[variant] || buttonVariants.primary,
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Card({ as: Component = "section", variant = "default", interactive = false, className = "", children, ...props }) {
  const variants = {
    default: "dashboard-card rounded-[1.35rem] border p-5 md:p-6",
    compact: "dashboard-card rounded-[1.2rem] border p-4",
    nested: "dashboard-subcard rounded-2xl border p-4",
    flat: "dashboard-subcard rounded-[1.35rem] border p-5",
  };

  return (
    <Component
      className={cn(
        variants[variant] || variants.default,
        interactive && "transition duration-200 hover:-translate-y-1 hover:border-white/[0.16] hover:shadow-[0_26px_70px_rgba(0,0,0,0.34)]",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function PageShell({ children, className = "" }) {
  return <div className={cn("space-y-7 md:space-y-9", className)}>{children}</div>;
}

export function SectionStack({ children, className = "" }) {
  return <div className={cn("grid gap-4 md:gap-6", className)}>{children}</div>;
}

export function Field({ as: Component = "input", className = "", ...props }) {
  return (
    <Component
      className={cn(
        "dashboard-field h-11 w-full rounded-xl border border-white/10 bg-[#0A0F1C]/[0.92] px-3.5 text-sm text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15",
        Component === "textarea" && "h-auto min-h-28 py-3 leading-6 resize-y",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, className = "", ...props }) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-white/78", className)} {...props}>
      {children}
    </label>
  );
}

const badgeVariants = {
  neutral: "border-white/[0.08] bg-white/[0.07] text-white/[0.74]",
  accent: "border-[#A78BFA]/15 bg-[#A78BFA]/12 text-[#DDD6FE]",
  slate: "border-white/[0.08] bg-[#94A3B8]/10 text-white/[0.72]",
  success: "border-cyan-300/15 bg-cyan-400/10 text-cyan-100",
  warning: "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-100",
  danger: "border-rose-300/15 bg-rose-500/10 text-rose-100",
};

export function Badge({ variant = "neutral", className = "", children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        badgeVariants[variant] || badgeVariants.neutral,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Tag({ children, variant = "slate", className = "", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[11px] font-medium leading-none",
        badgeVariants[variant] || badgeVariants.slate,
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

export function EmptyState({ title = "Nothing here yet", description, action, className = "" }) {
  return (
    <Card variant="flat" className={cn("border-dashed py-10 text-center", className)}>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/[0.68]">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function LoadingState({ label = "Loading..." }) {
  return (
    <Card variant="compact" className="inline-flex items-center gap-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[#A78BFA]" />
      <span className="text-sm font-medium text-white/[0.72]">{label}</span>
    </Card>
  );
}

