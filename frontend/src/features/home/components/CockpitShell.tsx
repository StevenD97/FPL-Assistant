import Link from "next/link";
import { Countdown } from "@/shared/ui/Countdown";
import { NEXT_DEADLINE_LABEL } from "@/shared/lib/deadline";

/**
 * The purple hero treatment, reused by both cockpit states so the page keeps
 * the same shape pre-season and once the season is live - it fills in rather
 * than changing shape at GW1.
 */
export function CockpitShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-fpl-hero relative overflow-hidden rounded-lg p-6 text-white lg:p-8">
      {/* The green bloom the hero and every blog cover share. */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(0,255,135,0.28),transparent_70%)]" />

      <div className="relative flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pl-green">
              {eyebrow}
            </span>
            <h1 className="mt-1 truncate text-2xl font-bold leading-tight tracking-tight lg:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-sm text-[#e6d4ea]">{subtitle}</p>}
          </div>

          <Link
            href="/squad"
            className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-right transition-colors hover:bg-white/15"
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-pl-green">
              Deadline
            </span>
            <Countdown className="block text-lg font-bold text-white" />
            <span className="block text-[10px] text-[#c9a9d1]">{NEXT_DEADLINE_LABEL}</span>
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}

/** A translucent stat tile for use on the purple hero. */
export function CockpitStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/10 px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#c9a9d1]">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-extrabold leading-none text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-[#c9a9d1]">{hint}</p>}
    </div>
  );
}
