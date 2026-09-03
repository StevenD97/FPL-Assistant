"""
Build data/gw_history_<season>.csv for the season currently being played.

The model already knows how to blend the current season into the archive as
results accrue - compute_team_goal_strengths_blended shifts weight from
2025/26 toward 2026/27 as gameweeks are played, and before the current season
has any results the blend weight is exactly zero. What was missing is the
data. That blend reads load_gw_history(current_season), which reads
player_gw_stats from Postgres and falls back to a CSV on disk; the ingest
pipeline fills the database, but any deployment without one - which is the
documented fallback configuration, see DEPLOYMENT.md - had neither. So the
blend weight stayed pinned at zero no matter how much of the season had been
played, and every projection was still trained purely on last season.

This writes the file fallback the same way the snapshot refresh writes
bootstrap and fixtures: fetch from FPL, write to data/, commit. Run it after
a gameweek finishes.

One row per player per fixture, which is the granularity the archive uses and
the one team strengths need - compute_team_goal_strengths de-duplicates on
(GW, fixture, team_id) to recover match-level scores, so a double gameweek
collapsed into a single row would silently drop a match. The live endpoint's
`explain` array is per fixture and covers every player including those who
did not feature, so the split is read from FPL rather than inferred.

The columns FPL only reports per gameweek rather than per fixture - bps, the
ICT components, the expected-goals family, and the tackles/recoveries group -
are written against the player's first fixture of the week with zeroes after
it. That keeps every per-gameweek sum exact, which is what each of them is
actually read as, and is only approximate for a double gameweek's per-match
split, which nothing reads them as.

Run with: python -m tools.build_gw_history  (from the backend/ folder)
Override the season with: GW_HISTORY_SEASON=2027_28 python -m tools.build_gw_history
"""
import os
import sys

import pandas as pd

from fpl.config import DATA_DIR
from fpl.data.ingest import client

SEASON = os.environ.get("GW_HISTORY_SEASON", "2026_27")

# The archive's column order, reproduced exactly so a reader diffing the two
# files sees data changes rather than a reshuffle.
COLUMNS = [
    "name", "position", "team", "xP", "assists", "bonus", "bps", "clean_sheets",
    "creativity", "element", "expected_assists", "expected_goal_involvements",
    "expected_goals", "expected_goals_conceded", "fixture", "goals_conceded",
    "goals_scored", "ict_index", "influence", "kickoff_time", "minutes", "modified",
    "opponent_team", "own_goals", "penalties_missed", "penalties_saved", "red_cards",
    "round", "saves", "selected", "starts", "team_a_score", "team_h_score", "threat",
    "total_points", "transfers_balance", "transfers_in", "transfers_out", "value",
    "was_home", "yellow_cards", "clearances_blocks_interceptions",
    "defensive_contribution", "recoveries", "tackles", "GW",
]

# Reported per fixture in `explain`, so they can be split honestly.
PER_FIXTURE = [
    "minutes", "goals_scored", "assists", "clean_sheets", "goals_conceded",
    "own_goals", "penalties_saved", "penalties_missed", "yellow_cards", "red_cards",
    "saves", "bonus", "defensive_contribution",
]
# Reported only per gameweek - see the module docstring.
PER_GAMEWEEK = [
    "bps", "influence", "creativity", "threat", "ict_index", "starts",
    "expected_goals", "expected_assists", "expected_goal_involvements",
    "expected_goals_conceded", "clearances_blocks_interceptions", "recoveries",
    "tackles",
]


def _lookups(bootstrap, fixtures):
    positions = {et["id"]: et["singular_name_short"] for et in bootstrap["element_types"]}
    teams = {t["id"]: t["name"] for t in bootstrap["teams"]}
    elements = {
        el["id"]: {
            "name": f"{el['first_name']} {el['second_name']}".strip(),
            "position": positions.get(el["element_type"]),
            "team": teams.get(el["team"]),
            "team_id": el["team"],
            "value": el["now_cost"],
            "selected": el.get("selected_by_percent"),
            "transfers_in": el.get("transfers_in"),
            "transfers_out": el.get("transfers_out"),
        }
        for el in bootstrap["elements"]
    }
    by_fixture = {fx["id"]: fx for fx in fixtures}
    return elements, by_fixture


def _fixture_rows(entry, meta, by_fixture, event):
    """One row per fixture this player's team played in `event`."""
    rows = []
    stats = entry.get("stats", {})
    for position, block in enumerate(entry.get("explain") or []):
        fixture = by_fixture.get(block.get("fixture"))
        if fixture is None:
            continue
        was_home = fixture.get("team_h") == meta["team_id"]
        row = {
            "name": meta["name"], "position": meta["position"], "team": meta["team"],
            "element": entry["id"], "fixture": fixture["id"], "round": event, "GW": event,
            "opponent_team": fixture["team_a"] if was_home else fixture["team_h"],
            "was_home": was_home,
            "kickoff_time": fixture.get("kickoff_time"),
            "team_h_score": fixture.get("team_h_score"),
            "team_a_score": fixture.get("team_a_score"),
            "value": meta["value"], "selected": meta["selected"],
            "transfers_in": meta["transfers_in"], "transfers_out": meta["transfers_out"],
            "transfers_balance": None, "xP": None, "modified": None,
        }
        # Per-fixture stats come from `explain`; the identifiers FPL awards no
        # points for (goals conceded at 0, say) are simply absent there, which
        # is a zero rather than a gap.
        per_fixture = {s["identifier"]: s.get("value", 0) for s in block.get("stats", [])}
        for key in PER_FIXTURE:
            row[key] = per_fixture.get(key, 0)
        row["total_points"] = sum(
            s.get("points", 0) + s.get("points_modification", 0) for s in block.get("stats", [])
        )
        # Whole-week figures land on the first fixture so the week still sums.
        for key in PER_GAMEWEEK:
            row[key] = stats.get(key, 0) if position == 0 else 0
        rows.append(row)
    return rows


def build(season=SEASON):
    bootstrap = client.get_bootstrap()
    fixtures = client.get_fixtures()
    elements, by_fixture = _lookups(bootstrap, fixtures)
    finished = [e["id"] for e in bootstrap["events"] if e.get("finished")]

    rows = []
    for event in finished:
        live = client.get_event_live(event)
        for entry in live.get("elements", []):
            meta = elements.get(entry["id"])
            if meta is None:
                # A player removed from the game since that gameweek. Their
                # rows would have no team or position to attach to, and the
                # model reads this file by team, so they are dropped rather
                # than written with holes.
                continue
            rows.extend(_fixture_rows(entry, meta, by_fixture, event))
    return pd.DataFrame(rows, columns=COLUMNS), finished


def main():
    frame, finished = build()
    if frame.empty:
        print(f"No finished gameweeks in {SEASON} yet - nothing to write.")
        return 0
    out = DATA_DIR / f"gw_history_{SEASON}.csv"
    frame.to_csv(out, index=False)
    print(f"Wrote {len(frame)} rows across GW{finished[0]}-{finished[-1]} to {out}")
    played = frame.groupby("GW")["total_points"].agg(["size", "sum"])
    print(played.to_string())
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
