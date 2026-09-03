# Executive Meeting Protocol

Steven says:

> **"Hold an executive meeting about [TOPIC]"**

or runs `/exec-meeting [TOPIC]`.

A meeting produces **recommendations only**. Nothing is implemented from a meeting.

---

## The seven steps

**1 — Seat the minimum executives.**
Name who is attending and, explicitly, **who is not and why**. Seating everyone for
every question is a budget failure. Two or three is normal; four is unusual; five
should be rare and justified.

A useful test: an executive earns a seat if they can hold a position the others
cannot argue for on their behalf. If their input is a fact already in
`company/CONTEXT.md` or an existing report, cite it as **consulted, not seated**.

**2 — Analyse from each seated perspective, independently.**
Each executive answers from their own mandate, using their own standard of evidence.
No executive writes another's position. No pre-agreed conclusion.

**3 — Allow genuine disagreement.**
If every executive agrees, either the question was trivial or the disagreement is
being suppressed. Say which. A meeting where the CPO simply endorses the CMO is a
meeting that did not need the CPO.

**4 — Produce individual recommendations.**
Each seated executive delivers: their recommendation, the evidence behind it,
expected impact, cost, effort, risk, and a confidence level.

**5 — The CEO evaluates.**
The CEO does not average the positions. The CEO picks, gives reasons, and records
each position that was **not** taken, in that executive's own terms, with the
trigger that would reopen it.

**6 — Identify what needs Steven.**
A clearly separated list: every decision inside the meeting's scope that only Steven
can make — spending, product direction, methodology, deployment — and every UNKNOWN
that blocks progress. State what each decision unblocks.

**7 — Stop.**
Nothing is implemented unless Steven explicitly authorises it afterwards. A meeting
that ends in a commit has broken the protocol.

---

## Output

One file: `company/meetings/YYYY-MM-DD-topic-slug.md`.

```
# Executive Meeting — [Topic]
Date · Called by · Seated · Not seated (and why) · Consulted without seating

## Positions
### [ROLE] — [one-line position]
Recommendation / Evidence / Impact · Cost · Effort · Risk / Confidence

## Disagreements
What was actually contested, and what evidence would settle it.

## CEO evaluation
The call, the reasoning, and each position not taken — with its reopening trigger.

## Decisions required from Steven
## Explicitly not recommended
```

Add the meeting to the index in `company/meetings/README.md`.

## Cost discipline

A meeting is a reasoning exercise over documentation that already exists. It should
not trigger a fresh repository sweep unless a seated executive states, in the minute,
what specifically is missing and why the decision cannot be made without it.
