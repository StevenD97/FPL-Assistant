"""
Database schema. Three tables:

- raw_snapshots: the exact bootstrap-static / fixtures JSON as fetched from
  FPL, one row per fetch, per season. The app reconstructs load_bootstrap()/
  load_fixtures() from the latest snapshot, so downstream code sees a
  byte-identical structure and needs no changes.
- player_gw_stats: normalized one-row-per-player-per-gameweek history (the
  live, append-only replacement for gw_history_<season>.csv). Keyed on the
  stable FPL `code` as well as the season-scoped `element` id, so joins
  survive FPL's yearly id reassignment.
- ingest_runs: audit/idempotency log for each ingestion.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RawSnapshot(Base):
    __tablename__ = "raw_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    season: Mapped[str] = mapped_column(String(16), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # 'bootstrap' | 'fixtures'
    data: Mapped[dict] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_raw_snapshots_lookup", "season", "kind", "fetched_at"),
    )


class PlayerGwStat(Base):
    __tablename__ = "player_gw_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    season: Mapped[str] = mapped_column(String(16), index=True)
    event: Mapped[int] = mapped_column(Integer, index=True)  # gameweek (a.k.a. round / GW)
    element: Mapped[int] = mapped_column(Integer)            # season-scoped FPL element id
    element_code: Mapped[int] = mapped_column(Integer, index=True)  # stable cross-season id

    # FPL fixture id. Real id for archived per-fixture rows (so double
    # gameweeks keep both rows); 0 for the current season's aggregated
    # per-gameweek live rows. Part of the uniqueness key.
    fixture: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    name: Mapped[str | None] = mapped_column(String(160))
    position: Mapped[str | None] = mapped_column(String(8))
    team: Mapped[str | None] = mapped_column(String(48))  # full club name in the archive CSV, not a code
    opponent_team: Mapped[int | None] = mapped_column(Integer)
    was_home: Mapped[bool | None] = mapped_column(Boolean)
    kickoff_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    # Final match score (team_model derives each side's goals for/against from these).
    team_h_score: Mapped[int | None] = mapped_column(Integer)
    team_a_score: Mapped[int | None] = mapped_column(Integer)

    minutes: Mapped[int | None] = mapped_column(Integer)
    starts: Mapped[int | None] = mapped_column(Integer)
    total_points: Mapped[int | None] = mapped_column(Integer)
    bonus: Mapped[int | None] = mapped_column(Integer)
    bps: Mapped[int | None] = mapped_column(Integer)
    goals_scored: Mapped[int | None] = mapped_column(Integer)
    assists: Mapped[int | None] = mapped_column(Integer)
    clean_sheets: Mapped[int | None] = mapped_column(Integer)
    goals_conceded: Mapped[int | None] = mapped_column(Integer)
    own_goals: Mapped[int | None] = mapped_column(Integer)
    penalties_saved: Mapped[int | None] = mapped_column(Integer)
    penalties_missed: Mapped[int | None] = mapped_column(Integer)
    yellow_cards: Mapped[int | None] = mapped_column(Integer)
    red_cards: Mapped[int | None] = mapped_column(Integer)
    saves: Mapped[int | None] = mapped_column(Integer)

    influence: Mapped[float | None] = mapped_column(Float)
    creativity: Mapped[float | None] = mapped_column(Float)
    threat: Mapped[float | None] = mapped_column(Float)
    ict_index: Mapped[float | None] = mapped_column(Float)
    expected_goals: Mapped[float | None] = mapped_column(Float)
    expected_assists: Mapped[float | None] = mapped_column(Float)
    expected_goal_involvements: Mapped[float | None] = mapped_column(Float)
    expected_goals_conceded: Mapped[float | None] = mapped_column(Float)

    clearances_blocks_interceptions: Mapped[int | None] = mapped_column(Integer)
    recoveries: Mapped[int | None] = mapped_column(Integer)
    tackles: Mapped[int | None] = mapped_column(Integer)
    defensive_contribution: Mapped[int | None] = mapped_column(Integer)

    value: Mapped[int | None] = mapped_column(Integer)  # price in tenths of £m at that GW
    selected: Mapped[int | None] = mapped_column(Integer)
    transfers_in: Mapped[int | None] = mapped_column(Integer)
    transfers_out: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (
        UniqueConstraint("season", "event", "element", "fixture", name="uq_pgs_season_event_element_fixture"),
        Index("ix_pgs_season_event", "season", "event"),
    )


class IngestRun(Base):
    __tablename__ = "ingest_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))               # 'bootstrap' | 'fixtures' | 'live' | 'backfill'
    season: Mapped[str | None] = mapped_column(String(16))
    event: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="running")  # running | ok | error
    rows: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
