/**
 * Generates src/shared/types/api.d.ts — the single source of truth for backend
 * response shapes.
 *
 * Why not openapi-typescript against /openapi.json? Because the FastAPI routes
 * declare no `response_model`, so every response in the schema is an empty
 * `{}` and openapi-typescript emits `unknown` for all 25 of them. Verified, not
 * assumed. Until response models land, the pinned goldens in
 * backend/tests/golden are the only machine-readable record of what the API
 * actually returns — they are byte-exact snapshots of real responses, asserted
 * on every test run, and refreshed with FPL_UPDATE_GOLDENS=1 pytest.
 *
 * So: infer the types from those snapshots. Nullability and optionality reflect
 * what the snapshot contains, which is a real limitation — a field that happens
 * to be non-null across the sample is typed non-null. That is still strictly
 * better than the hand-written types this replaces, which guessed at the same
 * question and disagreed with each other (two `Fixture` types for
 * /api/fixtures/schedule differed on whether kickoff_time was nullable).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const GOLDEN_DIR = join(import.meta.dirname, "../../backend/tests/golden");
const OUT = join(import.meta.dirname, "../src/shared/types/api.d.ts");

/**
 * golden name -> exported type name + the route it records.
 *
 * Names are pinned here rather than derived from filenames so that the types
 * the whole frontend imports don't get renamed by a golden being renamed, and
 * so they match the hand-written names they replace (keeping the migration an
 * import swap). Adding a route means adding a line here.
 */
const RESPONSES = {
  season_status: ["SeasonStatus", "GET /api/season-status"],
  accuracy: ["AccuracyResponse", "GET /api/accuracy"],
  entry_summary: ["TeamEntry", "GET /api/entry/{team_id}"],
  players_all: ["PlayerListItem", "GET /api/players", "item"],
  player_detail: ["PlayerDetail", "GET /api/players/{player_id}"],
  player_comparison: ["PlayerComparison", "GET /api/players/{player_id}/comparison"],
  player_alternatives: [
    "PlayerAlternative",
    "GET /api/players/{player_id}/alternatives",
    "item",
  ],
  player_trajectory: [
    "PlayerTrajectory",
    "GET /api/players/{player_id}/trajectory",
  ],
  players_price_watch: ["PriceWatchResponse", "GET /api/players/price-watch"],
  players_scores: ["PlayerScore", "GET /api/players/scores", "item"],
  players_predicted_points: [
    "PlayerPredictedPoints",
    "GET /api/players/predicted-points",
    "item",
  ],
  players_predicted_points_outlook: [
    "PlayerOutlook",
    "GET /api/players/predicted-points-outlook",
    "item",
  ],
  fixtures_schedule: ["ScheduleFixture", "GET /api/fixtures/schedule", "item"],
  fixtures_difficulty: [
    "FixtureDifficultyRow",
    "GET /api/fixtures/difficulty",
    "item",
  ],
  squad_builder_players: [
    "PoolPlayer",
    "GET /api/squad-builder/players",
    "item",
  ],
  squad_builder_fixtures: [
    "SquadBuilderFixtureRow",
    "GET /api/squad-builder/fixtures",
    "item",
  ],
  squad_analysis: ["SquadResponse", "GET /api/squad/{team_id}"],
  squad_optimize_transfers: [
    "TransferResult",
    "GET /api/squad/{team_id}/optimize-transfers",
  ],
  squad_planner: ["PlannerResponse", "GET /api/squad/{team_id}/planner"],
  squad_chips: ["ChipResponse", "GET /api/squad/{team_id}/chips"],
  optimizer_best_squad: ["BestSquadResult", "GET /api/optimizer/best-squad"],
  teams_list: ["TeamSummary", "GET /api/teams", "item"],
  team_detail: ["TeamDetail", "GET /api/teams/{team_id}"],
  manager_leagues: ["League", "GET /api/leagues/{team_id}", "item"],
  league_standings: [
    "StandingsResponse",
    "GET /api/leagues/{league_id}/standings",
  ],
  league_ownership: [
    "LeagueOwnership",
    "GET /api/leagues/{league_id}/ownership",
  ],
  entry_captain_review: [
    "CaptainReview",
    "GET /api/entry/{team_id}/captain-review",
  ],
  squad_transfer_plan: [
    "TransferPlan",
    "GET /api/squad/{team_id}/transfer-plan",
  ],
};

/**
 * Nested shapes get a name derived from where they live, which is predictable
 * but often ugly ("StandingsResponseTrendSery") or misleading (the team
 * leaderboard row named after the first key it appeared under). Rename them to
 * the names the frontend already uses, so migrating is an import swap.
 *
 * Keyed on the derived name rather than the field name because two different
 * shapes can share a field name — SquadResponse.squad and BestSquadResult.squad
 * are genuinely different rows. A key here that stops matching is an error, not
 * a no-op: it means the shape moved and the name needs rechecking.
 */
const RENAME = {
  Assist: "LeaderboardEntry",
  Category: "ReturnCategory",
  TransferPlanWeek: "PlanWeek",
  TransfersIn: "PlanPlayer",
  YourDifferential: "LeagueHolding",
  Fixture: "FixtureChip",
  Opponent: "PlannerOpponent",
  PlayerDetailGwHistory: "GwRow",
  PlayerDetailPrediction: "Prediction",
  PlayerOutlookFixture: "OutlookFixture",
  SeasonStat: "SeasonStats",
  Squad: "SquadRow",
  SquadResponseCaptaincyOption: "CaptaincyOption",
  SquadResponseCategoryScore: "CategoryScore",
  SquadResponseFixtureOutlook: "FixtureOutlookRow",
  SquadResponseSquad: "SquadPlayer",
  StandingsResponseStanding: "StandingRow",
  StandingsResponseTrend: "TrendEntry",
  StandingsResponseTrendSeries: "TrendPoint",
  TeamDetailLeaderboard: "TeamLeaderboards",
  TeamDetailMetric: "Metric",
  Trajectory: "TrajectoryRow",
  TransferredIn: "TransferPlayer",
};

/**
 * The escape hatch: responses a snapshot genuinely cannot describe, declared by
 * hand and emitted verbatim instead of inferred. Every entry needs a reason.
 *
 * Keep this as close to empty as possible — a type here is one that has gone
 * back to drifting silently, which is the thing this file exists to stop.
 */
const HAND_WRITTEN = {
  // `better` is an object when something outranks the player and null when
  // nothing does - two shapes for one field, which no single snapshot can
  // express and which the golden map (one golden, one type) cannot merge.
  // Both branches are recorded and asserted (player_comparison and
  // player_comparison_best in tests/test_deterministic_routes.py); this only
  // states the union they prove.
  // Two shapes for one response: a graded review, or a reason there isn't one.
  // A snapshot can only capture whichever branch it was taken on, and the
  // ungradeable branch is the one a golden can honestly record - planting a
  // frozen projection after the fact to capture the other is precisely what
  // the feature refuses to do. The graded branch is asserted in
  // tests/unit/test_counterfactual.py instead; this states the union.
  CaptainReview: `/** Response of \`GET /api/entry/{team_id}/captain-review\`. */
export type CaptainReview =
  | {
      available: false;
      /** Absent before any gameweek has finished. */
      event?: number;
      reason: string;
    }
  | {
      available: true;
      event: number;
      /** "frozen" - a graded review only ever comes from a pre-deadline file. */
      source: string;
      model_pick: string;
      model_points: number;
      your_pick: string;
      your_points: number;
      /** 2 normally, 3 in a Triple Captain week. */
      multiplier: number;
      /** Positive: following the model would have gained you this much. */
      points_delta: number;
      agreed: boolean;
      verdict: string;
    };`,

  PlayerComparison: `export type ComparisonPlayer = {
  id: number;
  web_name: string;
  team_short: string;
  position: Position;
  cost: number;
  predicted_points: number;
  appearance_points: number;
  fixture_ticker: string;
  selected_by_percent: number;
  status: string;
  news: string;
  team_badge: string;
  player_photo: string;
};

/** Response of \`GET /api/players/{player_id}/comparison\`. */
export type PlayerComparison = {
  player: ComparisonPlayer;
  /** null when nothing in this position at or under this price projects higher. */
  better: ComparisonPlayer | null;
  verdict: "outclassed" | "best at this price";
  reason: string;
  gw_count: number;
  next_event: number;
};`,

  // The pinned snapshot has no qualifying price movers, so risers/fallers are
  // both `[]` and infer as `unknown[]`. Shape read off fpl/domain/price.py
  // (compute_price_change_signals) and fpl/services/players.py, which drops
  // `team` and `code` and adds `team_short`/`team_badge`.
  //
  // The endpoint also returns two different shapes: pass `player_ids` and you
  // get `owned` instead of `risers`/`fallers`. The golden only records the
  // latter call, so the keys are optional here — which is the truth, and forces
  // call sites to say which variant they asked for.
  PriceWatchResponse: `export type PriceMover = {
  id: number;
  web_name: string;
  cost: number;
  selected_by_percent: number;
  transfers_in_event: number;
  transfers_out_event: number;
  net_transfers_event: number;
  momentum_pct: number;
  direction: "rising" | "falling" | "stable";
  already_moved_today: boolean;
  // bootstrap's price_change_percent is a string ("0"), not a number.
  official_progress_percent: string | null;
  // abs(official_progress_percent) as a plain 0-100+ percentage toward a
  // change in whichever direction the player is heading; null when FPL
  // publishes no figure for them.
  change_progress_pct: number | null;
  // Over the threshold and not yet moved today - barring FPL changing its
  // mind, this is tonight's price change.
  about_to_change: boolean;
  transfer_rate_per_hour: number | null;
  team_short: string;
  team_badge: string;
};

/** Response of \`GET /api/players/price-watch\`. \`owned\` is returned in place of
 * \`risers\`/\`fallers\` when the request passes \`player_ids\`. */
export type PriceWatchResponse = {
  has_history_trend: boolean;
  history_snapshot_count: number;
  min_net_transfers_to_flag: number;
  risers?: PriceMover[];
  fallers?: PriceMover[];
  owned?: PriceMover[];
};
`,
};

/**
 * Fields that can be null even though the snapshot never shows one.
 *
 * This is the load-bearing weakness of inferring from samples: a field that
 * happens to be populated in every sampled row infers as non-null, and typing a
 * nullable field non-null is the dangerous direction — it invites a caller to
 * drop the guard that was keeping it alive.
 *
 * Every entry below is a field the previous hand-written types already marked
 * nullable (knowledge earned against real runtime data), corroborated in the
 * backend where the source shows it:
 *   - ScheduleFixture scores: db/models.py types them `Mapped[int | None]` and
 *     services/fixtures.py passes them straight through — unplayed fixtures
 *     have no score. The goldens only sample a completed season.
 *   - season_stats: services/players.py does `season_stats.get(row["id"])`,
 *     which is None for a player with no archived season.
 *
 * The real fix is `response_model` on the FastAPI routes, which would make the
 * schema state nullability authoritatively and let this list go away. Until
 * then, widening here is deliberate and reviewed; the risk is that the list is
 * incomplete, never that an entry is wrong.
 */
const NULLABLE = new Set([
  "ChipResponsePeriod.wildcard",
  "FixtureDifficultyRow.avg_difficulty",
  "FixtureOutlookRow.avg_difficulty",
  "PlayerDetail.prediction",
  "PlayerDetail.season_stats",
  "PlayerListItem.season_stats",
  "PlayerOutlook.live_id",
  "ScheduleFixture.kickoff_time",
  "ScheduleFixture.team_a_score",
  "ScheduleFixture.team_h_score",
  "SquadBuilderFixtureRow.avg_difficulty",
  "SquadPlayer.live_id",
  "SquadResponse.bench_depth_score",
  "StandingsResponse.your_rank",
  // manager_name() is a dict .get() over a hand-maintained club->coach map
  // (fpl/domain/managers.py), so it returns None for any club missing from it -
  // which its own docstring says to expect until someone updates it after a
  // change. All 20 clubs happen to be populated in the golden.
  "TeamDetail.manager",
  "TeamSummary.manager",
  "TeamEntry.bank",
  "TeamEntry.gameweek",
  "TeamEntry.overall_points",
  "TeamEntry.overall_rank",
  "TeamEntry.player_name",
  "TeamEntry.team_name",
  "TeamEntry.team_value",
]);

/**
 * Fields the snapshot only ever shows as `null`, so inference can describe the
 * absence but not the value. Left alone these emit as bare `null`, which is
 * worse than useless — nothing but null can be assigned to them.
 *
 * Shapes taken from the hand-written types being replaced (leagues/page.tsx's
 * `YourRank`, LoadTeamPanel's `ChipResponsePeriod.wildcard`). The supporting
 * types are declared in EXTRA_TYPES below.
 */
const FIELD_TYPES = {
  "ChipResponsePeriod.wildcard": "WildcardSuggestion | null",
  "StandingsResponse.your_rank": "YourRank | null",
  // Keyed by whatever `metrics[].key` the same response lists, which the team
  // page iterates to decide what to render. Inferring the snapshot's exact key
  // set would turn "the backend can add a metric and the page picks it up" into
  // a compile error, so keep it a record.
  "TeamDetail.leaderboards": "Record<string, LeaderboardEntry[]>",
  // The backend's METRICS list (fpl/services/teams.py) only ever emits these
  // two. Keeping the union rather than the inferred `string` preserves the
  // exhaustiveness the team leaderboard's "Model" vs "2025/26" tag relies on.
  "Metric.kind": '"actual" | "model"',
  // fpl/optimize/squad.py assigns exactly one of these two per row. The panels
  // sort on it ("Starting XI" first), so the union is worth keeping over the
  // inferred string.
  "SquadRow.role": '"Starting XI" | "Bench"',
  "SquadPlayer.role": '"Starting XI" | "Bench"',
};

/**
 * Closed sets that appear under the same field name across many responses.
 * Listing every owner in FIELD_TYPES would be a dozen near-identical lines, so
 * these are matched on field name instead, wherever it occurs.
 *
 * Every observed value is checked against the union at generation time (see
 * assertEnumFields), so if the backend ever emits a fifth position this fails
 * loudly rather than quietly producing a type that lies.
 */
const ENUM_FIELDS = {
  position: "Position",
  pos: "Position",
};

const ENUM_VALUES = {
  Position: ["GKP", "DEF", "MID", "FWD"],
};

/** Declarations that FIELD_TYPES refers to, emitted ahead of everything else. */
const EXTRA_TYPES = `/** FPL's four squad positions. Closed set - the optimizer's squad and
 * starting-XI limits are keyed on exactly these (fpl/optimize/squad.py). */
export type Position = "GKP" | "DEF" | "MID" | "FWD";

export type WildcardSuggestion = {
  reason: string;
  suggested_event: number;
};

export type YourRank = {
  team_id: number;
  total_points: number;
  rank: number | null;
  searched_at_least: number;
  found_exact: boolean;
};
`;

// ---------------------------------------------------------------------------
// Inference: fold every sample seen at one position into a single node.
// ---------------------------------------------------------------------------

/** @returns {{nullable: boolean, prims: Set<string>, obj?: Map<string, {node: any, seen: number}>, objCount: number, arr?: any, sawArray: boolean, emptyArray: boolean}} */
function emptyNode() {
  return {
    nullable: false,
    prims: new Set(),
    obj: null,
    objCount: 0,
    arr: null,
    sawArray: false,
    emptyArray: true,
  };
}

function fold(node, value) {
  if (value === null) {
    node.nullable = true;
    return node;
  }
  if (Array.isArray(value)) {
    node.sawArray = true;
    if (value.length > 0) node.emptyArray = false;
    node.arr ??= emptyNode();
    for (const el of value) fold(node.arr, el);
    return node;
  }
  if (typeof value === "object") {
    node.obj ??= new Map();
    node.objCount += 1;
    for (const [k, v] of Object.entries(value)) {
      let slot = node.obj.get(k);
      if (!slot) {
        slot = { node: emptyNode(), seen: 0 };
        node.obj.set(k, slot);
      }
      slot.seen += 1;
      fold(slot.node, v);
    }
    return node;
  }
  node.prims.add(typeof value === "number" ? "number" : typeof value);
  return node;
}

// ---------------------------------------------------------------------------
// Naming: hoist every object shape to a named type. A shape that appears in
// more than one place becomes one shared type (this is what collapses the five
// copies of the fixture chip into a single `FixtureChip`), keyed on structure
// so it can't accidentally merge two shapes that merely share a field name.
// ---------------------------------------------------------------------------

function signature(node) {
  const parts = [];
  if (node.nullable) parts.push("null");
  for (const p of [...node.prims].sort()) parts.push(p);
  if (node.sawArray) parts.push(`[${node.arr ? signature(node.arr) : "?"}]`);
  if (node.obj) {
    const fields = [...node.obj.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(
        ([k, s]) =>
          `${k}${s.seen < node.objCount ? "?" : ""}:${signature(s.node)}`,
      );
    parts.push(`{${fields.join(",")}}`);
  }
  return parts.join("|") || "unknown";
}

const pascal = (s) =>
  s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");

// Words that are already singular despite the trailing s.
const INVARIANT = new Set([
  "series",
  "analysis",
  "status",
  "news",
  "bonus",
  "fixtures_in_window",
]);

const singular = (s) =>
  INVARIANT.has(s)
    ? s
    : s.endsWith("ies")
      ? `${s.slice(0, -3)}y`
      : s.endsWith("ses")
        ? s.slice(0, -2)
        : s.endsWith("s") && !s.endsWith("ss")
          ? s.slice(0, -1)
          : s;

/**
 * A record-of-lists whose lists are all the same kind of row (the team detail
 * leaderboards: goals_scored, assists, red_cards...) can have an empty list in
 * the snapshot for a category nobody has entries in yet. Inferring `unknown[]`
 * there would be technically honest but forces a cast at the call site for a
 * field we can see the shape of from its siblings. When every non-empty sibling
 * list holds the same shape, use it for the empty ones too.
 */
function reconcileEmptyArrays(node, seen = new Set()) {
  if (!node || seen.has(node)) return;
  seen.add(node);
  if (node.arr) reconcileEmptyArrays(node.arr, seen);
  if (!node.obj) return;
  for (const slot of node.obj.values()) reconcileEmptyArrays(slot.node, seen);

  const arrayFields = [...node.obj.values()].filter((s) => s.node.sawArray);
  if (arrayFields.length < 2) return;
  const filled = arrayFields.filter((s) => !s.node.emptyArray && s.node.arr);
  const empty = arrayFields.filter((s) => s.node.emptyArray);
  if (!filled.length || !empty.length) return;
  const sigs = new Set(filled.map((s) => signature(s.node.arr)));
  if (sigs.size !== 1) return;
  for (const slot of empty) {
    slot.node.arr = filled[0].node.arr;
    slot.node.emptyArray = false;
  }
}

/** Walk every response tree and record where each object shape occurs. */
function collectShapes(roots) {
  /** @type {Map<string, {node: any, keys: string[], parents: string[]}>} */
  const shapes = new Map();

  function walk(node, parentName, key) {
    if (node.obj) {
      const sig = signature(node);
      let entry = shapes.get(sig);
      if (!entry) {
        entry = { node, keys: [], parents: [] };
        shapes.set(sig, entry);
      }
      entry.keys.push(key);
      entry.parents.push(parentName);
      const own = `${parentName}${pascal(singular(key))}`;
      for (const [k, slot] of node.obj) walk(slot.node, own, k);
    }
    if (node.arr) walk(node.arr, parentName, key);
  }

  for (const [name, node] of roots) {
    if (node.obj) {
      // The root's own shape is already named; register it so nested
      // references resolve, then walk its fields under that name.
      shapes.set(signature(node), { node, keys: [name], parents: [""], root: name });
      for (const [k, slot] of node.obj) walk(slot.node, name, k);
    }
    if (node.arr) {
      const inner = node.arr;
      if (inner.obj) {
        shapes.set(signature(inner), {
          node: inner,
          keys: [name],
          parents: [""],
          root: name,
        });
        for (const [k, slot] of inner.obj) walk(slot.node, name, k);
      }
    }
  }
  return shapes;
}

/** Assign a final exported name to every shape. */
function nameShapes(shapes) {
  const names = new Map(); // sig -> name
  const taken = new Set();

  // Roots keep the name pinned in RESPONSES.
  for (const [sig, e] of shapes) {
    if (e.root) {
      names.set(sig, e.root);
      taken.add(e.root);
    }
  }
  // Shapes used in more than one place get one shared, key-derived name.
  for (const [sig, e] of shapes) {
    if (names.has(sig)) continue;
    const distinct = new Set(e.parents.map((p, i) => `${p}|${e.keys[i]}`));
    if (distinct.size > 1) {
      const base = pascal(singular(e.keys[0]));
      let name = base;
      let n = 2;
      while (taken.has(name)) name = `${base}${n++}`;
      names.set(sig, name);
      taken.add(name);
    }
  }
  // Everything else is named for where it lives.
  for (const [sig, e] of shapes) {
    if (names.has(sig)) continue;
    const base = `${e.parents[0]}${pascal(singular(e.keys[0]))}`;
    let name = base;
    let n = 2;
    while (taken.has(name)) name = `${base}${n++}`;
    names.set(sig, name);
    taken.add(name);
  }

  const unused = new Set(Object.keys(RENAME));
  for (const [sig, derived] of names) {
    if (RENAME[derived]) {
      names.set(sig, RENAME[derived]);
      unused.delete(derived);
    }
  }
  if (unused.size) {
    throw new Error(
      `RENAME has entries that no longer match a generated name: ${[...unused].join(", ")}. ` +
        `The shape moved — recheck the name and update the map.`,
    );
  }
  return names;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function render(node, names, depth) {
  const parts = [];
  if (node.obj) {
    const sig = signature(node);
    parts.push(names.get(sig) ?? renderInline(node, names, depth));
  }
  for (const p of [...node.prims].sort()) parts.push(p);
  if (node.sawArray) {
    if (node.emptyArray || !node.arr) parts.push("unknown[]");
    else {
      const inner = render(node.arr, names, depth);
      parts.push(/[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`);
    }
  }
  if (node.nullable) parts.push("null");
  return parts.length ? [...new Set(parts)].join(" | ") : "unknown";
}

/** Override entries that actually matched, so stale ones can be reported. */
const nullableApplied = new Set();
const fieldTypesApplied = new Set();

// `ownerOverride` matters when two routes return structurally identical rows
// (/api/fixtures/difficulty and /api/squad-builder/fixtures do). Those collapse
// to one shape identity, so only one of the two names would ever be consulted
// for a NULLABLE override; passing the name being declared lets an override
// keyed to either one apply.
function renderInline(node, names, depth, ownerOverride) {
  const owner = ownerOverride ?? names.get(signature(node));
  const pad = "  ".repeat(depth + 1);
  const lines = [...node.obj.entries()].map(([k, slot]) => {
    const opt = slot.seen < node.objCount ? "?" : "";
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    const path = `${owner}.${k}`;
    let type = render(slot.node, names, depth + 1);
    if (ENUM_FIELDS[k] && type === "string") type = ENUM_FIELDS[k];
    if (FIELD_TYPES[path]) {
      fieldTypesApplied.add(path);
      type = FIELD_TYPES[path];
    }
    if (NULLABLE.has(path)) {
      nullableApplied.add(path);
      if (!/\bnull\b/.test(type)) type = `${type} | null`;
    }
    return `${pad}${key}${opt}: ${type};`;
  });
  return `{\n${lines.join("\n")}\n${"  ".repeat(depth)}}`;
}

function declare(name, node, names, route) {
  const head = route
    ? `/** Response of \`${route}\`. */\nexport type ${name} = `
    : `export type ${name} = `;
  // Render the body inline (bypassing the name lookup that would emit just
  // the alias) so the declaration carries the actual fields.
  const body = node.obj
    ? renderInline(node, names, 0, name)
    : render(node, names, 0);
  return `${head}${body};\n`;
}

/**
 * Walk the raw golden bodies and check every value found under an ENUM_FIELDS
 * key is in that union. Guards the one way the enum shortcut could go wrong:
 * the backend growing a new value that the union then silently excludes.
 */
function assertEnumFields(bodies) {
  const seen = new Map(); // field -> Set(values)

  function walk(node) {
    if (Array.isArray(node)) {
      for (const el of node) walk(el);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (ENUM_FIELDS[k] && typeof v === "string") {
          if (!seen.has(k)) seen.set(k, new Set());
          seen.get(k).add(v);
        }
        walk(v);
      }
    }
  }
  for (const body of bodies) walk(body);

  const problems = [];
  for (const [field, values] of seen) {
    const allowed = new Set(ENUM_VALUES[ENUM_FIELDS[field]]);
    const extra = [...values].filter((v) => !allowed.has(v));
    if (extra.length) {
      problems.push(
        `${field} has value(s) not in ${ENUM_FIELDS[field]}: ${extra.join(", ")}`,
      );
    }
  }
  if (problems.length) {
    throw new Error(
      `Enum field check failed:\n  ${problems.join("\n  ")}\n` +
        `Widen ENUM_VALUES (and EXTRA_TYPES) or drop the field from ENUM_FIELDS.`,
    );
  }
  return seen;
}

function main() {
  const roots = new Map();
  const routes = new Map();
  const arrayResponses = new Set();
  const bodies = [];

  for (const file of readdirSync(GOLDEN_DIR).sort()) {
    if (!file.endsWith(".json")) continue;
    const key = file.slice(0, -5);
    const spec = RESPONSES[key];
    if (!spec) continue;
    const [typeName, route, kind] = spec;
    const golden = JSON.parse(readFileSync(join(GOLDEN_DIR, file), "utf8"));
    if (!("body" in golden)) continue;
    bodies.push(golden.body);
    const node = fold(emptyNode(), golden.body);
    if (kind === "item") {
      if (!node.arr) throw new Error(`${key}: expected an array body`);
      roots.set(typeName, node.arr);
      arrayResponses.add(typeName);
    } else {
      roots.set(typeName, node);
    }
    routes.set(typeName, route);
  }

  const enumsSeen = assertEnumFields(bodies);
  for (const node of roots.values()) reconcileEmptyArrays(node);

  const shapes = collectShapes(roots);
  const names = nameShapes(shapes);

  const out = [];
  out.push("// GENERATED FILE — do not edit by hand. Run `npm run gen:api`.");
  out.push("//");
  out.push("// Inferred from the pinned response snapshots in");
  out.push("// backend/tests/golden/, which the backend test suite asserts on");
  out.push("// every run. See scripts/gen-api-types.mjs for why these are");
  out.push("// generated from goldens rather than from /openapi.json.");
  out.push("//");
  out.push(
    "// Nullability reflects the snapshot: a field that is never null across",
  );
  out.push(
    "// the sampled responses is typed non-null. Widen it here by adding a",
  );
  out.push("// `response_model` to the route and regenerating, not by hand.");
  out.push("");

  // Shared shapes first, then the per-route responses, each alphabetical so
  // the diff of a regeneration is readable.
  out.push(EXTRA_TYPES);

  const rootNames = new Set(roots.keys());
  const shared = [...shapes.entries()]
    .filter(([sig]) => !rootNames.has(names.get(sig)))
    .sort((a, b) => (names.get(a[0]) < names.get(b[0]) ? -1 : 1));

  for (const [, e] of shared) {
    const sig = signature(e.node);
    out.push(declare(names.get(sig), e.node, names, null));
  }
  for (const name of [...roots.keys()].sort()) {
    if (HAND_WRITTEN[name]) {
      out.push(HAND_WRITTEN[name]);
      continue;
    }
    const node = roots.get(name);
    const route = routes.get(name);
    const note = arrayResponses.has(name)
      ? `${route} returns \`${name}[]\`.`
      : route;
    out.push(declare(name, node, names, note));
  }
  const orphaned = Object.keys(HAND_WRITTEN).filter((n) => !roots.has(n));
  if (orphaned.length) {
    throw new Error(
      `HAND_WRITTEN declares ${orphaned.join(", ")}, which no longer maps to a ` +
        `golden in RESPONSES. Drop the entry or fix the name.`,
    );
  }

  // A NULLABLE entry that matches nothing means the field was renamed or moved,
  // and the widening it was doing has silently stopped. That must not pass
  // quietly — it is exactly how a nullable field goes back to being typed
  // non-null. (PriceMover fields are exempt: that type is hand-written, so it
  // states its own nullability.)
  const stale = [
    ...[...NULLABLE]
      .filter((p) => !nullableApplied.has(p) && !p.startsWith("PriceMover."))
      .map((p) => `NULLABLE:${p}`),
    ...Object.keys(FIELD_TYPES)
      .filter((p) => !fieldTypesApplied.has(p))
      .map((p) => `FIELD_TYPES:${p}`),
  ];
  if (stale.length) {
    throw new Error(
      `Overrides matched no generated field: ${stale.join(", ")}. ` +
        `The field moved or was renamed — recheck it and update the override.`,
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out.join("\n"));
  const declared = shared.length + roots.size;
  const enums = [...enumsSeen]
    .map(([field, values]) => `${field}=${values.size}`)
    .join(" ");
  console.log(
    `api.d.ts: ${declared} types (${roots.size} responses, ${shared.length} nested/shared)` +
      `${enums ? `; enum fields checked: ${enums}` : ""}`,
  );
}

main();
