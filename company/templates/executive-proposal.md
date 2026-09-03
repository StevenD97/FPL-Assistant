# Executive Proposal — [Title]

**Proposed by:** [role] · **Date:** YYYY-MM-DD
**Status:** DRAFT | AWAITING STEVEN | APPROVED | REJECTED | SUPERSEDED

## Problem
The problem in the user's or the business's terms, with the evidence that it is real.
If the evidence is an assumption, say so here rather than further down.

## Proposed solution
What would actually be built or changed. Name files and surfaces where known.
Prefer the smallest version that tests the idea.

## Expected impact
What changes, for whom, and by how much. State the metric that would show it worked
and the observation window.

## Alternatives considered
| Alternative | Why not |
|---|---|

Include "do nothing" every time, with a real reason for rejecting it.

## Estimated effort
Rough size and sequence. Where large, break into shippable steps, each leaving
`main` green.

## Cost
Money (£/month), AI usage, and recurring human time. All three. £0 is an answer,
not an omission.

## Risks
| Risk | Likelihood | Impact | Mitigation | How we'd notice |
|---|---|---|---|---|

Include the risk of the change itself failing, and how it is reverted.

## Success metrics
Pre-committed, before the work starts: what proves this worked, and the condition
under which it is called dead.

## Testing
What gates run before this reaches production. For app changes:
`pytest` in `backend/`; `gen:api`, `tsc --noEmit`, `eslint`, `build` in `frontend/`.

## Approval required
- [ ] Steven — spending
- [ ] Steven — production deployment
- [ ] Steven — major product change
- [ ] Steven — prediction methodology change
- [ ] Steven — affects existing users
- [ ] CEO only — inside existing authority
