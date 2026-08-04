import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { FdrChip } from "@/shared/ui/FdrChip";
import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { FixtureDifficultyRow } from "@/shared/types/api";

/**
 * Every club's run of fixtures, kindest first - shared between /matches
 * (whole-league view) and the squad transfer plan (scoped to the plan
 * window), which is why this lives in shared/ui rather than either feature.
 */
export function FixtureDifficultyTable({
  rows,
  windowSize = 5,
}: {
  rows: FixtureDifficultyRow[];
  /** How many gameweeks `fixtures` covers - just the column header, the caller decides the actual window. */
  windowSize?: number;
}) {
  const sorted = [...rows].sort((a, b) => (a.avg_difficulty ?? 6) - (b.avg_difficulty ?? 6));

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-cards w-full text-left text-sm">
          <thead className="bg-surface-sunken">
            <tr>
              <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Team</th>
              <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                <span className="inline-flex items-center gap-1">
                  Avg FDR <InfoTooltip term="avgFdr" />
                </span>
              </th>
              <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                <span className="inline-flex items-center gap-1">
                  Next {windowSize} <InfoTooltip term="fdr" />
                </span>
              </th>
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
