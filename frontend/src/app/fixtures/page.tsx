import { TeamBadge } from "@/components/pitch/TeamBadge";
import { FdrChip } from "@/components/ui/FdrChip";
import { Card } from "@/components/ui/Card";
import { SeasonDataNote } from "@/components/ui/SeasonDataNote";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";

type Fixture = { opponent: string; is_home: boolean; difficulty: number };

type FixtureRow = {
  team_id: number;
  team: string;
  fixtures_in_window: number;
  avg_difficulty: number | null;
  fixtures: Fixture[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getFixtureDifficulty(): Promise<FixtureRow[]> {
  // GW1 of the real, live 2026/27 fixture calendar - unlike player scoring
  // (still demo/archived data until FPL resets stats), fixture difficulty
  // only needs the team/fixture calendar, which is already live. See README.
  const res = await fetch(
    `${API_URL}/api/fixtures/difficulty?start_event=1&window_size=5`
  );
  if (!res.ok) {
    throw new Error(`Backend request failed: ${res.status}`);
  }
  return res.json();
}

export default async function Home() {
  const fixtures = await getFixtureDifficulty();
  const sorted = [...fixtures].sort((a, b) => (a.avg_difficulty ?? 6) - (b.avg_difficulty ?? 6));

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Fixture difficulty"
        subtitle={
          <>
            Next 5 gameweeks, 2026/27, easiest run first - this page is fully live (no prediction model, just the
            fixture calendar). Player pages: <SeasonDataNote mode="blended" />
          </>
        }
      />
      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
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
                  <td className="px-3.5 py-2.5 font-medium">
                    <TeamBadge teamShort={row.team} name={row.team} />
                  </td>
                  <td className="px-3.5 py-2.5 font-mono">{row.avg_difficulty ?? "-"}</td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {row.fixtures.length > 0 ? (
                        row.fixtures.map((fx, i) => (
                          <FdrChip key={i} opponent={fx.opponent} isHome={fx.is_home} difficulty={fx.difficulty} />
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
