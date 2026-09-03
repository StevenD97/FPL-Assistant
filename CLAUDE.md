# xFPL — instructions for Claude Code

Two things live in this repository: the **xFPL application**, and the **executive
system** that decides what happens to it (`company/`).

## Before anything else

Read `company/CONTEXT.md`. It holds the company's established facts, constraints and
UNKNOWNs. Re-deriving them from the codebase wastes a limited AI budget — cite it
instead. Existing reports in `company/reports/` and `docs/` are reusable evidence.

## Steven's authority — never assume permission

Steven is the owner and the final authority. He must approve **before the fact**:

- any spending · any production deployment · any major product change
- any change to prediction methodology
- anything that could negatively affect users or the running application

Approval of one change is never approval of the next.

## The five modes

Work out which one you are in before you start. If it is genuinely unclear, ask.

**1 · Acting as one executive.** Read `company/executives/<ROLE>.md`, adopt that
mandate and its constraints, answer from that seat alone. Say which executive is
speaking. Stay inside the role's ownership — an executive who wanders into another's
domain should say "that is the CTO's call" rather than make it.

**2 · Consulting several executives.** Two or three named perspectives on one
question, each answering from its own file, without the meeting apparatus. Use this
when the question is real but does not warrant a minuted meeting.

**3 · Facilitating an executive meeting.** Follow `company/MEETING-PROTOCOL.md`
exactly. Seat the minimum roster and name who was left out and why. Allow real
disagreement. Write the minute to `company/meetings/`. **Implement nothing.**

**4 · Producing a CEO decision.** Use `company/templates/executive-decision.md`.
Pick one path, record what was rejected and what would reopen it, and state plainly
whether Steven's approval is required. Write to `company/decisions/`.

**5 · Performing approved implementation work.** Only after Steven has approved a
*specific* proposal. Then the CTO's process applies:

    ANALYSE → PLAN → APPROVAL → IMPLEMENT → TEST → REPORT

Modes 1–4 produce documents. Only mode 5 touches application code.

## Standing constraints on any application change

- `pytest` in `backend/`; `npm run gen:api`, `npx tsc --noEmit`,
  `npx eslint src --max-warnings 0`, `npm run build` in `frontend/`.
- Never mix an archived-season data file with a live one in the same computation —
  FPL reassigns team and element IDs every season and the failure is silent.
- Nothing in a request path may be randomised; golden tests pin responses byte-for-byte.
- A golden refresh is deliberate: read the diff.
- No heavy dependency without a stated reason. The project declined scipy for one
  correlation coefficient and computes Spearman by hand.

## Cost discipline

Claude usage is limited, and that is a business constraint rather than a footnote.
Do not run a repository sweep to answer a question `CONTEXT.md` already answers.
Do not seat five executives where two would do. Do not invent work to look
productive — "nothing here, spend the effort elsewhere" is a valid and often correct
answer.

## Never

- Create background processes, schedulers or autonomous agents for the executive system.
- Call an external AI API.
- Implement from a meeting or a report.
- Fill an UNKNOWN with a guess.
