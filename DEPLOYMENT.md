# Deployment and operations

How xFPL is hosted, what to do when the free Postgres expires (again), and how
to tell — quickly — whether the live site is serving current data.

## The shape of it

| Piece | Where | Plan |
|---|---|---|
| Frontend (Next.js) | its own host, serving `xfpl.co.uk` | free |
| Backend (FastAPI) | Render web service, `render.yaml` | free |
| Database (Postgres) | **you choose — see below** | free |
| Hourly ingest | GitHub Actions, `ingest-data.yml` | free |
| Freshness alarm | GitHub Actions, `check-data-freshness.yml` | free |
| Freshness alarm (external) | UptimeRobot keyword monitor | free |
| Weekly fallback refresh | GitHub Actions, `refresh-fallback-snapshot.yml` | free |

There is deliberately no Render cron job. There used to be one, on the paid
starter plan, doing exactly what `ingest-data.yml` already does for nothing.

### The database is optional, and that is the point

`allow_file_fallback` (default on) means that when the database is empty or
unreachable, the app reads the committed snapshots in `data/` instead. The site
stays up. This is why losing the free Postgres did not take xFPL down — and
also why nobody noticed for a month.

What you lose without a database:

- **Price Watch's transfer-rate column.** It compares repeated snapshots over a
  48-hour window; one snapshot gives you today's numbers and nothing else.
- **2026/27 gameweek history accumulating** in `player_gw_stats`. This one
  compounds: it is what the model will eventually train on instead of leaning
  on the 2025/26 archive, and you cannot backfill a week you never recorded.

Everything else works from files.

## Setting up Postgres (what you need to do)

Render's free Postgres is deleted after 30 days. Use a provider whose free tier
does not expire. **Neon** is the recommendation: it does not pause on a weekly
idle timer the way Supabase's free tier does, which matters because the ingest
only touches the database once an hour.

No code changes are needed. `config.py` already rewrites `postgres://` and
`postgresql://` connection strings to the `psycopg3` driver the app uses, so
you can paste a provider's string in as-is.

1. **Create the database.** Sign up at neon.tech, create a project (pick the
   region nearest your Render service), and copy the connection string. It
   looks like:

   ```
   postgresql://user:password@ep-something.eu-west-2.aws.neon.tech/neondb?sslmode=require
   ```

2. **Give it to the ingest.** GitHub → the repo → Settings → Secrets and
   variables → Actions → New repository secret:

   - Name: `DATABASE_URL`
   - Value: the connection string

3. **Give it to the backend.** Render → `fpl-assistant-backend` → Environment →
   add `DATABASE_URL` with the same value. The service redeploys itself.

4. **Create the schema and load it.** Locally, with the venv set up (see the
   README):

   ```bash
   cd backend
   export DATABASE_URL='...the same connection string...'
   venv/bin/alembic upgrade head
   venv/bin/python -m fpl.data.ingest backfill   # archive + live, a few minutes
   venv/bin/python -m fpl.data.ingest status     # confirm rows landed
   ```

   Or skip the local step: trigger **Actions → Ingest FPL data → Run workflow**,
   which applies migrations and ingests. It will not backfill the 2025/26
   archive, though — only `backfill` does that, and the model wants it.

5. **Check it took.**

   ```bash
   curl -s https://fpl-assistant-backend-wxtz.onrender.com/api/data-status | jq
   ```

   You want `"source": "database"` and `"stale": false`.

### While you are in the GitHub settings

Two optional repository **variables** (Settings → Secrets and variables →
Actions → Variables), only needed if things move:

- `BACKEND_URL` — used by `check-data-freshness.yml`; defaults to the current
  Render URL.

## Is the site healthy?

One command:

```bash
curl -s https://fpl-assistant-backend-wxtz.onrender.com/api/data-status | jq
```

```json
{
  "source": "database",
  "snapshot_fetched_at": "2026-08-31T18:26:44+00:00",
  "snapshot_age_hours": 0.4,
  "next_event": 3,
  "next_deadline": "2026-09-04T17:30:00Z",
  "stale": false,
  "reasons": []
}
```

| Field | What it tells you |
|---|---|
| `source` | `database`, or `files` if it fell back |
| `snapshot_age_hours` | how long since the ingest last stored data (`null` on the file path — a file's mtime is its checkout time, not its data time) |
| `stale` | the one to act on |
| `reasons` | why, in words |

`stale` is driven mainly by the data's own calendar: if the next deadline it
knows about has already passed, the snapshot predates a gameweek that has since
started. That is true whether it is serving from the database or from disk, and
true even for a snapshot fetched minutes ago — which is why age alone is not
enough. `check-data-freshness.yml` runs this check every six hours and fails
the workflow when it trips, so GitHub emails you.

The other two endpoints answer narrower questions: `/api/health` is liveness
only (it stayed green through the entire outage — do not read it as "fine"),
and `/api/ready` is database connectivity specifically.

### The external monitor, and why it is not optional

`check-data-freshness.yml` and `ingest-data.yml` are both GitHub `schedule:`
workflows, and GitHub disables scheduled workflows after 60 days without
repository activity. They would stop together — the ingest silently, and the
alarm along with it, so nothing would be left to notice. An alarm that dies
with the thing it watches is not an alarm, which is why there is a second one
outside GitHub.

Set up as an UptimeRobot monitor (free tier):

| Setting | Value |
|---|---|
| Monitor type | Keyword |
| URL | `https://fpl-assistant-backend-wxtz.onrender.com/api/data-status` |
| Keyword type | **Keyword not exists** |
| Keyword value | `"stale":false` |
| Interval | 5 minutes |
| Timeout | 60 seconds |

Three details that matter:

- **The keyword is compact — no space after the colon.** FastAPI serialises
  without one, so `"stale": false` never matches and the monitor would alert
  forever.
- **"Not exists", not "exists".** Alerting on `"stale":true` appearing would
  only catch stale data; if the backend 500s or times out that string is
  absent too, and you would hear nothing. Keying on the absence of
  `"stale":false` catches both failures with one rule.
- **60-second timeout.** On Render's free plan the service sleeps after ~15
  minutes idle and a cold start takes ~35s, which would trip UptimeRobot's
  30-second default.

A side effect worth knowing: a 5-minute external check keeps the free instance
permanently awake, which is exactly what `keep-backend-alive.yml` exists to do.
Once you trust the monitor, that workflow is redundant and can go.

## Storage, and why the last database filled up

Every ingest stores bootstrap and fixtures verbatim in `raw_snapshots`. Measured
on Postgres 16 those rows are **254 kB** and **26 kB** of JSONB. Hourly, with
nothing ever deleting them, that is **~200 MB a month, without bound** — enough
to exhaust a small managed tier inside a season.

`prune_snapshots()` now runs at the end of every `ingest run`:

- everything inside `snapshot_fine_hours` (default 7 days) is kept at full
  hourly resolution — the window Price Watch reads;
- older rows thin to one per UTC day, back `snapshot_daily_days` (default 180);
- the newest snapshot of each kind is **never** deleted, however old, because
  that is the row every request reads. A cron dead for a year leaves the site
  stale, not down.

Steady state is roughly **100 MB** and stops growing. Both windows are settable
via `SNAPSHOT_FINE_HOURS` / `SNAPSHOT_DAILY_DAYS`.

Watch it with:

```bash
venv/bin/python -m fpl.data.ingest status   # includes table sizes
```

**One-off after the first big prune.** A `DELETE` only marks tuples dead. The
prune runs a plain `VACUUM ANALYZE`, which makes the space reusable — so the
table plateaus — but does not hand it back to the OS, so the reported size will
not drop. To actually reclaim it once, after the first prune of a large table:

```sql
VACUUM FULL raw_snapshots;
```

That takes an exclusive lock and needs temporary space roughly equal to the
table, so run it once by hand, not from the cron.

## When something is wrong

**`stale: true`, `source: files`** — the database is unreachable. Check
`DATABASE_URL` on Render, check the provider's dashboard (free tiers expire,
pause, and fill up), then re-run **Actions → Ingest FPL data**.

**`stale: true`, `source: database`** — the ingest has stopped. Look at the
last few runs of `ingest-data.yml`. A missing `DATABASE_URL` secret shows as a
warning annotation on a green run, so read the annotations, not just the tick.

**`"stored snapshot is malformed"`** — a truncated write, or an FPL error page
stored as if it were data. The loaders reject it and serve files instead, so
the site is up. Delete the bad row and re-ingest:

```sql
DELETE FROM raw_snapshots
WHERE id = (SELECT id FROM raw_snapshots
            WHERE season = '2026_27' AND kind = 'bootstrap'
            ORDER BY fetched_at DESC LIMIT 1);
```

**Everything is fine but the site is slow on first load** — the free Render
service sleeps after ~15 minutes idle, and a cold start is ~35s.
`keep-backend-alive.yml` pings every 10 minutes to prevent it. That uses about
730 of the 750 free instance-hours a month, so there is no headroom for a
second free service on the same account.

**The database is gone entirely and you need the site correct now** — merge a
`refresh-fallback-snapshot` PR (or run that workflow). The committed snapshot
becomes current and the site serves accurate data from files while you sort the
database out.

## Costs

Everything above is £0. If you would rather pay to remove the moving parts,
roughly (verify current pricing):

- Render Starter for the backend, ~$7/month — no sleep, no ephemeral disk, and
  `keep-backend-alive.yml` becomes dead weight to delete.
- Managed Postgres, ~$7/month — removes the free-tier expiry risk. The
  retention policy still matters; it just buys headroom.

## Before you push

CI runs these on every push and PR (`ci.yml`), but locally:

```bash
cd backend
venv/bin/python -m pytest                      # 53 tests
# the Postgres-backed tests skip unless you give them a database:
podman compose up -d
TEST_DATABASE_URL=postgresql+psycopg://fpl:fpl_local_dev@localhost:5432/fpl \
  venv/bin/python -m pytest                    # 62 tests

cd ../frontend
npm run gen:api && npx tsc --noEmit && npm run build
```

If you changed an API response, refresh the goldens deliberately and read the
diff: `FPL_UPDATE_GOLDENS=1 venv/bin/python -m pytest`, then
`npm run gen:api` in `frontend/` — CI fails if the committed types drift from
the goldens.

`npm run lint` currently reports 9 pre-existing
`react-hooks/set-state-in-effect` errors, which is why lint is not yet a CI
gate.
