// ESPN public site API (unofficial but stable and free).
// Useful endpoints:
//   /apis/site/v2/sports/soccer/{league}/scoreboard
//   /apis/site/v2/sports/basketball/nba/standings
//   /apis/site/v2/sports/racing/f1/standings
//   /apis/site/v2/sports/tennis/atp/scoreboard
//
// We focus on tournament-style queries: who won X.

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

type Json = Record<string, unknown>;
async function getJson(url: string): Promise<Json | null> {
  const r = await fetch(url, {
    next: { revalidate: 3600 },
    headers: { "user-agent": "Mozilla/5.0 ArcMarkets/1.0" },
  });
  if (!r.ok) return null;
  return (await r.json()) as Json;
}

/**
 * Did `teamName` win the most recent final of the given soccer competition slug?
 * ESPN uses slugs like:
 *   fifa.world          (FIFA World Cup)
 *   uefa.champions      (UEFA Champions League)
 *   conmebol.libertadores
 */
export async function soccerTournamentWinner(
  leagueSlug: string,
  year: number,
): Promise<string | null> {
  // ESPN's tournament endpoint with seasons
  const url = `${ESPN}/soccer/${leagueSlug}/seasons/${year}`;
  const j = await getJson(url);
  // The shape varies; we look for any field containing "winner" or "champion"
  const blob = JSON.stringify(j).toLowerCase();
  // Match a name like `"name":"Real Madrid"` near "champion"
  const m = blob.match(/"name":"([^"]{2,60})"[^}]{0,200}?"abbreviation"[^}]{0,200}?"champion/);
  if (m) return m[1];
  return null;
}

/**
 * Did `teamName` reach the semifinal of a FIFA World Cup year?
 * We scan the scoreboard endpoints around the tournament window
 * looking for the team in semifinal-round games.
 */
export async function fifaWorldCupSemifinalist(
  year: number,
  teamHint: string,
): Promise<boolean | null> {
  const url = `${ESPN}/soccer/fifa.world/scoreboard?dates=${year}`;
  const j = await getJson(url);
  if (!j) return null;
  const blob = JSON.stringify(j).toLowerCase();
  const team = teamHint.toLowerCase();
  // Heuristic: if the team appears in a "Semifinal" entry, return true.
  const idx = blob.indexOf("semifinal");
  if (idx === -1) return null;
  return blob.indexOf(team, idx) !== -1;
}

/**
 * NBA Finals winner for a given season-end year (e.g. 2026 for 2025-26 season).
 * Returns the team display name or null.
 */
export async function nbaFinalsWinner(seasonEndYear: number): Promise<string | null> {
  const url = `${ESPN}/basketball/nba/standings?season=${seasonEndYear}`;
  const j = await getJson(url);
  if (!j) return null;
  // Champion not in standings; try the scoreboard for the year's Finals games.
  const sb = await getJson(
    `${ESPN}/basketball/nba/scoreboard?dates=${seasonEndYear}06`,
  );
  if (!sb) return null;
  const blob = JSON.stringify(sb);
  // Look for "playoffType":"Finals" and the winning team
  const finals = blob.match(/"shortDetail":"Final[^"]*"[^}]{0,400}?"team":\{[^}]*?"displayName":"([^"]+)"[^}]*?"winner":true/);
  return finals?.[1] ?? null;
}

/** F1 season drivers' champion. */
export async function f1SeasonChampion(year: number): Promise<string | null> {
  const url = `${ESPN}/racing/f1/standings?season=${year}`;
  const j = await getJson(url);
  if (!j) return null;
  const blob = JSON.stringify(j);
  // Find the row marked as champion or position=1 at end of season
  const m = blob.match(/"position":1[^}]{0,400}?"athlete":\{[^}]*?"displayName":"([^"]+)"/);
  return m?.[1] ?? null;
}

/** Mens singles winner of a given Wimbledon year. */
export async function wimbledonMensWinner(year: number): Promise<string | null> {
  const url = `${ESPN}/tennis/atp/scoreboard?dates=${year}07&tournament=wimbledon`;
  const j = await getJson(url);
  if (!j) return null;
  const blob = JSON.stringify(j);
  // Final with a winner
  const m = blob.match(/"name":"Final"[^}]{0,800}?"athlete":\{[^}]*?"displayName":"([^"]+)"[^}]*?"winner":true/);
  return m?.[1] ?? null;
}

/** Top medal-count nation for the given Winter Olympics year (e.g. 2026 = Milano-Cortina). */
export async function olympicsTopMedalCountry(year: number): Promise<string | null> {
  // ESPN has olympics endpoint but coverage varies. Best-effort regex over JSON blob.
  const url = `${ESPN}/olympics/${year}-winter/standings`;
  const j = await getJson(url);
  if (!j) return null;
  const blob = JSON.stringify(j);
  const m = blob.match(/"position":1[^}]{0,200}?"name":"([^"]+)"/);
  return m?.[1] ?? null;
}
