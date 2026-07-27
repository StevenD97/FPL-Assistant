"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { TeamBadge } from "@/components/pitch/TeamBadge";
import { useTeam } from "@/components/team/TeamProvider";
import { formatRank } from "@/lib/team";
import { API_URL, fetchJson } from "@/lib/api";

type SquadPlayer = {
  web_name: string;
  team_short: string;
  role: string;
  captain_flag: string;
  status: string;
  news: string;
  rotation_risk: number;
  live_id: number | null;
};

type FixtureOutlookRow = {
  team_short: string;
  avg_difficulty: number | null;
};

type SquadResponse = {
  entry_name: string;
  event: number;
  points: number;
  squad_value: number;
  bank: number;
  squad: SquadPlayer[];
  fixture_outlook: FixtureOutlookRow[];
};

type OwnedMover = {
  id: number;
  web_name: string;
  team_short: string;
  team_badge: string;
  net_transfers_event: number;
  direction: "rising" | "falling" | "stable";
  already_moved_today: boolean;
};

// Roughly "started fewer than 3 games in 5" - mirrors the spirit of
// squad-builder's own rotation-risk flagging, adapted to this field's
// scale (rotation_risk = 1 - starts/team_played, see compute_player_scores).
const ROTATION_RISK_THRESHOLD = 0.4;
// FPL's own 1(easiest)-5(hardest) FDR scale.
const TOUGH_FIXTURE_THRESHOLD = 3.4;
const STATUS_WORDS: Record<string, string> = {
  d: "a doubt",
  i: "injured",
  s: "suspended",
  u: "unavailable",
  n: "not in the squad",
};

function buildWeakPoints(squad: SquadResponse): string[] {
  const notes: string[] = [];
  for (const p of squad.squad) {
    if (p.status && p.status !== "a") {
      const word = STATUS_WORDS[p.status] ?? "flagged";
      notes.push(`${p.web_name} is ${word}${p.news ? ` (${p.news})` : ""}.`);
    }
  }
  for (const p of squad.squad) {
    if (p.role === "Starting XI" && p.rotation_risk >= ROTATION_RISK_THRESHOLD) {
      const startPct = Math.round((1 - p.rotation_risk) * 100);
      notes.push(`${p.web_name} has only started around ${startPct}% of ${p.team_short}'s recent games.`);
    }
  }
  for (const f of squad.fixture_outlook) {
    if ((f.avg_difficulty ?? 0) >= TOUGH_FIXTURE_THRESHOLD) {
      notes.push(`${f.team_short} face a tough run (avg FDR ${f.avg_difficulty}).`);
    }
  }
  return notes;
}

// The connected-state replacement for GetStartedSteps: once a manager's
// first gameweek has locked, this becomes a real dashboard (last week's
// score, squad weak points, price watch for their own players) instead of
// an onboarding prompt. Pre-season, /api/squad/{id} 404s for everyone (FPL
// has no pick history until a gameweek locks) - that's treated as an
// expected waiting state, not an error, and resolves itself automatically
// once the season starts, no season-boundary logic needed here.
export function Dashboard() {
  const { entry } = useTeam();
  const [squad, setSquad] = useState<SquadResponse | null>(null);
  const [squadError, setSquadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [movers, setMovers] = useState<OwnedMover[] | null>(null);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setSquadError(null);
      try {
        const data = await fetchJson<SquadResponse>(`${API_URL}/api/squad/${entry!.id}`);
        if (cancelled) return;
        setSquad(data);
        const ids = data.squad.map((p) => p.live_id).filter((id): id is number => id != null);
        if (ids.length > 0) {
          fetchJson<{ owned: OwnedMover[] }>(`${API_URL}/api/players/price-watch?player_ids=${ids.join(",")}`)
            .then((pw) => {
              if (!cancelled) setMovers(pw.owned);
            })
            .catch(() => {
              if (!cancelled) setMovers([]);
            });
        }
      } catch (err) {
        if (!cancelled) setSquadError(err instanceof Error ? err.message : "Couldn't load your squad");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (!entry) return null;

  const name = entry.player_name ?? entry.team_name ?? `Team ${entry.id}`;

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-text-muted">Loading your dashboard...</p>
      </Card>
    );
  }

  if (squadError || !squad) {
    return (
      <Card>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-pl-purple/60">Your dashboard</span>
          <h2 className="text-md font-semibold text-text-primary">Connected as {name}</h2>
          <p className="text-sm text-text-secondary">
            Your gameweek performance, squad weak points, and price watch for your own players will show up
            here once your first gameweek locks.{" "}
            <Link href="/squad" className="font-semibold text-pl-purple hover:underline">
              View your squad now →
            </Link>
          </p>
        </div>
      </Card>
    );
  }

  const weakPoints = buildWeakPoints(squad);
  const captain = squad.squad.find((p) => p.captain_flag === "(C)");
  const movingPlayers = (movers ?? []).filter((m) => m.direction !== "stable");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-pl-purple/60">Your dashboard</span>
        <h2 className="text-lg font-bold tracking-tight text-pl-purple">{squad.entry_name}</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Gameweek {squad.event}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-pl-purple">
            {squad.points} <span className="text-sm font-normal text-text-muted">pts</span>
          </p>
          {entry.overall_rank != null && (
            <p className="mt-1 text-xs text-text-secondary">
              Overall rank <span className="font-mono font-semibold text-text-primary">{formatRank(entry.overall_rank)}</span>
            </p>
          )}
          <Link href="/squad" className="mt-2 inline-block text-xs font-semibold text-pl-purple hover:underline">
            View squad →
          </Link>
        </Card>

        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Worth a look</p>
          {weakPoints.length === 0 ? (
            <p className="mt-1.5 text-xs text-text-secondary">No flags - your squad looks clean.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {weakPoints.slice(0, 3).map((note, i) => (
                <li key={i} className="text-xs leading-relaxed text-text-secondary">
                  {note}
                </li>
              ))}
            </ul>
          )}
          <Link href="/squad" className="mt-2 inline-block text-xs font-semibold text-pl-purple hover:underline">
            See suggested transfers →
          </Link>
        </Card>

        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Squad</p>
          <div className="mt-1.5 flex flex-col gap-1 text-xs text-text-secondary">
            <span>
              Value <span className="font-mono font-semibold text-text-primary">£{squad.squad_value.toFixed(1)}m</span>
            </span>
            <span>
              Bank <span className="font-mono font-semibold text-text-primary">£{squad.bank.toFixed(1)}m</span>
            </span>
            {captain && (
              <span>
                Captain <span className="font-semibold text-text-primary">{captain.web_name}</span>
              </span>
            )}
          </div>
        </Card>
      </div>

      {movingPlayers.length > 0 && (
        <Card padded={false} className="overflow-hidden">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Price watch - your players</p>
          </div>
          <ul>
            {movingPlayers.slice(0, 4).map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm first:border-t-0"
              >
                <TeamBadge teamShort={m.team_short} name={m.web_name} badgeUrl={m.team_badge} />
                <span
                  className={`font-mono text-xs font-semibold ${
                    m.direction === "rising" ? "text-success" : "text-danger"
                  }`}
                >
                  {m.direction === "rising" ? "+" : "-"}
                  {Math.abs(m.net_transfers_event)}
                  {m.already_moved_today ? " (moved)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
