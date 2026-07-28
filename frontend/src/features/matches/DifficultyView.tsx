"use client";

import { useEffect, useState } from "react";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { FdrChip } from "@/shared/ui/FdrChip";
import { Card } from "@/shared/ui/Card";
import { Skeleton } from "@/shared/ui/Skeleton";
import { apiGet } from "@/shared/lib/api";
import type { FixtureDifficultyRow } from "@/shared/types/api";

// One row per PL club (20), each with a team cell, an avg-FDR cell, and a
// run of five fixture chips - the same three columns as the loaded table.
function DifficultySkeleton() {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="divide-y divide-border">
        <div className="flex items-center gap-4 bg-surface-sunken px-3.5 py-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-12" />
        </div>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3.5 py-2.5">
            <Skeleton className="h-5 w-24 shrink-0" />
            <Skeleton className="h-5 w-8 shrink-0" />
            <div className="flex flex-1 flex-wrap gap-1">
              {Array.from({ length: 5 }).map((__, j) => (
                <Skeleton key={j} className="h-6 w-12 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DifficultyView() {
  const [rows, setRows] = useState<FixtureDifficultyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setRows(
          await apiGet<FixtureDifficultyRow[]>(
            "/api/fixtures/difficulty?start_event=1&window_size=5",
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
    load();
  }, []);

  if (error) return <p className="text-sm font-medium text-danger">{error}</p>;
  if (!rows) return <DifficultySkeleton />;

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
