import Link from "next/link";
import { fixtureState } from "@/shared/lib/fixtureState";
import type { ScheduleFixture } from "@/shared/types/api";

function kickoffLabel(iso: string | null): string {
  if (!iso) return "TBC";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBC";
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Badge({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-6 w-6 object-contain" />;
}

export function MatchdayStrip({ event, fixtures }: { event: number; fixtures: ScheduleFixture[] }) {
  if (fixtures.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary/60">
          Gameweek {event} · matchday
        </span>
        <Link href="/matches" className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline">
          Full schedule →
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {fixtures.map((f, i) => {
          const state = fixtureState(f);
          return (
            <div
              key={i}
              className="flex min-w-[136px] shrink-0 flex-col items-center gap-1.5 rounded-lg border border-border bg-surface p-3 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Badge src={f.team_h_badge} alt={f.team_h} />
                <span className="font-mono text-xs font-semibold text-text-secondary">
                  {state === "scheduled"
                    ? "v"
                    : `${f.team_h_score ?? 0}-${f.team_a_score ?? 0}`}
                </span>
                <Badge src={f.team_a_badge} alt={f.team_a} />
              </div>
              <div className="text-[11px] font-semibold text-text-primary">
                {f.team_h} v {f.team_a}
              </div>
              <div
                className={
                  state === "live"
                    ? "text-[11px] font-semibold text-success"
                    : "text-[11px] text-text-muted"
                }
              >
                {state === "live" ? "LIVE" : state === "result" ? "FT" : kickoffLabel(f.kickoff_time)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
