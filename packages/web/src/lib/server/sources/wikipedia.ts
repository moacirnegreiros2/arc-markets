// Wikipedia REST + parse APIs — free, stable, no auth, high rate limit.
// ESPN's public site API started returning 403 in mid-2026, so this became
// the primary source for tournament outcomes. Each helper returns the
// canonical winner name (or null when the page doesn't exist yet, e.g. the
// event hasn't happened). Callers should compare with the market's team
// hint using loose substring matching.

const UA = "ArcMarkets/1.0 (https://arcmkt.vercel.app)";

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, {
    next: { revalidate: 21600 }, // 6h — winners don't change
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!r.ok) return null;
  return r.json();
}

// Pull the intro-paragraph "extract" of a page.
async function summary(page: string): Promise<string> {
  const j = (await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`,
  )) as { extract?: string } | null;
  return j?.extract ?? "";
}

// Pull the raw wikitext (all sections) for deeper regex extraction.
async function wikitext(page: string): Promise<string> {
  const j = (await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`,
  )) as { parse?: { wikitext?: string } } | null;
  return j?.parse?.wikitext ?? "";
}

// ---------- Soccer: World Cup & UEFA Champions League ----------

/**
 * Winner of the FIFA World Cup for a given year. Returns e.g. "Spain".
 */
export async function fifaWorldCupWinner(year: number): Promise<string | null> {
  const s = await summary(`${year}_FIFA_World_Cup`);
  // e.g. "...concluded on July 19 with Spain winning the championship..."
  const m = s.match(/with\s+([A-Z][A-Za-z ]+?)\s+winning\s+the\s+championship/);
  if (m) return m[1].trim();
  // Fallback: infobox in wikitext
  const wt = await wikitext(`${year}_FIFA_World_Cup`);
  const w = wt.match(/\|\s*champion\s*=\s*(?:\{\{[^}]*\|)?([A-Z][A-Za-z ]+?)\s*(?:\}\}|\|)/);
  return w?.[1]?.trim() ?? null;
}

/**
 * True if the team reached the semifinals of a given FIFA World Cup year.
 * We look for the phrase "Fourth place" and "Third place" in the infobox
 * plus "champion" + "runners-up" — those four are always semifinalists.
 */
export async function fifaWorldCupSemifinalist(
  year: number,
  team: string,
): Promise<boolean | null> {
  const wt = await wikitext(`${year}_FIFA_World_Cup`);
  if (!wt) return null;
  const targets = [
    /\|\s*champion\s*=\s*(?:\{\{[^}]*\|)?([A-Z][A-Za-z ]+)/i,
    /\|\s*second\s*=\s*(?:\{\{[^}]*\|)?([A-Z][A-Za-z ]+)/i,
    /\|\s*third\s*=\s*(?:\{\{[^}]*\|)?([A-Z][A-Za-z ]+)/i,
    /\|\s*fourth\s*=\s*(?:\{\{[^}]*\|)?([A-Z][A-Za-z ]+)/i,
  ];
  const teams: string[] = [];
  for (const pat of targets) {
    const m = wt.match(pat);
    if (m) teams.push(m[1].toLowerCase().trim());
  }
  if (teams.length === 0) return null;
  const t = team.toLowerCase().trim();
  return teams.some((x) => x.includes(t) || t.includes(x));
}

/**
 * Winner of the UEFA Champions League for a given final-year (e.g. 2026
 * for the 2025-26 season).
 */
export async function uclWinner(year: number): Promise<string | null> {
  const wt = await wikitext(`${year}_UEFA_Champions_League_final`);
  if (!wt) return null;
  // "'''Winners:''' Paris Saint-Germain" or infobox winner field
  const m1 = wt.match(/(?:winners?|champion)\s*[:=]\s*(?:\[\[)?([A-Z][A-Za-z .\-']+?)(?:\]\]|\s*\||\n)/i);
  if (m1) return m1[1].trim();
  // Sometimes stated as "X won" in intro
  const s = await summary(`${year}_UEFA_Champions_League_final`);
  const m2 = s.match(/([A-Z][A-Za-z .\-']+?)\s+won\s+the\s+final/);
  return m2?.[1]?.trim() ?? null;
}

// ---------- NBA Finals ----------

export async function nbaFinalsWinner(finalYear: number): Promise<string | null> {
  const s = await summary(`${finalYear}_NBA_Finals`);
  // "The best-of-seven series ended when the Eastern Conference champion
  //  New York Knicks defeated the Western Conference champion San Antonio Spurs"
  const m = s.match(
    /champion\s+([A-Z][A-Za-z .\-']+?)\s+defeated\s+the\s+(?:Western|Eastern)\s+Conference\s+champion/,
  );
  if (m) return m[1].trim();
  // Fallback: "X won the title"
  const m2 = s.match(/([A-Z][A-Za-z .\-']+?)\s+(?:won|winning)\s+the\s+(?:title|championship|series)/);
  return m2?.[1]?.trim() ?? null;
}

// ---------- Tennis: Wimbledon men's singles ----------

export async function wimbledonMensWinner(year: number): Promise<string | null> {
  const s = await summary(
    `${year}_Wimbledon_Championships_–_Men's_singles`,
  );
  // "Defending champion Jannik Sinner defeated Alexander Zverev in the final"
  const m = s.match(
    /([A-Z][A-Za-z .\-']+?)\s+defeated\s+[A-Z][A-Za-z .\-']+?\s+in\s+the\s+final/,
  );
  return m?.[1]?.replace(/^(defending\s+champion\s+|champion\s+)/i, "").trim() ?? null;
}

// ---------- F1 Drivers' Championship ----------

export async function f1SeasonChampion(year: number): Promise<string | null> {
  const s = await summary(`${year}_Formula_One_World_Championship`);
  const m = s.match(
    /([A-Z][A-Za-z .\-']+?)\s+(?:won|clinched|secured)\s+(?:the|his)\s+(?:\w+\s+)?(?:Drivers'\s+)?(?:championship|title)/i,
  );
  return m?.[1]?.trim() ?? null;
}

// ---------- Olympics medal table ----------

export async function olympicsTopMedalCountry(
  year: number,
  kind: "winter" | "summer" = "winter",
): Promise<string | null> {
  const wt = await wikitext(`${year}_${kind === "winter" ? "Winter" : "Summer"}_Olympics_medal_table`);
  if (!wt) return null;
  // The infobox has "award*_winner = {{flagIOC|NOR|...}}" for Most total /
  // Most gold medals. We take the "Most total medals" winner.
  const m = wt.match(
    /Most total medals[^=]{0,50}=\s*\{\{[^}]*?\|\s*([A-Z]{3})\s*\|/i,
  );
  if (!m) return null;
  const noc = m[1];
  // Convert IOC code to country name via a small table for the codes we
  // actually market on. Extend as needed.
  const NOC_TO_NAME: Record<string, string> = {
    NOR: "Norway", USA: "United States", CHN: "China", GER: "Germany",
    SWE: "Sweden", CAN: "Canada", FRA: "France", GBR: "United Kingdom",
    NED: "Netherlands", AUT: "Austria", ITA: "Italy", JPN: "Japan",
    KOR: "South Korea", SUI: "Switzerland", RUS: "Russia",
  };
  return NOC_TO_NAME[noc] ?? noc;
}
