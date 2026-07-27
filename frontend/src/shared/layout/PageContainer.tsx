import type { ReactNode } from "react";

// Standard padding/width/rhythm for a page rendered inside the AppShell's
// sunken content area. Every page wraps its body in this so spacing and
// max-width stay consistent.
export function PageContainer({
  children,
  className = "",
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "wide" | "narrow";
}) {
  const max = width === "narrow" ? "max-w-4xl" : "max-w-6xl";
  return (
    <div className={`mx-auto flex w-full flex-col gap-4 px-4 py-5 lg:px-6 lg:py-6 ${max} ${className}`}>
      {children}
    </div>
  );
}

// Page-level title block (matches the prototype: bold purple title over a
// muted subtitle, with an optional right-aligned action/stat).
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        {eyebrow && (
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{eyebrow}</span>
        )}
        <h1 className="text-lg font-bold tracking-tight text-pl-purple">{title}</h1>
        {subtitle && <p className="max-w-2xl text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Smaller heading used within a page to separate sections.
export function SectionHeader({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-md font-semibold text-text-primary">{title}</h2>
      {hint && <span className="font-mono text-sm font-semibold text-success">{hint}</span>}
    </div>
  );
}
