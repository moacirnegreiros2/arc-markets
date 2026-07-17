// Resolution engine — registry of pattern-matched resolvers.
//
// Each resolver inspects a market question and returns:
//   - { outcome: 0|1, reason, source }       when it can settle from public data
//   - { outcome: null, reason }               when the matcher fires but data isn't available
//   - null                                    when the resolver doesn't apply to this question
//
// We never silently guess. When in doubt, return outcome=null with a clear reason.

import {
  historicalPriceUsd,
  spotPriceUsd,
  priceTouchedAbove,
  priceAtUnix,
  btcDominanceFraction,
  resolveCoinId,
  largestMcapInCategory,
} from "./sources/coingecko";
import { fedRateMove, fredYoYAt } from "./sources/fred";
import { closeOnOrBefore, latestClose } from "./sources/yahoo";
import { rankOfYear } from "./sources/nasa";
import { maxTvlInWindow, currentChainTvl } from "./sources/defillama";
import {
  fifaWorldCupSemifinalist,
  soccerTournamentWinner,
  nbaFinalsWinner,
  f1SeasonChampion,
  wimbledonMensWinner,
  olympicsTopMedalCountry,
} from "./sources/espn";

export type ResolutionResult = {
  outcome: 0 | 1 | null; // 0 = YES, 1 = NO, null = needs manual
  reason: string;
  source?: string;
};

type Ctx = { now: Date };
type Resolver = (q: string, ctx: Ctx) => Promise<ResolutionResult | null>;

// ----- Helpers -----

function parseUsdAmount(s: string): number {
  const t = s.replace(/,/g, "").trim();
  const m = t.match(/^\$?([\d.]+)(k|K|m|M|b|B)?$/);
  if (!m) return parseFloat(t.replace(/[^\d.]/g, "")) || 0;
  const n = parseFloat(m[1]);
  const suffix = (m[2] ?? "").toLowerCase();
  return suffix === "k" ? n * 1e3 : suffix === "m" ? n * 1e6 : suffix === "b" ? n * 1e9 : n;
}

function parseFlexibleDate(s: string): Date | null {
  const t = s.trim();
  // Try direct ISO
  const iso = new Date(t);
  if (!isNaN(iso.getTime())) return iso;
  // dd/mm/yyyy
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const year = yyyy.length === 2 ? 2000 + parseInt(yyyy) : parseInt(yyyy);
    const d = new Date(Date.UTC(year, parseInt(mm) - 1, parseInt(dd)));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ===================== CRYPTO =====================

// "Will <SYMBOL> close above $<amount> on <date>?"
const cryptoClose: Resolver = async (q) => {
  const m = q.match(
    /will\s+([a-z]+)\s+close\s+above\s+\$?([\d.,]+\s*[kKmMbB]?)\s+on\s+([^?]+?)\?/i,
  );
  if (!m) return null;
  const [, sym, amtRaw, dateStr] = m;
  if (!resolveCoinId(sym)) return null;
  const threshold = parseUsdAmount(amtRaw.replace(/\s+/g, ""));
  const date = parseFlexibleDate(dateStr);
  if (!date) return { outcome: null, reason: `Could not parse date "${dateStr}"` };
  const price = await historicalPriceUsd(sym, date);
  if (price == null) {
    return {
      outcome: null,
      reason: `No CoinGecko historical price for ${sym} on ${date.toISOString().slice(0, 10)}`,
    };
  }
  return {
    outcome: price >= threshold ? 0 : 1,
    reason: `${sym.toUpperCase()} closed at $${price.toFixed(2)} on ${date.toISOString().slice(0, 10)}; threshold $${threshold.toFixed(0)}`,
    source: "CoinGecko",
  };
};

// "Will <SYM> be above $<amount> at HH:MM UTC on <date>?" (intraday / 4h markets)
const cryptoAtTime: Resolver = async (q) => {
  const m = q.match(
    /will\s+([a-z]+)\s+be\s+above\s+\$?([\d.,]+\s*[kKmMbB]?)\s+at\s+(\d{2}):(\d{2})\s+utc\s+on\s+([^?]+?)\?/i,
  );
  if (!m) return null;
  const [, sym, amtRaw, hhStr, mmStr, dateStr] = m;
  if (!resolveCoinId(sym)) return null;
  const threshold = parseUsdAmount(amtRaw.replace(/\s+/g, ""));
  const date = parseFlexibleDate(dateStr);
  if (!date) return { outcome: null, reason: `Bad date "${dateStr}"` };
  const targetMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    parseInt(hhStr),
    parseInt(mmStr),
  );
  const targetUnix = Math.floor(targetMs / 1000);
  const price = await priceAtUnix(sym, targetUnix);
  if (price == null) {
    return {
      outcome: null,
      reason: `CoinGecko price feed unavailable for ${sym} near ${hhStr}:${mmStr} UTC on ${date.toISOString().slice(0, 10)}`,
    };
  }
  return {
    outcome: price >= threshold ? 0 : 1,
    reason: `${sym.toUpperCase()} price at ${hhStr}:${mmStr} UTC on ${date.toISOString().slice(0, 10)}: $${price.toFixed(2)} vs threshold $${threshold.toFixed(2)}`,
    source: "CoinGecko market_chart",
  };
};

// "Will <SYMBOL> surpass $<amount> before <date>?"
const cryptoTouch: Resolver = async (q, ctx) => {
  const m = q.match(
    /will\s+([a-z]+)\s+surpass\s+\$?([\d.,]+)\s+before\s+([^?]+?)\?/i,
  );
  if (!m) return null;
  const [, sym, amtRaw, dateStr] = m;
  if (!resolveCoinId(sym)) return null;
  const threshold = parseUsdAmount(amtRaw);
  const date = parseFlexibleDate(dateStr);
  if (!date) return { outcome: null, reason: `Bad date "${dateStr}"` };
  const to = Math.floor(Math.min(date.getTime(), ctx.now.getTime()) / 1000);
  const from = to - 365 * 24 * 3600;
  const touched = await priceTouchedAbove(sym, threshold, from, to);
  if (touched == null) return { outcome: null, reason: "Price feed unavailable" };
  return {
    outcome: touched ? 0 : 1,
    reason: `${sym.toUpperCase()} ${touched ? "touched" : "never touched"} $${threshold} in the window`,
    source: "CoinGecko market_chart",
  };
};

// "Will Bitcoin dominance be above <N>% on <date>?"
const btcDominance: Resolver = async (q) => {
  const m = q.match(/bitcoin\s+dominance\s+be\s+above\s+(\d+(?:\.\d+)?)%\s+on\s+([^?]+)/i);
  if (!m) return null;
  const threshold = parseFloat(m[1]);
  const current = await btcDominanceFraction();
  if (current == null) return { outcome: null, reason: "Dominance unavailable" };
  return {
    outcome: current >= threshold ? 0 : 1,
    reason: `BTC dominance ${current.toFixed(2)}% vs threshold ${threshold}%`,
    source: "CoinGecko /global",
  };
};

// "Will any memecoin reach a $<N>B market cap before <date>?"
const memecoinMcap: Resolver = async (q) => {
  const m = q.match(/any\s+memecoin\s+reach\s+a\s+\$?([\d.]+)\s*([bB])?\s+market\s+cap/i);
  if (!m) return null;
  const threshold = parseUsdAmount(m[1] + (m[2] ?? "B"));
  const top = await largestMcapInCategory("meme-token");
  if (top == null) return { outcome: null, reason: "CoinGecko meme-token category unavailable" };
  return {
    outcome: top >= threshold ? 0 : 1,
    reason: `Top memecoin market cap currently $${(top / 1e9).toFixed(2)}B vs threshold $${(threshold / 1e9).toFixed(0)}B`,
    source: "CoinGecko categories",
  };
};

// ===================== MACRO (FRED) =====================

// "Will the Fed cut rates at the next FOMC meeting?"
const fedCutNext: Resolver = async (q) => {
  if (!/fed\s+cut\s+rates/i.test(q)) return null;
  const r = await fedRateMove(0.1);
  if (!r) return { outcome: null, reason: "FRED FEDFUNDS unavailable" };
  return {
    outcome: r.move === "cut" ? 0 : 1,
    reason: `Latest FEDFUNDS ${r.latest.toFixed(2)}% (${r.latestDate.toISOString().slice(0, 10)}) vs previous ${r.previous.toFixed(2)}% → ${r.move}`,
    source: "FRED FEDFUNDS",
  };
};

// "Will US CPI YoY be below <N>% for <quarter> <year>?" (and similar)
const cpiBelow: Resolver = async (q) => {
  const m = q.match(
    /us\s+cpi\s+(?:yoy\s+)?be\s+below\s+(\d+(?:\.\d+)?)\s*%\s+for\s+(?:q([1-4])\s+)?(\d{4})/i,
  );
  if (!m) return null;
  const threshold = parseFloat(m[1]);
  const quarter = m[2] ? parseInt(m[2]) : 4;
  const year = parseInt(m[3]);
  const month = quarter * 3; // last month of quarter
  const target = new Date(Date.UTC(year, month - 1, 28));
  const yoy = await fredYoYAt("CPIAUCNS", target);
  if (yoy == null) return { outcome: null, reason: "FRED CPIAUCNS not yet available for that quarter" };
  return {
    outcome: yoy < threshold ? 0 : 1,
    reason: `US CPI YoY at Q${quarter} ${year}: ${yoy.toFixed(2)}% vs threshold ${threshold}%`,
    source: "FRED CPIAUCNS",
  };
};

// ===================== STOCKS / INDICES (Yahoo) =====================

// "Will the Ibovespa close above <N> points on <date>?"
const ibovespaClose: Resolver = async (q) => {
  const m = q.match(/ibovespa\s+close\s+above\s+([\d,.]+)\s+points\s+on\s+([^?]+)/i);
  if (!m) return null;
  const threshold = parseFloat(m[1].replace(/,/g, ""));
  const date = parseFlexibleDate(m[2]);
  if (!date) return { outcome: null, reason: `Bad date "${m[2]}"` };
  const c = await closeOnOrBefore("^BVSP", date);
  if (!c) return { outcome: null, reason: "Yahoo Finance Ibovespa data unavailable" };
  return {
    outcome: c.close >= threshold ? 0 : 1,
    reason: `Ibovespa close ${c.close.toFixed(0)} on ${c.date.toISOString().slice(0, 10)} vs threshold ${threshold}`,
    source: "Yahoo Finance ^BVSP",
  };
};

// "Will Tesla deliver more than 2M vehicles in 2026?" — not auto-resolvable
// (Tesla doesn't publish deliveries via Yahoo). Leave for manual.

// Generic ticker close: "Will <TICKER> close above $<amount> on <date>?"
// Runs AFTER cryptoClose, so crypto symbols never reach here.
const STOCK_TICKERS = new Set([
  "SPY", "QQQ", "DIA", "IWM", "VOO", "VTI", "EFA", "EEM", "TLT", "HYG",
  "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE",
  "TSLA", "AAPL", "NVDA", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "AMD",
  "NFLX", "COIN", "MSTR", "INTC", "BA", "JPM", "V", "MA", "WMT", "DIS",
]);

const stockClose: Resolver = async (q) => {
  const m = q.match(
    /will\s+([A-Za-z][A-Za-z0-9.]{0,7})\s+close\s+above\s+\$?([\d.,]+)\s+on\s+([^?]+?)\?/i,
  );
  if (!m) return null;
  const sym = m[1].toUpperCase();
  if (resolveCoinId(sym)) return null; // crypto handled elsewhere
  if (!STOCK_TICKERS.has(sym)) return null; // not a known ticker
  const threshold = parseFloat(m[2].replace(/,/g, ""));
  const date = parseFlexibleDate(m[3]);
  if (!date) return { outcome: null, reason: `Bad date "${m[3]}"` };
  const c = await closeOnOrBefore(sym, date);
  if (!c) {
    return {
      outcome: null,
      reason: `Yahoo Finance has no ${sym} close on or before ${date.toISOString().slice(0, 10)}`,
    };
  }
  return {
    outcome: c.close >= threshold ? 0 : 1,
    reason: `${sym} close $${c.close.toFixed(2)} on ${c.date.toISOString().slice(0, 10)} vs threshold $${threshold.toFixed(2)}`,
    source: "Yahoo Finance",
  };
};

// ===================== CLIMATE (NASA) =====================

// "Will <YYYY> be the hottest year on record per NASA GISS?"
const hottestYear: Resolver = async (q) => {
  const m = q.match(/will\s+(\d{4})\s+be\s+the\s+hottest\s+year[^?]+nasa\s+giss/i);
  if (!m) return null;
  const year = parseInt(m[1]);
  const rank = await rankOfYear(year);
  if (rank == null) return { outcome: null, reason: `NASA GISTEMP has no annual mean for ${year} yet (year not complete)` };
  return {
    outcome: rank === 1 ? 0 : 1,
    reason: `${year} ranks #${rank} in NASA GISTEMP all-time`,
    source: "NASA GISTEMP",
  };
};

// ===================== L2 / TVL (DeFiLlama) =====================

// "Will <chain> reach $<N>B TVL before <date>?"
const chainTvlReach: Resolver = async (q) => {
  const m = q.match(
    /will\s+([a-z][a-z0-9-]+)\s+(?:reach|exceed)\s+\$?([\d.]+)\s*([bBmM])?\s+tvl\s+before\s+([^?]+)/i,
  );
  if (!m) return null;
  const [, chainRaw, amt, suffix, dateStr] = m;
  const threshold = parseUsdAmount(amt + (suffix ?? "B"));
  const date = parseFlexibleDate(dateStr);
  if (!date) return { outcome: null, reason: `Bad date "${dateStr}"` };
  const chain = chainRaw[0].toUpperCase() + chainRaw.slice(1);
  // Look from a year before through min(today, deadline)
  const now = new Date();
  const from = new Date(date.getTime() - 365 * 86400 * 1000);
  const to = date < now ? date : now;
  const peak = await maxTvlInWindow(chain, from, to);
  if (peak == null) {
    const cur = await currentChainTvl(chain);
    if (cur == null) return { outcome: null, reason: `DeFiLlama chain "${chain}" unknown` };
    return {
      outcome: cur >= threshold ? 0 : 1,
      reason: `Current ${chain} TVL $${(cur / 1e9).toFixed(2)}B vs $${(threshold / 1e9).toFixed(2)}B`,
      source: "DeFiLlama (current)",
    };
  }
  return {
    outcome: peak >= threshold ? 0 : 1,
    reason: `${chain} peak TVL in window: $${(peak / 1e9).toFixed(2)}B vs threshold $${(threshold / 1e9).toFixed(2)}B`,
    source: "DeFiLlama historical",
  };
};

// ===================== SPORTS (ESPN) =====================

// "Will Argentina win the 2026 FIFA World Cup?" — finds the year, the team
const wcWinner: Resolver = async (q) => {
  const m = q.match(/will\s+([\w\s]+?)\s+win\s+the\s+(\d{4})\s+fifa\s+world\s+cup\??/i);
  if (!m) return null;
  const [, team, yearStr] = m;
  const year = parseInt(yearStr);
  const winner = await soccerTournamentWinner("fifa.world", year);
  if (!winner) return { outcome: null, reason: `ESPN World Cup ${year} winner not yet known` };
  return {
    outcome: winner.trim().toLowerCase() === team.trim().toLowerCase() ? 0 : 1,
    reason: `World Cup ${year} winner per ESPN: ${winner}`,
    source: "ESPN",
  };
};

// "Will Brazil reach the semi-finals of the 2026 World Cup?"
const wcSemifinal: Resolver = async (q) => {
  const m = q.match(/will\s+([\w\s]+?)\s+reach\s+the\s+semi-?finals?\s+of\s+the\s+(\d{4})\s+world\s+cup/i);
  if (!m) return null;
  const [, team, yearStr] = m;
  const year = parseInt(yearStr);
  const made = await fifaWorldCupSemifinalist(year, team.trim());
  if (made == null) return { outcome: null, reason: `ESPN data for ${year} World Cup semifinals not available yet` };
  return {
    outcome: made ? 0 : 1,
    reason: `${team.trim()} ${made ? "appears" : "does not appear"} in ${year} World Cup semifinal entries`,
    source: "ESPN",
  };
};

// "Will Real Madrid win the 2025-26 UEFA Champions League?"
const uclWinner: Resolver = async (q) => {
  const m = q.match(/will\s+([\w\s]+?)\s+win\s+the\s+(\d{4})-(\d{2})\s+uefa\s+champions\s+league\??/i);
  if (!m) return null;
  const [, team, , yearEndStr] = m;
  const year = 2000 + parseInt(yearEndStr);
  const winner = await soccerTournamentWinner("uefa.champions", year);
  if (!winner) return { outcome: null, reason: `ESPN UCL ${year} winner not available yet` };
  return {
    outcome: winner.trim().toLowerCase() === team.trim().toLowerCase() ? 0 : 1,
    reason: `${year} UCL winner per ESPN: ${winner}`,
    source: "ESPN",
  };
};

// "Will the Lakers win the 2025-26 NBA Finals?"
const nbaFinals: Resolver = async (q) => {
  const m = q.match(/will\s+(?:the\s+)?([\w\s]+?)\s+win\s+the\s+(\d{4})-(\d{2})\s+nba\s+finals/i);
  if (!m) return null;
  const [, team, , yearEndStr] = m;
  const year = 2000 + parseInt(yearEndStr);
  const winner = await nbaFinalsWinner(year);
  if (!winner) return { outcome: null, reason: `ESPN NBA Finals ${year} winner not available yet` };
  return {
    outcome: winner.toLowerCase().includes(team.trim().toLowerCase()) ? 0 : 1,
    reason: `${year} NBA Finals winner per ESPN: ${winner}`,
    source: "ESPN",
  };
};

// "Will Max Verstappen win the 2026 F1 Drivers Championship?"
const f1Champ: Resolver = async (q) => {
  const m = q.match(/will\s+([\w\s]+?)\s+win\s+the\s+(\d{4})\s+f1\s+drivers/i);
  if (!m) return null;
  const [, driver, yearStr] = m;
  const champ = await f1SeasonChampion(parseInt(yearStr));
  if (!champ) return { outcome: null, reason: `ESPN F1 ${yearStr} standings not final yet` };
  return {
    outcome: champ.toLowerCase().includes(driver.trim().toLowerCase()) ? 0 : 1,
    reason: `${yearStr} F1 champion per ESPN: ${champ}`,
    source: "ESPN",
  };
};

// "Will Carlos Alcaraz win Wimbledon 2026 (mens singles)?"
const wimbledon: Resolver = async (q) => {
  const m = q.match(/will\s+([\w\s]+?)\s+win\s+wimbledon\s+(\d{4})/i);
  if (!m) return null;
  const [, player, yearStr] = m;
  const w = await wimbledonMensWinner(parseInt(yearStr));
  if (!w) return { outcome: null, reason: `Wimbledon ${yearStr} winner not yet known via ESPN` };
  return {
    outcome: w.toLowerCase().includes(player.trim().toLowerCase()) ? 0 : 1,
    reason: `Wimbledon ${yearStr} winner per ESPN: ${w}`,
    source: "ESPN",
  };
};

// "Will Norway top the medal table at Milano-Cortina 2026?"
const olympicsTop: Resolver = async (q) => {
  const m = q.match(/will\s+([\w\s]+?)\s+top\s+the\s+medal\s+table\s+at[^?]*?(\d{4})/i);
  if (!m) return null;
  const [, country, yearStr] = m;
  const top = await olympicsTopMedalCountry(parseInt(yearStr));
  if (!top) return { outcome: null, reason: `ESPN Olympics ${yearStr} medal table not available` };
  return {
    outcome: top.toLowerCase().includes(country.trim().toLowerCase()) ? 0 : 1,
    reason: `${yearStr} Olympics top medal country per ESPN: ${top}`,
    source: "ESPN",
  };
};

// ===================== REGISTRY =====================

const RESOLVERS: Resolver[] = [
  cryptoAtTime,        // 4h / intraday crypto (must match before cryptoClose)
  cryptoClose,
  cryptoTouch,
  btcDominance,
  memecoinMcap,
  stockClose,          // ETFs / individual stocks (Yahoo)
  fedCutNext,
  cpiBelow,
  ibovespaClose,
  hottestYear,
  chainTvlReach,
  wcWinner,
  wcSemifinal,
  uclWinner,
  nbaFinals,
  f1Champ,
  wimbledon,
  olympicsTop,
];

export async function resolveQuestion(question: string): Promise<ResolutionResult> {
  const ctx: Ctx = { now: new Date() };
  for (const r of RESOLVERS) {
    try {
      const out = await r(question, ctx);
      if (out !== null) return out;
    } catch (err) {
      // Resolver crashed — surface it, don't kill the whole pipeline
      return {
        outcome: null,
        reason: `Resolver error: ${(err as Error).message.split("\n")[0]}`,
      };
    }
  }
  return { outcome: null, reason: "No automated resolver matched this question" };
}
