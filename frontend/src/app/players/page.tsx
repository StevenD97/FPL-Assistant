"use client";

import { useEffect, useMemo, useState } from "react";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextField } from "@/components/ui/TextField";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { TeamBadge } from "@/components/pitch/TeamBadge";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POSITIONS = ["All", "GKP", "DEF", "MID", "FWD"] as const;

type Player = {
  id: number;
  web_name: string;
  team_short: string;
  position: string;
  cost: number;
  predicted_points: number;
  value: number;
  selected_by_percent: number;
  status: string;
  news: string;
  season_stats: { total_points: number } | null;
};

type SortKey = "predicted_points" | "cost" | "value" | "selected_by_percent" | "season_points";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "predicted_points", label: "Predicted pts" },
  { key: "cost", label: "Cost" },
  { key: "value", label: "Value" },
  { key: "selected_by_percent", label: "Own%" },
  { key: "season_points", label: "25/26 pts" },
];

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("predicted_points");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/players`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setPlayers(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function sortValue(p: Player, key: SortKey): number {
    if (key === "season_points") return p.season_stats?.total_points ?? -1;
    return p[key];
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const rows = useMemo(() => {
    if (!players) return [];
    let pool = players;
    if (position !== "All") pool = pool.filter((p) => p.position === position);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pool = pool.filter((p) => p.web_name.toLowerCase().includes(q) || p.team_short.toLowerCase().includes(q));
    }
    return [...pool].sort((a, b) => (sortValue(b, sortKey) - sortValue(a, sortKey)) * (sortDesc ? 1 : -1));
  }, [players, position, search, sortKey, sortDesc]);

  return (
    <PageContainer>
      <PageHeader
        title="All players"
        subtitle="Every player in the live 2026/27 game - click a column to sort, click a name for full detail."
        action={players ? <span className="font-mono text-sm text-text-muted">{rows.length} players</span> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or team..."
          wrapperClassName="w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map((pos) => (
            <Pill key={pos} active={position === pos} onClick={() => setPosition(pos)}>
              {pos === "All" ? "All positions" : pos}
            </Pill>
          ))}
        </div>
      </div>

      {loading && <p className="text-text-muted">Loading players...</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {players && (
        <Card padded={false} className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-surface-sunken">
                <tr>
                  <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Player</th>
                  <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Team</th>
                  <th className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Pos</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 hover:text-text-primary">
                        {c.label}
                        {sortKey === c.key && <span className="text-pl-purple">{sortDesc ? "↓" : "↑"}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-border transition-colors hover:bg-surface-sunken">
                    <td className="px-3.5 py-2.5 font-medium">
                      <PlayerLink id={p.id}>{p.web_name}</PlayerLink>
                      <StatusBadge status={p.status} news={p.news} />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <TeamBadge teamShort={p.team_short} name={p.team_short} />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <PositionBadge position={p.position} />
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-semibold text-pl-purple">{p.predicted_points.toFixed(1)}</td>
                    <td className="px-3.5 py-2.5 font-mono">£{p.cost.toFixed(1)}m</td>
                    <td className="px-3.5 py-2.5 font-mono">{p.value.toFixed(2)}</td>
                    <td className="px-3.5 py-2.5 font-mono">{p.selected_by_percent.toFixed(1)}%</td>
                    <td className="px-3.5 py-2.5 font-mono">{p.season_stats?.total_points ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
