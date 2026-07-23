import { TeamBadge } from "@/components/pitch/TeamBadge";

type FixtureRow = {
  team_id: number;
  team: string;
  fixtures_in_window: number;
  fixture_score: number;
  avg_difficulty: number | null;
  ticker: string;
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

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 font-sans text-2xl font-bold text-pl-purple">
          Fixtures
        </h1>
        <p className="mb-6 max-w-xl text-text-secondary">
          Fixture difficulty ranking - next 5 gameweeks of the real 2026/27
          season (GW1-5). Player-level pages still use demo data from
          2025/26 until FPL resets player stats for the new season.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Fixtures</th>
                <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Score</th>
                <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Avg FDR</th>
                <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Ticker</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((row) => (
                <tr key={row.team_id} className="border-t border-border">
                  <td className="px-3.5 py-2.5 font-medium">
                    <TeamBadge teamShort={row.team} name={row.team} />
                  </td>
                  <td className="px-3.5 py-2.5 font-mono">{row.fixtures_in_window}</td>
                  <td className="px-3.5 py-2.5 font-mono">{row.fixture_score}</td>
                  <td className="px-3.5 py-2.5 font-mono">{row.avg_difficulty ?? "-"}</td>
                  <td className="px-3.5 py-2.5 text-text-secondary">{row.ticker}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
