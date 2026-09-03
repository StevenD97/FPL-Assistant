# The xFPL Executive System

A structured way for a single Claude Code session to adopt clearly defined executive
roles, keep organisational context between sessions, and produce decisions Steven can
approve or reject.

It is documentation and instructions. There are **no background processes, no external
AI APIs, and no autonomous agents.** Everything runs inside one ordinary Claude Code
session, and everything it produces is a file in this repository.

## Hierarchy

```
                        STEVEN
              Owner and Chairman — final authority
                          |
                         CEO
             strategy · prioritisation · decisions
                          |
      +-----------+-------+-------+-----------+
      |           |               |           |
     CTO         CPO      HEAD OF FPL       CMO
  engineering  product     ANALYTICS      growth
                           model
```

## What is here

| Path | What it is |
|---|---|
| `CONTEXT.md` | **Read this first.** The company, its facts, its constraints, its UNKNOWNs. |
| `OPERATING-PRINCIPLES.md` | The ten rules binding on every executive. |
| `MEETING-PROTOCOL.md` | How an executive meeting runs. |
| `executives/` | One persistent role definition per executive. |
| `templates/` | Executive Report · Executive Proposal · Executive Decision. |
| `decisions/` | CEO decision log. |
| `meetings/` | Meeting minutes. |
| `reports/` | Standing reports, including the initial audit. |

`../CLAUDE.md` tells Claude Code how to use all of it.

## The five modes

1. **Act as one executive** — `/cto`, `/cpo`, `/ceo`, `/analytics`, `/cmo`
2. **Consult several** — ask two or three named executives, no meeting overhead
3. **Hold an executive meeting** — `/exec-meeting [topic]`
4. **Produce a CEO decision** — `/ceo decide [topic]`
5. **Implement approved work** — only after Steven has approved a specific proposal

## The rules that matter most

- **Steven approves** spending, major product changes, production deployments,
  prediction-methodology changes, and anything that could affect existing users.
- **Nothing is implemented from a meeting or a report.** Recommendations only.
- **The AI budget is a real constraint.** Cite `CONTEXT.md` and existing reports
  instead of re-reading the repository. Seat the minimum executives. Keep it short.
- **UNKNOWN is an answer.** Never fill a gap with a guess.
