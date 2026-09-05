# Executive HQ — the design system

The visual identity comes from a Claude Design artboard Steven built
(artifact `1b8483e7-e05e-4772-8a43-159c111e7747`), unpacked and ported into the
running application. These are the tokens the app is written against. Match them
when adding anything.

## Palette

| Token | Value | Used for |
|---|---|---|
| `--void` | `#080b0a` | the page |
| `--panel` | `#0c110f` | every card and surface |
| `--raised` / `--sunk` | `rgba(255,255,255,.02)` / `.015` | inset fields, button faces |
| `--line` / `--line-soft` / `--line-hot` | `rgba(255,255,255,.09)` / `.07` / `.13` | borders, hover |
| `--tx` → `--tx5` | `#e8ece9` `#b3bcb8` `#8a938f` `#6d7772` `#5f6864` | text, primary to faint |
| `--dead` / `--deader` | `#4a5450` / `#2f3a36` | unlit panels — deliberately inert |
| `--live` / `--live-lt` | `#35e39a` / `#7cf0c0` | accent, live signal, primary action |
| `--on-live` | `#06120d` | text on an accent fill |
| `--s1` / `--s2` | `#35e39a` / `#7b83f0` | chart series (validated pair) |
| `--warn` / `--crit` | `#f0b429` / `#ff6b6b` | reserved status only, never a series |

## Type

**Archivo** for everything readable. **IBM Plex Mono** for every label, figure,
timestamp and status word. Two faces, no third.

Headings run tight (`-0.01em` to `-0.03em`); mono labels run wide
(`0.12em` to `0.2em`, uppercase). Scale: 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16 ·
17 · 20 · 22 · 26 · 27 · 30 · 34.

## Shape

**No border radius anywhere**, except a `50%` status dot. Everything is a sharp
rectangle. This is load-bearing to the instrument-panel feel — a rounded corner
reads as a consumer app and breaks it.

## Structure

- Sticky header with a mint-to-transparent gradient wash, the `xF` mark,
  the readings timestamp and the owner pill.
- **Horizontal tab strip** with a 2px underline on the active tab, scrolling
  on a narrow screen. Not a bottom bar.
- Content capped at 1440px.
- Sub-navigation inside Work and Metrics uses bordered mono chips.

## The one rule the design encodes

A lit panel has a reading. An unlit panel is dashed, grey, inert and says
**NO SIGNAL**. There is no third state, and nothing is ever filled with a
placeholder to make the board look complete.
