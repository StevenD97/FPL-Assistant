"use client";

import { useState } from "react";

import type { SeasonRun as SeasonRunResponse, SeasonRunGameweek } from "@/shared/types/api";

/**
 * What following the model would actually have scored.
 *
 * The rest of the accuracy page answers a statistician's question - does the
 * ranking hold up - and a manager does not buy a rank correlation. They buy a
 * squad, under a budget, with one transfer a week, and they are judged on one
 * number at the end of the season. This is that number.
 *
 * Two views of the same replay, because they answer different questions. "The
 * team each week" is what a reader wants when deciding whether to trust a pick
 * this week: here is the actual eleven, here is what each player scored. "The
 * season" is the argument: here is the running total against the field, and
 * here is where it would sit out of ten million entries.
 *
 * Everything shown is scored, not projected. The squad was chosen from a
 * projection that used only pre-deadline data, and then graded against what
 * really happened - see fpl/domain/season_run.py for the rules it plays by and
 * the ones it does not yet.
 */
export function SeasonRun({ run, view }: { run: SeasonRunResponse; view: "team" | "season" }) {
  const gameweeks = run.gameweeks ?? [];
  const summary = run.summary;

  if (!run.available || !summary || gameweeks.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-text-secondary">
        The season replay hasn&apos;t been built yet. It appears once a gameweek has finished
        and the record has been rebuilt.
      </p>
    );
  }

  return view === "season" ? (
    <SeasonView run={run} />
  ) : (
    <TeamView gameweeks={gameweeks} allReconstructed={summary.all_reconstructed} />
  );
}

/* -------------------------------------------------------------------------- */

function SeasonView({ run }: { run: SeasonRunResponse }) {
  const summary = run.summary;
  const gameweeks = run.gameweeks ?? [];
  const ahead = summary.points_vs_field >= 0;
  const percentile =
    summary.overall_rank != null && summary.overall_entries
      ? (summary.overall_rank / summary.overall_entries) * 100
      : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
        The model given £100.0m and the same rules as everyone else: one free transfer a week
        (banked up to five), four points for every transfer beyond that, auto-substitutions
        when a starter doesn&apos;t play, and the armband passing to the vice when the captain
        doesn&apos;t. Each week&apos;s squad was picked from a projection built with data from
        before that deadline, then scored against what actually happened.
      </p>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Headline
          label="Points"
          value={String(summary.total_points)}
          hint={`across GW${summary.first_event}-${summary.last_event}`}
        />
        <Headline
          label="Against the field"
          value={`${ahead ? "+" : ""}${summary.points_vs_field}`}
          tone={ahead ? "good" : "bad"}
          hint={`the average manager scored ${summary.field_total}`}
        />
        <Headline
          label="Overall rank"
          value={summary.overall_rank != null ? summary.overall_rank.toLocaleString() : "—"}
          hint={
            percentile != null
              ? `top ${percentile < 1 ? percentile.toFixed(1) : Math.round(percentile)}% of ${(summary.overall_entries / 1e6).toFixed(1)}m`
              : "not looked up this run"
          }
        />
        <Headline
          label="Points taken in hits"
          value={String(summary.total_hits)}
          hint={summary.total_hits === 0 ? "no hits taken" : "charged at 4 each"}
        />
      </section>

      {/* The two caveats that decide how much this is worth, stated where the
          number is rather than in a footnote nobody reaches. */}
      <div className="flex flex-col gap-2">
        {summary.all_reconstructed && (
          <Caveat>
            Every week here was <strong className="font-semibold">reconstructed</strong>{" "}
            after the fact, from data available before that deadline. That is honest, but it is
            weaker than a squad published in advance - the code in between is ours to change.
            From now on each gameweek&apos;s projections are committed before its deadline, and
            this run uses that file once it exists.
          </Caveat>
        )}
        {summary.chips_available && (
          <Caveat>
            No chips have been played. Deciding when to spend a Wildcard or a Bench Boost is a
            forward-looking call this replay doesn&apos;t make yet, so all five are still in
            hand and the total above is a floor - whatever the chips would have been worth is
            missing from it, not folded into it.
          </Caveat>
        )}
      </div>

      <ol className="flex flex-col">
        {gameweeks.map((gw) => (
          <SeasonRow key={gw.event} gw={gw} />
        ))}
      </ol>
    </div>
  );
}

function SeasonRow({ gw }: { gw: SeasonRunGameweek }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 py-2.5 last:border-0">
      <span className="w-12 shrink-0 font-mono text-sm font-semibold text-text-primary">
        GW{gw.event}
      </span>

      <span className="w-16 shrink-0 font-mono text-sm font-semibold text-text-primary">
        {gw.points} pts
      </span>

      <span className="min-w-0 flex-1 text-sm text-text-secondary">
        {gw.transfers_made === 0 ? (
          <span className="text-text-muted">
            No transfer{gw.free_transfers > 1 ? ` (${gw.free_transfers} banked)` : ""}
          </span>
        ) : (
          <>
            <span className="text-danger">↓ {gw.transfers_out.join(", ")}</span>
            <span className="text-text-muted"> → </span>
            <span className="text-success">↑ {gw.transfers_in.join(", ")}</span>
          </>
        )}
        {gw.captain && (
          <span className="text-text-muted">
            {" · "}(C) {gw.captain}
            {gw.captain_changed ? " — vice took it" : ""}
          </span>
        )}
      </span>

      <span className="shrink-0 font-mono text-xs text-text-muted">
        {gw.points_hit > 0 && <span className="text-danger">-{gw.points_hit} · </span>}
        {gw.total_points} total
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function TeamView({
  gameweeks,
  allReconstructed,
}: {
  gameweeks: SeasonRunGameweek[];
  allReconstructed: boolean;
}) {
  // Opens on the most recent week, which is the one a reader is asking about.
  const [event, setEvent] = useState(gameweeks[gameweeks.length - 1].event);
  const gw = gameweeks.find((g) => g.event === event) ?? gameweeks[gameweeks.length - 1];
  const starters = gw.squad.filter((p) => p.started);
  const bench = gw.squad.filter((p) => !p.started);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
        The eleven the model would have started, and what each of them actually scored.
        Projections are what it expected before the deadline; points are what happened.
        {allReconstructed && " These weeks were reconstructed after the fact."}
      </p>

      <div className="scroll-edge -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {gameweeks.map((g) => (
          <button
            key={g.event}
            type="button"
            onClick={() => setEvent(g.event)}
            aria-pressed={g.event === event}
            className={`tap-target shrink-0 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
              g.event === event
                ? "border-brand bg-brand-wash text-text-primary"
                : "border-border bg-surface text-text-secondary hover:border-border-strong"
            }`}
          >
            GW{g.event}
            <span className="ml-1.5 font-mono text-xs text-text-muted">{g.points}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="font-mono text-lg font-semibold text-text-primary">{gw.points} pts</span>
        <span className="text-text-muted">
          £{gw.squad_value}m squad · £{gw.bank}m in the bank · {gw.bench_points} left on the bench
        </span>
      </div>

      {gw.substitutions.length > 0 && (
        <p className="text-xs leading-snug text-text-muted">
          Auto-subs:{" "}
          {gw.substitutions.map((s, i) => (
            <span key={`${s.off}-${s.on}`}>
              {i > 0 && " · "}
              {s.off} → {s.on}
            </span>
          ))}
        </p>
      )}

      <SquadList label="Starting XI" players={starters} />
      <SquadList label="Bench" players={bench} />
    </div>
  );
}

function SquadList({
  label,
  players,
}: {
  label: string;
  players: SeasonRunGameweek["squad"];
}) {
  if (players.length === 0) return null;
  const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 } as Record<string, number>;
  const sorted = [...players].sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9));

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{label}</h3>
      <ul className="mt-1.5 flex flex-col">
        {sorted.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0"
          >
            <span className="w-9 shrink-0 font-mono text-[10px] font-bold uppercase tracking-wide text-text-muted">
              {p.position}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-text-primary">{p.web_name}</span>
              {p.captain && <span className="ml-1.5 font-mono text-xs text-brand">(C)</span>}
              <span className="block text-xs leading-snug text-text-muted">
                {p.team_short} · £{p.cost}m
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`font-mono text-sm font-semibold ${
                  p.actual_points >= 5
                    ? "text-success"
                    : p.minutes === 0
                      ? "text-text-muted"
                      : "text-text-primary"
                }`}
              >
                {p.actual_points}
              </span>
              <span className="block font-mono text-xs leading-snug text-text-muted">
                exp {p.predicted_points.toFixed(1)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Headline({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{label}</p>
      <p
        className={`mt-1 font-mono text-lg font-semibold ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text-primary"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-text-muted">{hint}</p>
    </div>
  );
}

function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-3xl border-l-2 border-border-strong pl-3 text-xs leading-relaxed text-text-muted">
      {children}
    </p>
  );
}
