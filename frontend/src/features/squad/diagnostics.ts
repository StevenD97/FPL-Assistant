/**
 * Squad diagnostics: turns a draft into the ranked list of insights the builder
 * shows one at a time - club concentration, fixture runs, penalty duty, value
 * and position strength against the relevant market, rotation risk.
 *
 * Pure: no React, no fetching. This was ~260 lines in the middle of
 * BuildSquadPanel, which is most of why that file was unreadable and why none
 * of this logic could be tested on its own.
 */
import type {
  FixtureChip,
  PoolPlayer,
  Position,
  SquadBuilderFixtureRow,
} from "@/shared/types/api";

export type Tone = "positive" | "warning" | "info";

export type Insight = {
  tone: Tone;
  title: string;
  detail: string;
  badgeUrl?: string;
  fixtures?: FixtureChip[];
  stat?: { value: number; avg: number; unit: string };
  gauge?: { pct: number };
  suggestions?: PoolPlayer[];
};

export const POSITION_ORDER: Position[] = ["GKP", "DEF", "MID", "FWD"];
export const POSITION_LIMITS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
export const MAX_PER_CLUB = 3;
// Exported so the loaded squad's Fixture outlook read grades a run the same way
// the builder's diagnostics do - two surfaces disagreeing about what counts as
// an easy run would be a bug the reader has no way to explain.
export const TOUGH_FIXTURE_THRESHOLD = 3.2; // rough FDR (1-5 scale) worth flagging
export const EASY_FIXTURE_THRESHOLD = 2.4; // ... and worth celebrating
const STRONG_FIXTURE_TEAMS_TO_CHECK = 4;
const MAX_SUGGESTIONS = 3;
// Below this share of a "nailed" starter's appearance_points (max ~2.0 per
// fixture: p_any + p_60_plus, see team_model.py's _fixture_points), a
// player's own recent minutes history says they're not a safe starter.
const ROTATION_RISK_THRESHOLD = 1.3;
// Value-for-money and position-strength bands, both sides of "par" (the
// relevant-market average computed below) - below the low band is a
// warning-grade insight, above the high band is a positive one.
const VALUE_BELOW_PAR = 0.7;
const VALUE_ABOVE_PAR = 1.3;
const POSITION_BELOW_PAR = 0.75;
const POSITION_ABOVE_PAR = 1.15;
// How many of the position's best-predicted players to treat as "the
// relevant market" when judging whether a squad player's price or output
// is below par - comparing against the full ~140-per-position pool
// (mostly bench fodder that'll never play) would set a bar too low to be
// useful; this narrows it to players actually worth comparing against.
const RELEVANT_POOL_SIZE = 24;
const STATUS_WORDS: Record<string, string> = {
  d: "a doubt", i: "injured", s: "suspended", u: "unavailable", n: "not in the squad",
};

function relevantPoolByPosition(allPlayers: PoolPlayer[]): Record<Position, PoolPlayer[]> {
  const result = {} as Record<Position, PoolPlayer[]>;
  for (const pos of POSITION_ORDER) {
    result[pos] = allPlayers
      .filter((p) => p.position === pos)
      .sort((a, b) => b.predicted_points - a.predicted_points)
      .slice(0, RELEVANT_POOL_SIZE);
  }
  return result;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

export function computeDiagnostics(
  squad: PoolPlayer[],
  squadIds: Set<number>,
  fixtures: SquadBuilderFixtureRow[],
  allPlayers: PoolPlayer[],
  budgetRemaining: number
): Insight[] {
  const insights: Insight[] = [];
  if (squadIds.size === 0) return insights;

  const neededPositions = POSITION_ORDER.filter(
    (pos) => squad.filter((p) => p.position === pos).length < POSITION_LIMITS[pos]
  );

  function topSuggestions(pool: PoolPlayer[]): PoolPlayer[] {
    let candidates = pool.filter((p) => !squadIds.has(p.id) && p.cost <= budgetRemaining);
    if (neededPositions.length > 0) {
      candidates = candidates.filter((p) => neededPositions.includes(p.position));
    }
    return [...candidates].sort((a, b) => b.predicted_points - a.predicted_points).slice(0, MAX_SUGGESTIONS);
  }

  // Club concentration - 3 is FPL's real max, so hitting it is a correlated-risk warning, not an error.
  const clubCounts = new Map<string, number>();
  for (const p of squad) clubCounts.set(p.team_short, (clubCounts.get(p.team_short) ?? 0) + 1);
  const badgeByClub = new Map(fixtures.map((f) => [f.team, f.team_badge]));
  for (const [club, count] of clubCounts) {
    if (count >= MAX_PER_CLUB) {
      insights.push({
        tone: "warning",
        title: `Heavy on ${club}`,
        detail: `${count} players from the same club is a correlated risk if their fixtures turn.`,
        badgeUrl: badgeByClub.get(club),
      });
    }
  }

  // Missing exposure to one of the league's best upcoming fixture runs.
  const ownedTeams = new Set(squad.map((p) => p.team_short));
  const sortedFixtures = [...fixtures].sort((a, b) => b.fixture_score - a.fixture_score);
  for (const f of sortedFixtures.slice(0, STRONG_FIXTURE_TEAMS_TO_CHECK)) {
    if (ownedTeams.has(f.team)) continue;
    insights.push({
      tone: "info",
      title: `No ${f.team} players`,
      detail: "One of the easier upcoming runs in the league - a gap in your squad's fixture coverage.",
      badgeUrl: f.team_badge,
      fixtures: f.fixtures,
      suggestions: topSuggestions(allPlayers.filter((p) => p.team_short === f.team)),
    });
  }

  // Tough or easy fixtures among teams you already own.
  for (const club of ownedTeams) {
    const row = fixtures.find((f) => f.team === club);
    if (!row || row.avg_difficulty === null) continue;
    const names = squad.filter((p) => p.team_short === club).map((p) => p.web_name).join(", ");
    if (row.avg_difficulty >= TOUGH_FIXTURE_THRESHOLD) {
      insights.push({
        tone: "warning",
        title: `Tough run for ${club}`,
        detail: `${names} - a stretch worth planning a transfer or bench move around.`,
        badgeUrl: row.team_badge,
        fixtures: row.fixtures,
      });
    } else if (row.avg_difficulty <= EASY_FIXTURE_THRESHOLD) {
      insights.push({
        tone: "positive",
        title: `Great run for ${club}`,
        detail: `${names} - one of the kinder schedules in the league right now.`,
        badgeUrl: row.team_badge,
        fixtures: row.fixtures,
      });
    }
  }

  // No recognized primary penalty taker.
  if (!squad.some((p) => p.penalties_order === 1)) {
    insights.push({
      tone: "warning",
      title: "No penalty taker",
      detail: "Nobody in your squad is a recognized primary penalty taker - missing a high-value goal source.",
      suggestions: topSuggestions(allPlayers.filter((p) => p.penalties_order === 1)),
    });
  }

  // No recognized primary direct free-kick taker.
  if (!squad.some((p) => p.direct_freekicks_order === 1)) {
    insights.push({
      tone: "info",
      title: "No free-kick taker",
      detail: "A low-frequency but high-value extra goal source nobody in your squad covers.",
      suggestions: topSuggestions(allPlayers.filter((p) => p.direct_freekicks_order === 1)),
    });
  }

  // No recognized primary corner/indirect free-kick taker.
  if (!squad.some((p) => p.corners_and_indirect_freekicks_order === 1)) {
    insights.push({
      tone: "info",
      title: "No corner-taker",
      detail: "Missing a source of assists from set-piece deliveries.",
      suggestions: topSuggestions(allPlayers.filter((p) => p.corners_and_indirect_freekicks_order === 1)),
    });
  }

  // Injured/doubtful/suspended players already in the squad - easy to miss
  // as just a small badge on the row, worth calling out explicitly.
  for (const p of squad) {
    if (p.status && p.status !== "a") {
      const word = STATUS_WORDS[p.status] ?? "flagged";
      insights.push({
        tone: "warning",
        title: `${p.web_name} is ${word}`,
        detail: p.news || "Consider a replacement while it's unresolved.",
        suggestions: topSuggestions(allPlayers.filter((alt) => alt.position === p.position && alt.status === "a")),
      });
    }
  }

  // Rotation/gametime risk - one card per player, so the gauge reads clean.
  for (const p of squad) {
    if (p.fixture_count === 0) continue;
    const ratio = p.appearance_points / p.fixture_count;
    if (ratio < ROTATION_RISK_THRESHOLD) {
      insights.push({
        tone: "warning",
        title: `Rotation risk: ${p.web_name}`,
        detail: "Recent minutes say he's not a nailed starter - a benched gameweek is a real risk.",
        gauge: { pct: Math.round((ratio / 2) * 100) },
      });
    }
  }

  // Value and output vs the relevant market at each position (see
  // RELEVANT_POOL_SIZE) - comparing every squad player against the
  // players actually worth comparing them to, not the whole ~140-deep
  // position pool most of which will never play.
  const relevantPool = relevantPoolByPosition(allPlayers);
  const relevantAvg: Record<Position, { value: number; points: number }> = {} as Record<
    Position,
    { value: number; points: number }
  >;
  for (const pos of POSITION_ORDER) {
    relevantAvg[pos] = {
      value: mean(relevantPool[pos].map((p) => p.value)),
      points: mean(relevantPool[pos].map((p) => p.predicted_points)),
    };
  }

  for (const p of squad) {
    const avg = relevantAvg[p.position];
    if (avg.value <= 0) continue;
    if (p.value < avg.value * VALUE_BELOW_PAR) {
      insights.push({
        tone: "info",
        title: `${p.web_name}: below-par value`,
        detail: `His price isn't earning its keep against comparable ${p.position}s.`,
        stat: { value: p.value, avg: avg.value, unit: " pts/£m" },
        suggestions: allPlayers
          .filter((alt) => alt.position === p.position && alt.id !== p.id && !squadIds.has(alt.id) && alt.cost <= p.cost + budgetRemaining)
          .sort((a, b) => b.value - a.value)
          .slice(0, MAX_SUGGESTIONS),
      });
    } else if (p.value > avg.value * VALUE_ABOVE_PAR) {
      insights.push({
        tone: "positive",
        title: `${p.web_name}: elite value`,
        detail: `Comfortably outperforming comparable ${p.position}s on price.`,
        stat: { value: p.value, avg: avg.value, unit: " pts/£m" },
      });
    }
  }

  for (const pos of POSITION_ORDER) {
    const squadAtPos = squad.filter((p) => p.position === pos);
    if (squadAtPos.length === 0) continue;
    const squadAvgPts = mean(squadAtPos.map((p) => p.predicted_points));
    const avg = relevantAvg[pos];
    if (avg.points <= 0) continue;
    if (squadAvgPts < avg.points * POSITION_BELOW_PAR) {
      insights.push({
        tone: "info",
        title: `${pos}s below par`,
        detail: "Lagging the position's top performers - an upgrade here would move the needle most.",
        stat: { value: squadAvgPts, avg: avg.points, unit: " pts" },
      });
    } else if (squadAvgPts > avg.points * POSITION_ABOVE_PAR) {
      insights.push({
        tone: "positive",
        title: `${pos}s are elite`,
        detail: "Among the best returns at the position - a real strength of this squad.",
        stat: { value: squadAvgPts, avg: avg.points, unit: " pts" },
      });
    }
  }

  // Warnings first, then neutral observations, positives last - so cycling
  // through starts with what needs attention and ends on a high note.
  const toneWeight: Record<Tone, number> = { warning: 0, info: 1, positive: 2 };
  return [...insights].sort((a, b) => toneWeight[a.tone] - toneWeight[b.tone]);
}
