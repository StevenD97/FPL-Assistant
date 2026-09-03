// GENERATED FILE — do not edit by hand. Run `npm run gen:api`.
//
// Inferred from the pinned response snapshots in
// backend/tests/golden/, which the backend test suite asserts on
// every run. See scripts/gen-api-types.mjs for why these are
// generated from goldens rather than from /openapi.json.
//
// Nullability reflects the snapshot: a field that is never null across
// the sampled responses is typed non-null. Widen it here by adding a
// `response_model` to the route and regenerating, not by hand.

/** FPL's four squad positions. Closed set - the optimizer's squad and
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

export type AccuracyResponseCoverage = {
  graded: number[];
  pending: number[];
};

export type AccuracyResponseEvent = {
  captain: AccuracyResponseEventCaptain;
  categories: ReturnCategory[];
  event: number;
  players_graded: number;
  rank_correlation: number;
  top_ten: AccuracyResponseEventTopTen;
};

export type AccuracyResponseEventCaptain = {
  actual: number;
  best_actual: number;
  best_actual_player: string;
  pick: string;
  pick_team: string;
  predicted: number;
  rank_of_pick: number;
};

export type AccuracyResponseEventTopTen = {
  average_actual: number;
  field_average: number;
  names: string[];
};

export type AccuracyResponseSummary = {
  captain_average: number;
  captain_best_possible_average: number;
  categories: ReturnCategory[];
  events_graded: number;
  field_average: number;
  rank_correlation: number;
  top_ten_average: number;
};

export type Better = {
  appearance_points: number;
  cost: number;
  fixture_ticker: string;
  id: number;
  news: string;
  player_photo: string;
  position: Position;
  predicted_points: number;
  selected_by_percent: number;
  status: string;
  team_badge: string;
  team_short: string;
  web_name: string;
};

export type CaptaincyOption = {
  captain_flag: string;
  ep_next: number;
  next_opponent: string;
  pos: Position;
  predicted_points: number;
  predicted_points_next: number;
  reason: string;
  recommendation_score: number;
  team_short: string;
  web_name: string;
};

export type CategoryScore = {
  DEF: number;
  FWD: number;
  GKP: number;
  MID: number;
};

export type ChipResponsePeriod = {
  bench_boost: ChipResponsePeriodBenchBoost;
  end_event: number;
  free_hit: ChipResponsePeriodFreeHit;
  label: string;
  start_event: number;
  triple_captain: ChipResponsePeriodTripleCaptain;
  wildcard: WildcardSuggestion | null;
};

export type ChipResponsePeriodBenchBoost = {
  bench_score: number;
  double_count: number;
  event: number;
  reason: string;
};

export type ChipResponsePeriodFreeHit = {
  blank_count: number;
  event: number;
  reason: string;
  recommended: boolean;
};

export type ChipResponsePeriodTripleCaptain = {
  event: number;
  player: string;
  reason: string;
  score: number;
};

export type ChipResponseTable = {
  bench_score: number;
  best_captain_name: string;
  best_captain_score: number;
  blank_count: number;
  double_count: number;
  event: number;
  squad_total_score: number;
};

export type Faller = {
  about_to_change: boolean;
  already_moved_today: boolean;
  change_progress_pct: number;
  cost: number;
  direction: string;
  id: number;
  momentum_pct: number;
  net_transfers_event: number;
  official_progress_percent: string;
  selected_by_percent: number;
  team_badge: string;
  team_short: string;
  transfer_rate_per_hour: null;
  transfers_in_event: number;
  transfers_out_event: number;
  web_name: string;
};

export type FixtureChip = {
  difficulty: number;
  is_home: boolean;
  opponent: string;
  opponent_badge: string;
};

export type FixtureOutlookRow = {
  avg_difficulty: number | null;
  fixture_score: number;
  fixtures: FixtureChip[];
  team_badge: string;
  team_short: string;
  ticker: string;
};

export type GwRow = {
  GW: number;
  assists: number;
  bonus: number;
  goals_scored: number;
  minutes: number;
  total_points: number;
};

export type LeaderboardEntry = {
  id: number;
  player_photo: string;
  position: Position;
  value: number;
  web_name: string;
};

export type Metric = {
  key: string;
  kind: "actual" | "model";
  label: string;
  short: string;
};

export type OutlookFixture = {
  is_home: boolean;
  opponent: string;
  opponent_badge: string;
};

export type PlannerOpponent = {
  difficulty: number;
  is_home: boolean;
  team: string;
};

export type Prediction = {
  appearance_points: number;
  assist_points: number;
  bonus_points: number;
  card_points: number;
  clean_sheet_points: number;
  clean_sheet_prob: number;
  defensive_contribution_points: number;
  fixture_count: number;
  fixture_ticker: string;
  goal_points: number;
  goals_conceded_points: number;
  id: number;
  own_goal_points: number;
  penalty_miss_points: number;
  penalty_save_points: number;
  position: Position;
  predicted_assists: number;
  predicted_goals: number;
  predicted_points: number;
  save_points: number;
  team_short: string;
  web_name: string;
};

export type ReturnCategory = {
  baseline_mae: number;
  baseline_rmse: number;
  category: string;
  mae: number;
  n: number;
  rmse: number;
};

export type SeasonStats = {
  assists: number;
  bonus: number;
  clean_sheets: number;
  defensive_contribution_per_90: number;
  expected_assists: string;
  expected_assists_per_90: number;
  expected_goal_involvements: string;
  expected_goal_involvements_per_90: number;
  expected_goals: string;
  expected_goals_conceded_per_90: number;
  expected_goals_per_90: number;
  goals_conceded: number;
  goals_scored: number;
  ict_index: string;
  minutes: number;
  red_cards: number;
  saves: number;
  starts: number;
  starts_per_90: number;
  threat: string;
  total_points: number;
  yellow_cards: number;
};

export type SquadPlayer = {
  captain_flag: string;
  cost: number;
  defensive_contribution_per_90: number;
  ep_next: number;
  expected_assists_per_90: number;
  expected_goal_involvements: number;
  expected_goals_per_90: number;
  expected_minutes: number;
  form: number;
  ict_index: number;
  id: number;
  live_id: number | null;
  news: string;
  next_opponent: string;
  opponent_multiplier: number;
  player_photo: string;
  pos: Position;
  position: number;
  predicted_points: number;
  predicted_points_next: number;
  recency_weighted_form: number;
  recommendation_score: number;
  role: "Starting XI" | "Bench";
  rotation_risk: number;
  selected_by_percent: number;
  set_piece_duty_score: number;
  status: string;
  team_badge: string;
  team_kit: string;
  team_short: string;
  web_name: string;
};

export type SquadRow = {
  captain: boolean;
  cost: number;
  id: number;
  player_photo: string;
  position: Position;
  predicted_points: number;
  role: "Starting XI" | "Bench";
  selected_by_percent: number;
  status: string;
  team_badge: string;
  team_kit: string;
  team_short: string;
  value: number;
  web_name: string;
};

export type StandingRow = {
  entry_id: number;
  entry_name: string;
  event_total: number;
  last_rank: number;
  player_name: string;
  rank: number;
  total: number;
};

export type TeamLeaderboards = {
  assists: LeaderboardEntry[];
  bonus: LeaderboardEntry[];
  defensive_contribution: LeaderboardEntry[];
  expected_assists: LeaderboardEntry[];
  expected_goal_involvements: LeaderboardEntry[];
  expected_goals: LeaderboardEntry[];
  expected_minutes: LeaderboardEntry[];
  goal_involvements: LeaderboardEntry[];
  goals_scored: LeaderboardEntry[];
  minutes: LeaderboardEntry[];
  predicted_points: LeaderboardEntry[];
  red_cards: LeaderboardEntry[];
  total_points: LeaderboardEntry[];
  yellow_cards: LeaderboardEntry[];
};

export type TrajectoryRow = {
  appearance_points: number;
  event: number;
  fixture_count: number;
  flags: string[];
  opponents: PlannerOpponent[];
  predicted_points: number;
};

export type TransferPlayer = {
  appearance_points: number;
  fixture_ticker: string;
  id: number;
  news: string;
  now_cost: number;
  player_photo: string;
  position: Position;
  predicted_points: number;
  reason: string;
  selected_by_percent: number;
  status: string;
  team_badge: string;
  team_kit: string;
  team_short: string;
  value: number;
  web_name: string;
};

export type TrendEntry = {
  entry_id: number;
  entry_name: string;
  player_name: string;
  series: TrendPoint[];
};

export type TrendPoint = {
  event: number;
  total_points: number;
};

/** Response of `GET /api/accuracy`. */
export type AccuracyResponse = {
  coverage: AccuracyResponseCoverage;
  events: AccuracyResponseEvent[];
  summary: AccuracyResponseSummary;
};

/** Response of `GET /api/optimizer/best-squad`. */
export type BestSquadResult = {
  predicted_points: number;
  squad: SquadRow[];
  starting_xi_predicted_points: number;
  total_cost: number;
};

/** Response of `GET /api/squad/{team_id}/chips`. */
export type ChipResponse = {
  periods: ChipResponsePeriod[];
  reset_event: number;
  scan_end_event: number;
  scan_start_event: number;
  table: ChipResponseTable[];
};

/** Response of `GET /api/fixtures/difficulty returns `FixtureDifficultyRow[]`.`. */
export type FixtureDifficultyRow = {
  avg_difficulty: number | null;
  fixture_score: number;
  fixtures: FixtureChip[];
  fixtures_in_window: number;
  team: string;
  team_badge: string;
  team_id: number;
  ticker: string;
};

/** Response of `GET /api/leagues/{team_id} returns `League[]`.`. */
export type League = {
  entry_rank: number;
  id: number;
  name: string;
};

/** Response of `GET /api/squad/{team_id}/planner`. */
export type PlannerResponse = {
  event: number;
  next_events: number[];
  players: PlayerTrajectory[];
};

/** Response of `GET /api/players/{player_id}/alternatives returns `PlayerAlternative[]`.`. */
export type PlayerAlternative = {
  cost: number;
  id: number;
  news: string;
  player_photo: string;
  position: Position;
  predicted_points: number;
  selected_by_percent: number;
  status: string;
  team_badge: string;
  team_short: string;
  value: number;
  web_name: string;
};

export type ComparisonPlayer = {
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

/** Response of `GET /api/players/{player_id}/comparison`. */
export type PlayerComparison = {
  player: ComparisonPlayer;
  /** null when nothing in this position at or under this price projects higher. */
  better: ComparisonPlayer | null;
  verdict: "outclassed" | "best at this price";
  reason: string;
  gw_count: number;
  next_event: number;
};
/** Response of `GET /api/players/{player_id}`. */
export type PlayerDetail = {
  cost: number;
  first_name: string;
  fixtures: FixtureChip[];
  gw_history: GwRow[];
  id: number;
  news: string;
  penalties_order: number;
  player_photo: string;
  position: Position;
  prediction: Prediction | null;
  season_stats: SeasonStats | null;
  second_name: string;
  selected_by_percent: number;
  status: string;
  team_badge: string;
  team_kit: string;
  team_name: string;
  team_short: string;
  web_name: string;
};

/** Response of `GET /api/players returns `PlayerListItem[]`.`. */
export type PlayerListItem = {
  cost: number;
  fixtures: FixtureChip[];
  id: number;
  news: string;
  player_photo: string;
  position: Position;
  predicted_points: number;
  season_stats: SeasonStats | null;
  selected_by_percent: number;
  status: string;
  team_badge: string;
  team_short: string;
  value: number;
  web_name: string;
};

/** Response of `GET /api/players/predicted-points-outlook returns `PlayerOutlook[]`.`. */
export type PlayerOutlook = {
  fixture_count: number;
  fixture_ticker: string;
  fixtures: OutlookFixture[];
  id: number;
  live_id: number | null;
  position: Position;
  predicted_points: number;
  team_badge: string;
  team_short: string;
  web_name: string;
};

/** Response of `GET /api/players/predicted-points returns `PlayerPredictedPoints[]`.`. */
export type PlayerPredictedPoints = {
  appearance_points: number;
  assist_points: number;
  bonus_points: number;
  card_points: number;
  ceiling: number;
  clean_sheet_points: number;
  clean_sheet_prob: number;
  defensive_contribution_points: number;
  goal_points: number;
  goals_conceded_points: number;
  haul_probability: number;
  id: number;
  next_opponent: string;
  own_goal_points: number;
  penalty_miss_points: number;
  penalty_save_points: number;
  position: Position;
  predicted_assists: number;
  predicted_goals: number;
  predicted_points: number;
  save_points: number;
  team_short: string;
  web_name: string;
};

/** Response of `GET /api/players/scores returns `PlayerScore[]`.`. */
export type PlayerScore = {
  confidence_adjusted: number;
  defensive_contribution_per_90: number;
  ep_next: number;
  expected_goal_involvements: number;
  expected_minutes: number;
  form: number;
  ict_index: number;
  id: number;
  live_id: number;
  next_opponent: string;
  opponent_multiplier: number;
  penalties_missed: number;
  penalties_order: number;
  position: Position;
  recency_weighted_form: number;
  recommendation_score: number;
  rotation_risk: number;
  selected_by_percent: number;
  set_piece_duty_score: number;
  team_badge: string;
  team_short: string;
  web_name: string;
};

/** Response of `GET /api/players/{player_id}/trajectory`. */
export type PlayerTrajectory = {
  average_predicted_points: number;
  id: number;
  player_photo: string;
  position: Position;
  team_badge: string;
  team_short: string;
  trajectory: TrajectoryRow[];
  web_name: string;
};

/** Response of `GET /api/squad-builder/players returns `PoolPlayer[]`.`. */
export type PoolPlayer = {
  appearance_points: number;
  corners_and_indirect_freekicks_order: number;
  cost: number;
  direct_freekicks_order: number;
  fixture_count: number;
  fixture_ticker: string;
  id: number;
  news: string;
  penalties_order: number;
  player_photo: string;
  position: Position;
  predicted_points: number;
  selected_by_percent: number;
  status: string;
  team_badge: string;
  team_kit: string;
  team_short: string;
  value: number;
  web_name: string;
};

export type PriceMover = {
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

/** Response of `GET /api/players/price-watch`. `owned` is returned in place of
 * `risers`/`fallers` when the request passes `player_ids`. */
export type PriceWatchResponse = {
  has_history_trend: boolean;
  history_snapshot_count: number;
  min_net_transfers_to_flag: number;
  risers?: PriceMover[];
  fallers?: PriceMover[];
  owned?: PriceMover[];
};

/** Response of `GET /api/fixtures/schedule returns `ScheduleFixture[]`.`. */
export type ScheduleFixture = {
  event: number;
  finished: boolean;
  finished_provisional: boolean;
  kickoff_time: string | null;
  started: boolean;
  team_a: string;
  team_a_badge: string;
  team_a_difficulty: number;
  team_a_score: number | null;
  team_h: string;
  team_h_badge: string;
  team_h_difficulty: number;
  team_h_score: number | null;
};

/** Response of `GET /api/season-status`. */
export type SeasonStatus = {
  archive_season_label: string;
  current_season_label: string;
  is_preseason: boolean;
  next_deadline: string;
  next_event: number;
};

/** Response of `GET /api/squad-builder/fixtures returns `SquadBuilderFixtureRow[]`.`. */
export type SquadBuilderFixtureRow = {
  avg_difficulty: number | null;
  fixture_score: number;
  fixtures: FixtureChip[];
  fixtures_in_window: number;
  team: string;
  team_badge: string;
  team_id: number;
  ticker: string;
};

/** Response of `GET /api/squad/{team_id}`. */
export type SquadResponse = {
  bank: number;
  bench_depth_score: number | null;
  bench_predicted_points: number;
  captaincy_options: CaptaincyOption[];
  category_scores: CategoryScore;
  entry_name: string;
  event: number;
  fixture_outlook: FixtureOutlookRow[];
  fixture_window: number;
  points: number;
  squad: SquadPlayer[];
  squad_value: number;
};

/** Response of `GET /api/leagues/{league_id}/standings`. */
export type StandingsResponse = {
  league_name: string;
  standings: StandingRow[];
  trend: TrendEntry[];
  your_rank: YourRank | null;
};

/** Response of `GET /api/teams/{team_id}`. */
export type TeamDetail = {
  has_season_history: boolean;
  id: number;
  leaderboards: Record<string, LeaderboardEntry[]>;
  manager: string | null;
  metrics: Metric[];
  name: string;
  short_name: string;
  squad_size: number;
  team_badge: string;
};

/** Response of `GET /api/entry/{team_id}`. */
export type TeamEntry = {
  bank: number | null;
  gameweek: number | null;
  id: number;
  overall_points: number | null;
  overall_rank: number | null;
  player_name: string | null;
  team_name: string | null;
  team_value: number | null;
};

/** Response of `GET /api/teams returns `TeamSummary[]`.`. */
export type TeamSummary = {
  id: number;
  manager: string | null;
  name: string;
  short_name: string;
  team_badge: string;
};

/** Response of `GET /api/squad/{team_id}/optimize-transfers`. */
export type TransferResult = {
  bank: number;
  free_transfers: number;
  gw_count: number;
  next_event: number;
  points_hit: number;
  predicted_points: number;
  squad: SquadRow[];
  starting_xi_predicted_points: number;
  total_cost: number;
  transferred_in: TransferPlayer[];
  transferred_out: TransferPlayer[];
  transfers_made: number;
};
