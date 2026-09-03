"""
How many free transfers a manager actually has.

FPL publishes this number only on the logged-in `my-team` endpoint, which this
app has no credentials for and does not want any. So it is reconstructed from
the public history: how many transfers were made each gameweek, what each cost,
and which chips were played.

Every surface that recommends transfers needs it. Assuming one - which is what
this app did until now - is wrong for most managers most weeks, and wrong in the
direction that costs points: a manager sitting on three free transfers gets
shown a single move and told the rest would cost four points each.

THE ACCRUAL RULE, ESTABLISHED FROM DATA RATHER THAN MEMORY
----------------------------------------------------------
Gameweek 1 is the free pre-season build, and nothing rolls out of it. The first
free transfer is the one for gameweek 2, and it is exactly one. From there a
gameweek grants one more, unused ones bank, and the bank is capped.

That first clause is the one worth showing your work on, because the obvious
reading - "you start with one in GW1, you used none, so you have two in GW2" -
is wrong. Sampled the 400 highest-ranked managers in the game and kept the four
who paid a hit in GW2 (with no wildcard or free hit to muddy it). A hit prices
the balance exactly: cost = 4 x (transfers made - free transfers held), so each
of those managers solves for the number they held. All four solve to 1, none to
2. Hence FIRST_ACCRUING_EVENT below.

Wildcard and Free Hit weeks make transfers unlimited and free, so they consume
nothing from the bank; the accrual still happens. Bench Boost and Triple Captain
do not touch transfers at all.
"""

# The bank is capped - rolling forever is not on offer.
MAX_FREE_TRANSFERS = 5

# The first gameweek that hands out a free transfer. GW1's squad is built with
# unlimited transfers and leaves no balance behind it, so the count starts here.
FIRST_ACCRUING_EVENT = 2

# What a manager is given for FIRST_ACCRUING_EVENT, before any rolling.
INITIAL_FREE_TRANSFERS = 1

# Chips that make a gameweek's transfers unlimited and free. A week played on
# one of these spends nothing from the bank however many moves were made.
UNLIMITED_TRANSFER_CHIPS = frozenset({"wildcard", "freehit"})


def free_transfers_for_event(history, event):
    """
    Free transfers in hand going into `event`.

    `history` is the FPL entry-history payload (see
    fpl.data.entry.fetch_entry_history): a `current` list of per-gameweek rows
    carrying `event` and `event_transfers`, and a `chips` list of
    {name, event}.

    Replays the season one gameweek at a time rather than working backwards
    from a total, because the cap makes the arithmetic lossy: a manager who
    banked five and spent two cannot be told apart, from totals alone, from one
    who banked three and spent none.

    Only gameweeks strictly before `event` are replayed. Returns
    INITIAL_FREE_TRANSFERS for `event` at or before FIRST_ACCRUING_EVENT, and
    never returns less than zero - a manager who took a hit has spent past the
    balance, not gone into debt against next week.
    """
    if event <= FIRST_ACCRUING_EVENT:
        return INITIAL_FREE_TRANSFERS

    unlimited_events = {
        chip.get("event") for chip in history.get("chips") or []
        if chip.get("name") in UNLIMITED_TRANSFER_CHIPS
    }
    made_by_event = {
        row["event"]: row.get("event_transfers") or 0
        for row in history.get("current") or []
    }

    have = INITIAL_FREE_TRANSFERS
    for played in range(FIRST_ACCRUING_EVENT, event):
        spent = 0 if played in unlimited_events else made_by_event.get(played, 0)
        # Spending beyond the balance is a hit, not a negative bank.
        have = min(max(have - spent, 0) + 1, MAX_FREE_TRANSFERS)
    return have


def describe_free_transfers(count):
    """
    The count as a sentence fragment, for a caller putting it in prose.

    Exists so "1 free transfer" and "3 free transfers" don't have to be
    pluralised at four different call sites.
    """
    return "1 free transfer" if count == 1 else f"{count} free transfers"
