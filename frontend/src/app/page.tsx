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
  const res = await fetch(
    `${API_URL}/api/fixtures/difficulty?start_event=24&window_size=5`
  );
  if (!res.ok) {
    throw new Error(`Backend request failed: ${res.status}`);
  }
  return res.json();
}

export default async function Home() {
  const fixtures = await getFixtureDifficulty();

  return (
    <main className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-semibold text-black dark:text-zinc-50">
          FPL Assistant
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Fixture difficulty ranking - next 5 gameweeks (demo data, GW24-28)
        </p>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2">Team</th>
                <th className="px-4 py-2">Fixtures</th>
                <th className="px-4 py-2">Score</th>
                <th className="px-4 py-2">Avg FDR</th>
                <th className="px-4 py-2">Ticker</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((row) => (
                <tr
                  key={row.team_id}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-4 py-2 font-medium">{row.team}</td>
                  <td className="px-4 py-2">{row.fixtures_in_window}</td>
                  <td className="px-4 py-2">{row.fixture_score}</td>
                  <td className="px-4 py-2">{row.avg_difficulty ?? "-"}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.ticker}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
