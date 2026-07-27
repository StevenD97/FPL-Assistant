"use client";

import { useEffect, useMemo, useState } from "react";
import { TextField } from "@/shared/ui/TextField";
import { Pill } from "@/shared/ui/Pill";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { PlayerListCard, type PlayerListItem } from "@/features/players/PlayerListCard";
import { API_URL } from "@/shared/lib/api";

const POSITIONS = ["All", "GKP", "DEF", "MID", "FWD"] as const;
const MAX_VISIBLE = 60;

type SortKey = "predicted_points" | "value" | "selected_by_percent" | "season_points" | "cost";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "predicted_points", label: "xPts" },
  { key: "value", label: "Value" },
  { key: "selected_by_percent", label: "Owned" },
  { key: "season_points", label: "Season pts" },
  { key: "cost", label: "Price" },
];

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("predicted_points");

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

  function sortValue(p: PlayerListItem, key: SortKey): number {
    if (key === "season_points") return p.season_stats?.total_points ?? -1;
    return p[key];
  }

  const rows = useMemo(() => {
    if (!players) return [];
    let pool = players;
    if (position !== "All") pool = pool.filter((p) => p.position === position);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pool = pool.filter((p) => p.web_name.toLowerCase().includes(q) || p.team_short.toLowerCase().includes(q));
    }
    return [...pool].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
  }, [players, position, search, sortKey]);

  const visible = rows.slice(0, MAX_VISIBLE);

  return (
    <PageContainer>
      <PageHeader
        title="All players"
        subtitle="Every player in the live 2026/27 game - filter, sort, and tap a card for full detail."
        action={players ? <span className="font-mono text-sm text-text-muted">{rows.length} players</span> : undefined}
      />

      <div className="flex flex-col gap-2">
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Sort</span>
          {SORTS.map((s) => (
            <Pill key={s.key} active={sortKey === s.key} onClick={() => setSortKey(s.key)}>
              {s.label}
            </Pill>
          ))}
        </div>
      </div>

      {loading && <p className="text-text-muted">Loading players...</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {players && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <PlayerListCard key={p.id} p={p} />
            ))}
          </div>
          {rows.length > MAX_VISIBLE && (
            <p className="pt-1 text-center text-xs text-text-muted">
              Showing the top {MAX_VISIBLE} by {SORTS.find((s) => s.key === sortKey)?.label} · search or filter to
              narrow the other {rows.length - MAX_VISIBLE}.
            </p>
          )}
          {rows.length === 0 && <p className="text-sm text-text-muted">No players match those filters.</p>}
        </>
      )}
    </PageContainer>
  );
}
