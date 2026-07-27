"use client";

import { useEffect, useState } from "react";
import { TeamBadge } from "@/components/pitch/TeamBadge";
import { FdrChip } from "@/components/ui/FdrChip";
import { Card } from "@/components/ui/Card";
import { API_URL } from "@/lib/api";


type Fixture = { opponent: string; is_home: boolean; difficulty: number; opponent_badge: string };
type FixtureRow = {
  team_id: number;
  team: string;
  team_badge: string;
  fixtures_in_window: number;
  avg_difficulty: number | null;
  fixtures: Fixture[];
};

export function DifficultyView() {
  const [rows, setRows] = useState<FixtureRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/fixtures/difficulty?start_event=1&window_size=5`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setRows(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
    load();
  }, []);

  if (error) return <p className="text-sm font-medium text-danger">{error}</p>;
  if (!rows) return <p className="text-text-muted">Loading fixture difficulty...</p>;

  const sorted = [...rows].sort((a, b) => (a.avg_difficulty ?? 6) - (b.avg_difficulty ?? 6));

  return (
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
                        <FdrChip key={i} opponent={fx.opponent} isHome={fx.is_home} difficulty={fx.difficulty} badgeUrl={fx.opponent_badge} />
                      ))
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
