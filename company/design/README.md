# Executive HQ — interface mockup

Five screens of the proposed Executive HQ, as editable design source.

**Live canvas:** https://claude.ai/code/artifact/7ca96bce-46ba-4e4a-a4bb-2c7f1cacaef7

| File | Screen |
|---|---|
| `Main.dc.html` | Dashboard — company overview, "waiting on you", executive cards |
| `Executive.dc.html` | Executive workspace — the CEO, with a conversation |
| `Meeting.dc.html` | Executive meeting — independent positions and the CEO synthesis |
| `Decision.dc.html` | Decision — the human approval surface |
| `Mobile.dc.html` | The same, on a phone |
| `canvas.json` | Layout, titles and the sticky notes |

These are the **source**; the published canvas is built from them. The built file is
~2.5 MB (it carries its own editor) and is deliberately not committed — regenerate it
rather than storing it.

## To change the mockup

Edit the files here, then re-seed and republish to the same artifact URL. The `/design`
skill carries the exact commands; it seeds a fresh copy from these sources every time,
so these files — not the published page — are what a change starts from.

If Steven has edited the canvas in the browser since, read the artifact back and extract
it into a fresh directory first, so his edits are not overwritten.

## Design system

Matches the identity used across the audit, the desk and the architecture proposal:
pitch-teal accent `#0e6a55`, green-biased neutrals, Newsreader for display, Archivo for
body, JetBrains Mono for data. Any new screen should extend that rather than introduce
a second vocabulary.

## Status

Mockup only. Nothing here is built, and the HQ proposal
(`company/proposals/2026-09-03-executive-hq-architecture.md`) is still awaiting Steven.
