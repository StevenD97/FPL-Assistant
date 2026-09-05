# Executive HQ — telemetry

What the board shows, where each number comes from, and how to refresh it.

**HQ:** https://claude.ai/code/artifact/c4559896-b1fa-46c9-b8d8-ce7f4511db13

## Refreshing

```bash
python3 company/hq-metrics/collect.py > company/hq-metrics/snapshot.json
```

Then write it into the HQ's store — the page is **not** republished, it re-reads:

```
Artifact  action: write_db  db_op: set
          url: <the HQ artifact URL>
          collection: metrics   doc_id: current
          file_path: company/hq-metrics/snapshot.json
```

The page only accepts a snapshot newer than the one baked into it, so an older
reading can never overwrite a newer one.

## Where each panel gets its number

| Panel | Source | Measured? |
|---|---|---|
| Site / API up, response times, payloads | timed GETs against the live deployment | **yes** |
| Data source, snapshot age, staleness, next deadline | `/api/data-status` | **yes** |
| Accuracy, captain average, error by category | `/api/accuracy` | **yes** |
| Commits, LOC, tests, routes, workflows, posts, freezes | the repository | **yes** |
| robots / sitemap / OpenGraph | checked by hand, 3 Sep — all absent | **yes** |
| Instance hours | Render's free allowance against a 10-minute ping | arithmetic |
| Visitors, traffic, revenue, retention, errors, uptime, Core Web Vitals | **nothing measures these** | **no — shown unlit** |

## The rule this board is built on

A panel is lit when it has a reading and unlit when nothing is measuring it. There is
no third state and no placeholder. Four of the eight tiles on the status board are
unlit, and that is the most important thing on the screen — not a defect in the
dashboard.

Do not fill an unlit panel with an estimate to make the board look complete.
