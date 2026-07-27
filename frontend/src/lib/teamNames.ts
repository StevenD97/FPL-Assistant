// Team name generator: turns a favourite club or player name into a batch
// of FPL-style joke team names. Entirely template-based (no external calls) -
// generic templates work with any typed name, and a curated pun list per
// club kicks in when the input matches one of the league's 20 clubs.

const GENERIC_TEMPLATES: string[] = [
  "One {X}, There's Only One {X}",
  "{X} 'Til I Die",
  "In {X} We Trust",
  "The {X} Whisperer",
  "{P} Barmy Army",
  "Fear The {X}",
  "{X}mania",
  "Sir {X}'s XI",
  "{X} FC",
  "The Church Of {X}",
  "{X} Or Bust",
  "Life, Death And {X}",
  "{P} Merry Men",
  "Diamond {X}s",
  "{X} For Prime Minister",
  "The Unbearable Lightness Of {X}",
  "{X} Appreciation Society",
  "{P} Rejects",
  "Allez {X}",
  "{X} And Chill",
  "Sole Reliance On {X}",
  "{P} Ballad",
  "Viva {X}",
];

// Aliases -> curated puns. Covers the 20 clubs the app's fixtures/badges use.
const CLUB_PUNS: { aliases: string[]; puns: string[] }[] = [
  { aliases: ["arsenal", "gunners", "ars"], puns: ["Gunner Do Well", "In Arteta We Trust", "The Emirates State Of Mind", "Gunner Get These Reds"] },
  { aliases: ["aston villa", "villa", "villans", "avl"], puns: ["Ooh To Be A Villan", "Prince Of Villa Air", "Sub Zero Watkins", "Villa Rosa"] },
  { aliases: ["bournemouth", "cherries", "bou"], puns: ["Cherry Picked XI", "Bourne To Be Wild", "Life's A Cherry Bowl", "Cherry Bomb Squad"] },
  { aliases: ["brentford", "bees", "bre"], puns: ["The Beeeees Knees", "Sting Like A Bee", "Hive Mind XI", "Bee Movie Villain"] },
  { aliases: ["brighton", "seagulls", "bha"], puns: ["Seagulls Steal Your Chips", "Fly Like A Seagull", "Brighton And Hopeful", "Gully Gully"] },
  { aliases: ["chelsea", "blues", "che"], puns: ["Chelsea Boot Camp", "In Cole Blood", "Stamford Bridge Over Troubled Water", "Blue Is The Warmest Colour"] },
  { aliases: ["coventry", "sky blues", "cov"], puns: ["Keep On Coventrying", "Sky Blue Peter", "Ring Road Rovers", "Coventry Garden"] },
  { aliases: ["crystal palace", "palace", "eagles", "cry"], puns: ["Eagle Has Landed XI", "Palace Intrigue", "Selhurst Parkour", "Crystal Method"] },
  { aliases: ["everton", "toffees", "eve"], puns: ["Toffee Nosed XI", "Sticky Toffee Pudding FC", "Everton My Mind", "Toffee Or Not Toffee"] },
  { aliases: ["fulham", "cottagers", "ful"], puns: ["Cottage Industry", "Fulham Contact Sport", "Fulham Metal Jacket", "The Craven Cottage Cheese"] },
  { aliases: ["hull", "hull city", "tigers", "hul"], puns: ["Eye Of The Tiger XI", "Hull Yeah", "Hull Or High Water", "Tiger King's XI"] },
  { aliases: ["ipswich", "tractor boys", "ips"], puns: ["Tractor Boys Don't Cry", "Portman Roadkill", "Field Of Dreams XI", "Ipswich I Was Better At FPL"] },
  { aliases: ["leeds", "whites", "lee"], puns: ["Marching On Together (Slowly)", "Whites Do It Better", "Leeds Actually", "Elland Road To Nowhere"] },
  { aliases: ["liverpool", "reds", "kop", "liv"], puns: ["You'll Never Bank Alone", "Kopites Anonymous", "Anfield Of Dreams", "Allez Allez Allez-oop"] },
  { aliases: ["man city", "manchester city", "citizens", "cityzens", "mci"], puns: ["Cityzens Advice Bureau", "Sky Blue Machine", "Blue Moon Rising", "Etihad Or Die"] },
  { aliases: ["man utd", "manchester united", "man united", "red devils", "mun"], puns: ["Glory Glory Hallelujah", "Theatre Of Screams", "Ole's At The Wheel (Again)", "United We Fall"] },
  { aliases: ["newcastle", "magpies", "toon", "new"], puns: ["Howay The Lads", "Magpie Eye For A Bargain", "Toon Army Reserves", "Geordie Shaw-thing"] },
  { aliases: ["nottingham forest", "nott'm forest", "forest", "tricky trees", "nfo"], puns: ["Trent To The Bridge", "Tricky Trees Surgeons", "Forest Gump", "City Ground Zero"] },
  { aliases: ["sunderland", "black cats", "sun"], puns: ["Ha'way The Lads", "Black Cats Crossing", "Roker Roll", "Sunderland 'Til I Die (The Show)"] },
  { aliases: ["tottenham", "spurs", "tot"], puns: ["To Dare Is To Do (Eventually)", "Spursy Business", "COYS And Effect", "Spurred Into Action"] },
];

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function possessive(name: string): string {
  return name.toLowerCase().endsWith("s") ? `${name}'` : `${name}'s`;
}

function fillTemplate(template: string, name: string): string {
  return template.replaceAll("{X}", name).replaceAll("{P}", possessive(name));
}

function matchClub(input: string): string[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const hit = CLUB_PUNS.find((club) => club.aliases.some((alias) => q === alias || q.includes(alias) || alias.includes(q)));
  return hit ? hit.puns : [];
}

const FALLBACK_NAMES = [
  "Fantasy Football Feelings",
  "The Bench Warmers Union",
  "Wildcard And Chill",
  "Captain Obvious XI",
  "Differential Diagnosis",
  "The Rotation Nation",
  "Transfer Window Shopping",
  "Ctrl+Alt+Del The Defence",
];

export function generateTeamNames(input: string, count = 8): string[] {
  const name = input.trim();
  if (!name) return shuffled(FALLBACK_NAMES).slice(0, count);

  const clubPuns = matchClub(name);
  const generic = shuffled(GENERIC_TEMPLATES)
    .slice(0, count)
    .map((t) => fillTemplate(t, name));

  const combined = [...clubPuns, ...generic];
  const deduped = [...new Set(combined)];
  return shuffled(deduped).slice(0, count);
}
