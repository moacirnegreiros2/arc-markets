// Auto-creates new markets from neutral, public data sources.
// Each "template" generates 0+ market specs each tick and tags them with a
// stable slug — we skip any template-slug whose question is already on-chain.

import { spotPriceUsd } from "./sources/coingecko";
import { latestClose } from "./sources/yahoo";

export type MarketSpec = {
  question: string;
  description: string;
  resolutionSource: string;
  tradingDeadline: bigint;   // unix seconds
  resolutionDeadline: bigint;
  feeBps: number;            // 200 = 2%
  initialLiquidityUsdc: bigint; // 6-decimal units
  // Stable identity of a market's "slot" — same slot means the same
  // (template, asset, target-date). Used to dedupe against on-chain markets
  // whose question strings differ only in the price-derived threshold.
  slotKey: string;
};

type Template = (now: Date) => Promise<MarketSpec[]>;

// Extract a slotKey-compatible signature from an existing on-chain question.
// If the question doesn't match any template pattern, returns null and the
// question falls back to exact-match dedup.
export function slotKeyFromQuestion(q: string): string | null {
  let m: RegExpMatchArray | null;
  // crypto4h intraday
  m = q.match(/^Will\s+(BTC|ETH|SOL)\s+be above\s+\$?[\d.]+k?\s+at\s+(\d{2}):(\d{2})\s+UTC\s+on\s+(\d{4}-\d{2}-\d{2})\?$/i);
  if (m) return `crypto4h|${m[1].toUpperCase()}|${m[4]}T${m[2]}:${m[3]}`;
  // cryptoDailyClose / cryptoWeekly / cryptoMonthly (all say "close above")
  m = q.match(/^Will\s+(BTC|ETH|SOL)\s+close above\s+\$?[\d.]+k?\s+on\s+(\d{4}-\d{2}-\d{2})\?$/i);
  if (m) return `cryptoClose|${m[1].toUpperCase()}|${m[2]}`;
  // etfDaily
  m = q.match(/^Will\s+(SPY|QQQ|DIA)\s+close above\s+\$?[\d.]+\s+on\s+(\d{4}-\d{2}-\d{2})\?$/i);
  if (m) return `etfDaily|${m[1].toUpperCase()}|${m[2]}`;
  // bigTechDaily (same shape as etfDaily but for individual tickers)
  m = q.match(/^Will\s+(NVDA|TSLA|COIN|MSTR)\s+close above\s+\$?[\d.]+\s+on\s+(\d{4}-\d{2}-\d{2})\?$/i);
  if (m) return `stockClose|${m[1].toUpperCase()}|${m[2]}`;
  // btcDominanceWeekly
  m = q.match(/^Will\s+Bitcoin\s+dominance\s+be\s+above\s+(\d+)%\s+on\s+(\d{4}-\d{2}-\d{2})\?$/i);
  if (m) return `btcDominance|${m[1]}|${m[2]}`;
  // hottestYearAnnual
  m = q.match(/^Will\s+(\d{4})\s+be\s+the\s+hottest\s+year\s+on\s+record\s+per\s+NASA\s+GISS\?$/i);
  if (m) return `hottestYear|${m[1]}`;
  return null;
}

// ---------- Helpers ----------

function endOfWeekUtc(now: Date): Date {
  // Next Sunday 23:59 UTC
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0..6
  const daysToSunday = (7 - dow) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysToSunday);
  d.setUTCHours(23, 59, 0, 0);
  return d;
}

function endOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59));
}

function roundUsd(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtHm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function fmtThreshold(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  if (n >= 10) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

function pickStep(price: number): number {
  if (price > 50000) return 1000;
  if (price > 1000) return 100;
  if (price > 100) return 5;
  if (price > 10) return 1;
  return 0.1;
}

// ---------- Templates ----------

// Weekly: spot+5% and spot-5% binaries for BTC, ETH, SOL by end of week.
const cryptoWeekly: Template = async (now) => {
  const out: MarketSpec[] = [];
  const eow = endOfWeekUtc(now);
  const tradingDeadline = BigInt(Math.floor(eow.getTime() / 1000));
  const resolutionDeadline = tradingDeadline + 86_400n; // +24h buffer

  for (const sym of ["BTC", "ETH", "SOL"]) {
    const price = await spotPriceUsd(sym);
    if (!price) continue;
    const isk = price > 1000;
    const step = isk ? Math.max(1000, Math.round(price * 0.01)) : price > 100 ? 5 : 1;
    const threshold = roundUsd(price * 1.05, step);
    const fmtT = isk ? `$${(threshold / 1000).toFixed(0)}k` : `$${threshold}`;
    out.push({
      question: `Will ${sym} close above ${fmtT} on ${fmtIso(eow)}?`,
      description: `Auto-generated weekly market. ${sym} spot price (USD) on major exchanges at 23:59 UTC on ${fmtIso(eow)}. Threshold = current spot rounded up to nearest meaningful tick (~+5%).`,
      resolutionSource: `CoinGecko ${sym}/USD daily close on ${fmtIso(eow)}`,
      tradingDeadline,
      resolutionDeadline,
      feeBps: 200,
      initialLiquidityUsdc: 200_000_000n, // 200 USDC
      slotKey: `cryptoClose|${sym}|${fmtIso(eow)}`,
    });
  }
  return out;
};

// Monthly: end-of-month BTC threshold (round number above current).
const cryptoMonthly: Template = async (now) => {
  const eom = endOfMonthUtc(now);
  const days = (eom.getTime() - now.getTime()) / 86_400_000;
  if (days < 7) return []; // skip if too close to month end
  const price = await spotPriceUsd("BTC");
  if (!price) return [];
  const threshold = roundUsd(price * 1.1, 5000); // +10% rounded to $5k
  const tradingDeadline = BigInt(Math.floor(eom.getTime() / 1000));
  return [
    {
      question: `Will BTC close above $${(threshold / 1000).toFixed(0)}k on ${fmtIso(eom)}?`,
      description: `Bitcoin (BTC) spot price on CoinGecko at the last UTC second of ${eom.toLocaleString("en-US", { month: "long", year: "numeric" })}.`,
      resolutionSource: `CoinGecko BTC/USD daily close on ${fmtIso(eom)}`,
      tradingDeadline,
      resolutionDeadline: tradingDeadline + 86_400n,
      feeBps: 200,
      initialLiquidityUsdc: 500_000_000n, // 500 USDC
      slotKey: `cryptoClose|BTC|${fmtIso(eom)}`,
    },
  ];
};

// Helpers for rolling schedules

function next4hSlots(now: Date, count: number): Date[] {
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const hoursSinceMidnight = (now.getTime() - utcMidnight) / 3600000;
  let firstSlotHours = Math.ceil(hoursSinceMidnight / 4) * 4;
  // Ensure at least 1h until expiry (otherwise too close to be useful)
  if (firstSlotHours * 3600000 + utcMidnight - now.getTime() < 3600000) {
    firstSlotHours += 4;
  }
  const slots: Date[] = [];
  for (let i = 0; i < count; i++) {
    slots.push(new Date(utcMidnight + (firstSlotHours + i * 4) * 3600000));
  }
  return slots;
}

function nextDailyEods(now: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < count + 1 && out.length < count; i++) {
    const d = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + i,
        23,
        59,
      ),
    );
    if (d.getTime() - now.getTime() < 3600000) continue;
    out.push(d);
  }
  return out;
}

function nextTradingDays(now: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; out.length < count && i < count + 7; i++) {
    const d = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + i,
        23,
        59,
      ),
    );
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (d.getTime() - now.getTime() < 3600000) continue;
    out.push(d);
  }
  return out;
}

// Rolling 4-hour BTC/ETH/SOL: only next slot, and only fires at hours
// divisible by 4 (00/04/08/12/16/20 UTC). Previously produced up to 6
// markets every hour — over months this inflated the resolved backlog to
// thousands with no meaningful liquidity. Now it targets ~3 markets every
// 4 hours = 18/day instead of ~72/day.
const crypto4h: Template = async (now) => {
  if (now.getUTCHours() % 4 !== 0) return [];
  const slots = next4hSlots(now, 1);
  const out: MarketSpec[] = [];
  const prices: Record<string, number | null> = {};
  for (const sym of ["BTC", "ETH", "SOL"]) {
    prices[sym] = await spotPriceUsd(sym);
  }
  for (const target of slots) {
    const tradingDeadline = BigInt(Math.floor(target.getTime() / 1000));
    const resolutionDeadline = tradingDeadline + 3600n;
    const dateIso = fmtIso(target);
    const timeIso = fmtHm(target);
    for (const sym of ["BTC", "ETH", "SOL"]) {
      const price = prices[sym];
      if (!price) continue;
      const threshold = roundUsd(price * 1.005, pickStep(price));
      out.push({
        question: `Will ${sym} be above ${fmtThreshold(threshold)} at ${timeIso} UTC on ${dateIso}?`,
        description: `Short-term ${sym}/USD market. Resolves via CoinGecko spot price closest to ${timeIso} UTC on ${dateIso}. Strike ~+0.5% above the spot at creation time.`,
        resolutionSource: `CoinGecko ${sym}/USD spot price at ${timeIso} UTC on ${dateIso}`,
        tradingDeadline,
        resolutionDeadline,
        feeBps: 200,
        initialLiquidityUsdc: 100_000_000n,
        slotKey: `crypto4h|${sym}|${dateIso}T${timeIso}`,
      });
    }
  }
  return out;
};

// Rolling daily-close crypto: today only (1 day).
const cryptoDailyClose: Template = async (now) => {
  const eods = nextDailyEods(now, 1);
  const out: MarketSpec[] = [];
  const prices: Record<string, number | null> = {};
  for (const sym of ["BTC", "ETH", "SOL"]) {
    prices[sym] = await spotPriceUsd(sym);
  }
  for (const eod of eods) {
    const tradingDeadline = BigInt(Math.floor(eod.getTime() / 1000));
    const resolutionDeadline = tradingDeadline + 3600n;
    const dateIso = fmtIso(eod);
    for (const sym of ["BTC", "ETH", "SOL"]) {
      const price = prices[sym];
      if (!price) continue;
      const threshold = roundUsd(price * 1.01, pickStep(price));
      out.push({
        question: `Will ${sym} close above ${fmtThreshold(threshold)} on ${dateIso}?`,
        description: `${sym}/USD daily close at 23:59 UTC on ${dateIso}. Strike ~+1% above spot at creation.`,
        resolutionSource: `CoinGecko ${sym}/USD daily close on ${dateIso}`,
        tradingDeadline,
        resolutionDeadline,
        feeBps: 200,
        initialLiquidityUsdc: 150_000_000n,
        slotKey: `cryptoClose|${sym}|${dateIso}`,
      });
    }
  }
  return out;
};

// Rolling US ETF close — next 1 trading day (skips weekends).
const etfDaily: Template = async (now) => {
  const days = nextTradingDays(now, 1);
  const out: MarketSpec[] = [];
  const closes: Record<string, number | null> = {};
  for (const ticker of ["SPY", "QQQ", "DIA"]) {
    const c = await latestClose(ticker);
    closes[ticker] = c?.close ?? null;
  }
  for (const day of days) {
    const tradingDeadline = BigInt(Math.floor(day.getTime() / 1000));
    const resolutionDeadline = tradingDeadline + 7200n;
    const dateIso = fmtIso(day);
    for (const ticker of ["SPY", "QQQ", "DIA"]) {
      const close = closes[ticker];
      if (!close) continue;
      const threshold = Math.round(close * 1.005 * 10) / 10;
      out.push({
        question: `Will ${ticker} close above $${threshold.toFixed(1)} on ${dateIso}?`,
        description: `${ticker} adjusted daily close on ${dateIso} per Yahoo Finance. Strike ~+0.5% above the latest close at creation time.`,
        resolutionSource: `Yahoo Finance ${ticker} daily close on ${dateIso}`,
        tradingDeadline,
        resolutionDeadline,
        feeBps: 200,
        initialLiquidityUsdc: 150_000_000n,
        slotKey: `etfDaily|${ticker}|${dateIso}`,
      });
    }
  }
  return out;
};

// Rolling big-tech close — next 1 trading day. Uses the existing stockClose
// resolver (Yahoo Finance) but broadens variety beyond ETFs.
const bigTechDaily: Template = async (now) => {
  const days = nextTradingDays(now, 1);
  const out: MarketSpec[] = [];
  const tickers = ["NVDA", "TSLA", "COIN", "MSTR"];
  const closes: Record<string, number | null> = {};
  for (const ticker of tickers) {
    const c = await latestClose(ticker);
    closes[ticker] = c?.close ?? null;
  }
  for (const day of days) {
    const tradingDeadline = BigInt(Math.floor(day.getTime() / 1000));
    const resolutionDeadline = tradingDeadline + 7200n;
    const dateIso = fmtIso(day);
    for (const ticker of tickers) {
      const close = closes[ticker];
      if (!close) continue;
      const threshold = Math.round(close * 1.005 * 10) / 10;
      out.push({
        question: `Will ${ticker} close above $${threshold.toFixed(1)} on ${dateIso}?`,
        description: `${ticker} adjusted daily close on ${dateIso} per Yahoo Finance. Strike ~+0.5% above the latest close at creation time.`,
        resolutionSource: `Yahoo Finance ${ticker} daily close on ${dateIso}`,
        tradingDeadline,
        resolutionDeadline,
        feeBps: 200,
        initialLiquidityUsdc: 100_000_000n,
        slotKey: `stockClose|${ticker}|${dateIso}`,
      });
    }
  }
  return out;
};

// Weekly BTC dominance — resolves via CoinGecko /global endpoint.
const btcDominanceWeekly: Template = async (now) => {
  const eow = endOfWeekUtc(now);
  const tradingDeadline = BigInt(Math.floor(eow.getTime() / 1000));
  const resolutionDeadline = tradingDeadline + 86_400n;
  // Two markets around a symbolic threshold that doesn't shift wildly.
  const thresholds = [50, 55];
  return thresholds.map((threshold) => ({
    question: `Will Bitcoin dominance be above ${threshold}% on ${fmtIso(eow)}?`,
    description: `BTC market-cap share of total crypto market on CoinGecko /global at 23:59 UTC on ${fmtIso(eow)}.`,
    resolutionSource: `CoinGecko /global BTC market-cap percentage on ${fmtIso(eow)}`,
    tradingDeadline,
    resolutionDeadline,
    feeBps: 200,
    initialLiquidityUsdc: 200_000_000n,
    slotKey: `btcDominance|${threshold}|${fmtIso(eow)}`,
  }));
};

// Annual climate marker — one market per current calendar year, resolves after
// year-end via NASA GISTEMP. Only creates once (dedup prevents repeat).
const hottestYearAnnual: Template = async (now) => {
  const year = now.getUTCFullYear();
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59));
  // Only start offering the market once we're past H1 so it's tradeable long
  // enough. Also resolution needs full-year data → ~3-month buffer.
  const monthsRemaining = (yearEnd.getTime() - now.getTime()) / (86_400_000 * 30);
  if (monthsRemaining < 1 || monthsRemaining > 8) return [];
  const tradingDeadline = BigInt(Math.floor(yearEnd.getTime() / 1000));
  const resolutionDeadline = tradingDeadline + 90n * 86_400n; // +90 days
  return [
    {
      question: `Will ${year} be the hottest year on record per NASA GISS?`,
      description: `Resolves YES if ${year} ranks #1 in the NASA GISTEMP global-mean annual anomaly ranking after year-end publication.`,
      resolutionSource: `NASA GISTEMP annual anomaly for ${year}`,
      tradingDeadline,
      resolutionDeadline,
      feeBps: 200,
      initialLiquidityUsdc: 300_000_000n,
      slotKey: `hottestYear|${year}`,
    },
  ];
};

const TEMPLATES: Template[] = [
  crypto4h,
  cryptoDailyClose,
  etfDaily,
  bigTechDaily,
  cryptoWeekly,
  cryptoMonthly,
  btcDominanceWeekly,
  hottestYearAnnual,
];

export async function planNewMarkets(
  now: Date,
  existingQuestions: Set<string>,
): Promise<MarketSpec[]> {
  const all = (await Promise.all(TEMPLATES.map((t) => t(now)))).flat();
  // Precompute occupied slotKeys from existing on-chain questions so that
  // e.g. "Will BTC close above $110k on 2026-07-20?" blocks a later spec of
  // "Will BTC close above $111k on 2026-07-20?" even though the questions
  // differ (only threshold shifts with spot price at creation time).
  const occupiedSlots = new Set<string>();
  for (const q of existingQuestions) {
    const key = slotKeyFromQuestion(q);
    if (key) occupiedSlots.add(key);
  }
  return all.filter(
    (s) => !existingQuestions.has(s.question) && !occupiedSlots.has(s.slotKey),
  );
}
