# Running the executive team — Steven's guide

Written for the two people who own this company, not for the executives.

## The mental model, in one paragraph

Nothing runs in the background. There are no agents online, no processes, no queue.
The "executive team" is five role documents in `company/executives/` plus a rule that
Claude reads one of them and answers strictly from that seat. **You start every piece
of work**, by opening Claude Code on this repository and typing a command. The
executive answers, writes its output to a file in `company/`, and stops. That is the
entire mechanism — which is why it costs nothing to run and cannot break.

## The weekly rhythm

| When | Do this | Cost |
|---|---|---|
| Sitting down | `/exec-status` — what is outstanding, from the documents only | Tiny |
| A specific question | `/cto`, `/cpo`, `/cmo`, `/analytics`, `/ceo` — the narrowest seat that can answer | Small |
| A contested decision | `/exec-meeting <topic>` — several perspectives, real disagreement, a CEO call | Moderate |
| Ready to build | `Approved: <the specific proposal>` — the only thing that touches code | Varies |

Ask the narrowest seat that can answer. Two executives is normal. Five is almost never
right and costs the most.

## What you are for

You are the bottleneck by design. Nothing ships without you, and the team is built to
stop and ask rather than assume. Your job is to answer, not to manage — the useful
input is a decision or a fact, not direction.

## Executive HQ

The working system. Bookmark it; it is built for a phone.

**https://claude.ai/code/artifact/c4559896-b1fa-46c9-b8d8-ce7f4511db13**

- **Today** — what is waiting on you, and the state of the business.
- **CEO** — the one conversation. *Ask* is a single answer; *Convene the team* has the
  CEO pick two or three executives, take their positions without letting them see each
  other's, and then choose.
- **Decide** — approve, reject, or answer. Both owners, saved and synced.
- **Company** — the memory every executive reads.

It costs no money. Each question draws on the Claude usage of whoever asked it, so your
partner needs their own Claude account rather than a shared login.

It supersedes the earlier owners' desk
(https://claude.ai/code/artifact/1907e06b-30b0-4763-89d6-59c4d03b1214), which held no
answers and can be ignored.

### Getting your partner in

Open the HQ, use the **share** control on the page, and add him. Then have him open the
link while signed in to his own Claude account.

**The thing that decides whether this works:** a page that stores data is
organisation-internal — it cannot be opened by a public link, and every reader has to be
a signed-in member of the same Claude organisation as the owner. Two separate personal
Claude subscriptions are usually two separate organisations, in which case the share
dialog will not offer him and the link will not open for him.

The share dialog tells you which case you are in. If it lets you add him by name or
email, you are in one organisation and it will work. If it only offers a link and warns
that others cannot open it, you are not.

Once he is in: he reads and writes the same decisions you do, and his questions to the
CEO draw on **his** Claude usage, not yours. Nothing is billed.

### If the share does not work

Do not pay to fix it. The repository already gives you both a shared executive system
that does not depend on organisations at all: you each run `/ceo`, `/exec-meeting` and
`/exec-status` in your own Claude Code session on this repo, and everything those
produce is committed to `company/`, which is shared by definition. The HQ is the nicer
surface; git is the durable one, and it already works for both of you.

A middle option: he opens the HQ read-only through your screen or a screenshot for the
overview, and does his own executive work in a session. Clumsy, but free.

Answers are stored with the page and survive between sessions. To bring them back into
a session, say **"read the desk"** — Claude reads the stored answers directly. There is
also a button on the page that builds a summary to paste in, if that is easier.

Notes:
- Share it from the page's own share menu; a second person needs to be signed in to the
  same organisation to open it.
- Answers on the desk are **input, not instructions**. They tell the executives what you
  decided; they never authorise work on their own. Approval still happens in a session,
  in your words.
- The repository stays the source of truth. The desk is a convenience over `company/`,
  not a replacement for it.

## The three rules worth remembering

1. **"Approved" is a specific word.** Approving one change is not approving the next.
   If an executive is unsure whether it has approval, it will stop and ask — that is
   correct behaviour, not an obstruction.
2. **UNKNOWN is respected.** The team will not fill a gap with a plausible guess. If it
   needs a fact only you have, it will say so and wait.
3. **"Nothing here" is a valid answer.** An executive that invents work to look busy is
   failing. Expect to be told that something is not worth doing.
