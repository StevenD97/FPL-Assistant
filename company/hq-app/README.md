# Executive HQ — the application

**Live:** https://claude.ai/code/artifact/c4559896-b1fa-46c9-b8d8-ce7f4511db13

`xfpl-hq.html` is the published source. One file: no build, no server, no hosting bill.
It runs as an Artifact with two runtime grants — a shared document store (`db`) and the
ability to call Claude on the viewer's own subscription (`sample`). Total running cost £0.

## The loop it implements

```
SIGNAL → ANALYSIS → RECOMMENDATION → DECISION → TASK → OUTCOME → LEARNING
```

Every step is a real state change with an event appended, so a decision can be traced
back to the reading that started it.

## Collections

| Collection | Holds | Written by |
|---|---|---|
| `memory/*` | company context, the five mandates, the codebase digest, owner-supplied facts | a session, from `company/hq-memory/` |
| `metrics/current` | the measured telemetry snapshot | a session, from `company/hq-metrics/collect.py` |
| `decisions/*` | the permanent register | the page, and seeded here |
| `meetings/*` | question, roster, independent positions, CEO synthesis | the page |
| `tasks/*` | work an executive owns | the page, only from an approved decision |
| `attention/*` | the **status** of a signal — never the signal itself | the page |
| `analysis/*` | an executive's read of a signal | the page |
| `events/*` | the audit trail behind every timeline | the page |
| `thread/*` | the CEO conversation | the page |

## Signals are derived, never stored

An attention item is computed from the current readings each time the page renders, and
exists only while its condition is true. Fix the underlying thing and it disappears on its
own. Only the human response to it — dismissed, resolved, analysed, escalated — persists.

This is deliberate: a stored alert list goes stale and starts lying. A derived one cannot.

## What the AI may and may not do

An executive returns JSON that gets stored. It has no write tools, no credentials and no
shell. Tasks are created only from a decision an owner approved, and even then only when
an owner presses the button. **HQ records an authorisation; it never performs one.**

## Memory rules

The context pack keeps three things apart, and labels them in the prompt:

- **CURRENT FACTS** — measured readings and facts the owners supplied. Trust these.
- **DECISIONS ALREADY MADE** — binding, not to be re-litigated without new evidence.
- **PAST EXECUTIVE WORK** — opinions. Explicitly flagged as challengeable.

A previous recommendation never becomes a fact by being old.

## Refreshing

Telemetry: `company/hq-metrics/collect.py` → write to `metrics/current`.
Memory: edit `company/hq-memory/*.json` → write to `memory/*`.
Neither republishes the page.

## Seeded history

`seed/` holds the six decisions migrated from the owners' first answers on 4 September,
with their real timestamps and decision-maker preserved, plus the facts they supplied.
