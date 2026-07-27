// Maps the API's 3-letter team_short codes to the club-color CSS variable
// slugs defined in globals.css (--team-<slug>). Covers both the live
// 2026/27 roster (Coventry/Hull/Ipswich promoted) and the archived
// 2025/26 season (Burnley/West Ham/Wolves) still used by demo-data pages -
// see README on the live/archived split.
const TEAM_SLUGS: Record<string, string> = {
  ARS: "arsenal",
  AVL: "aston-villa",
  BOU: "bournemouth",
  BRE: "brentford",
  BHA: "brighton",
  BUR: "burnley",
  CHE: "chelsea",
  COV: "coventry",
  CRY: "crystal-palace",
  EVE: "everton",
  FUL: "fulham",
  HUL: "hull",
  IPS: "ipswich",
  LEE: "leeds",
  LIV: "liverpool",
  MCI: "man-city",
  MUN: "man-united",
  NEW: "newcastle",
  NFO: "nottm-forest",
  SUN: "sunderland",
  TOT: "tottenham",
  WHU: "west-ham",
  WOL: "wolves",
};

export function teamSlug(teamShort: string): string {
  return TEAM_SLUGS[teamShort] ?? "slate-400";
}

export function teamColorVar(teamShort: string): string {
  return `var(--team-${teamSlug(teamShort)})`;
}
