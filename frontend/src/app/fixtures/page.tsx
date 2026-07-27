import { TeamBadge } from "@/components/pitch/TeamBadge";
import { FdrChip } from "@/components/ui/FdrChip";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";

// This page's data changes with the live fixture calendar, so it should
// never be frozen into a static build artifact - force-dynamic also means
// Next.js never attempts this page's fetch *at build time*, which used to
// take the whole Vercel deployment down if the backend wasn't reachable
// the moment the build ran (a cold Render free-tier instance, a missing
// NEXT_PUBLIC_API_URL, etc.) - one page's data being briefly unreachable
// should never block shipping everything else.
export const dynamic = "force-dynamic";

type Fixture = { opponent: string; is_home: boolean; difficulty: number; opponent_badge: string };

type FixtureRow = {
  team_id: number;
  team: string;
  team_badge: string;
  fixtures_in_window: number;
  avg_difficulty: number | null;
  fixtures: Fixture[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Returns null on any failure (network error, backend down, bad response)
// instead of throwing - a Server Component that throws mid-render shows
// Next.js's generic error page, not a message a visitor can make sense of.
async function getFixtureDifficulty(): Promise<FixtureRow[] | null> {
  // GW1 of the real, live 2026/27 fixture calendar - unlike player scoring
  // (still demo/archived data until FPL resets stats), fixture difficulty
  // only needs the team/fixture calendar, which is already live. See README.
  try {
    const res = await fetch(`${API_URL}/api/fixtures/difficulty?start_event=1&window_size=5`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const fixtures = await getFixtureDifficulty();

  if (!fixtures) {
    return (
      <PageContainer width="narrow">
        <PageHeader title="Fixture difficulty" subtitle="Every team's next 5 gameweeks, ranked easiest to hardest." />
        <Alert kind="warning">Couldn&apos;t load fixture data right now - try refreshing in a moment.</Alert>
      </PageContainer>
    );
  }

  const sorted = [...fixtures].sort((a, b) => (a.avg_difficulty ?? 6) - (b.avg_difficulty ?? 6));

  return (
    <PageContainer width="narrow">
      <PageHeader title="Fixture difficulty" subtitle="Every team's next 5 gameweeks, ranked easiest to hardest." />
      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-cards w-full text-left text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Team</th>
                <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Avg FDR</th>
                <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Next 5</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.team_id} className="border-t border-border transition-colors hover:bg-surface-sunken">
                  <td className="cell-primary px-3.5 py-2.5 font-medium">
                    <TeamBadge teamShort={row.team} name={row.team} badgeUrl={row.team_badge} />
                  </td>
                  <td data-label="Avg FDR" className="px-3.5 py-2.5 font-mono">{row.avg_difficulty ?? "-"}</td>
                  <td data-label="Next 5" className="px-3.5 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {row.fixtures.length > 0 ? (
                        row.fixtures.map((fx, i) => (
                          <FdrChip
                            key={i}
                            opponent={fx.opponent}
                            isHome={fx.is_home}
                            difficulty={fx.difficulty}
                            badgeUrl={fx.opponent_badge}
                          />
                        ))
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                      {row.fixtures_in_window < 5 &&
                        Array.from({ length: 5 - row.fixtures_in_window }).map((_, i) => (
                          <span
                            key={`blank-${i}`}
                            className="inline-flex items-center justify-center rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-text-muted"
                          >
                            -
                          </span>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageContainer>
  );
}
