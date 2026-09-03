# Executive HQ — company memory

The documents the executives read before answering. Seeded into the HQ's own store;
these files are the source.

**HQ:** https://claude.ai/code/artifact/c4559896-b1fa-46c9-b8d8-ce7f4511db13

| Document | Read by |
|---|---|
| `context.json` | every executive, every question |
| `principles.json` | every executive, every question |
| `mandate-ceo.json` … `mandate-cmo.json` | that executive only |
| `codebase.json` | the CTO — the architecture, the dangerous areas, the known debt |

## Refreshing it

These are condensed from `company/CONTEXT.md`, `company/OPERATING-PRINCIPLES.md`,
`company/executives/*.md` and the audit. When any of those change materially, update the
matching file here and write it back:

```
Artifact  action: write_db  db_op: batch
          url: <the HQ artifact URL>
          writes: [{op:"set", collection:"memory", doc_id:"context",
                    file_path:"company/hq-memory/context.json"}, …]
```

Keep them lean. Every question sends the relevant subset, so length is a running cost
rather than a one-off.

## What the CTO can and cannot see

`codebase.json` is a **snapshot**: the layering, the module inventory with line counts,
the test and CI state, the scheduled workflows, the three dangerous areas and the known
debt. It is refreshed when a session regenerates it.

The CTO therefore knows the shape of the codebase and where the traps are. It cannot read
a specific function on demand — a published page cannot reach the repository. Two ways to
close that when it matters: ask the CTO in a Claude Code session, where it reads the real
files; or connect GitHub to claude.ai, after which the page could read files live.
