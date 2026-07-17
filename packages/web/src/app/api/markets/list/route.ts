// Server-side aggregated market list — replaces 80×9 per-card RPC reads
// with one multicall + edge cache.

import { NextResponse } from "next/server";
import { listAllMarkets, type MarketSummary } from "@/lib/server/markets";
import { slotKeyFromQuestion } from "@/lib/server/creator";

export const dynamic = "force-dynamic";
export const revalidate = 20;
export const maxDuration = 300;

// Markets whose real-world outcome is already decided but whose on-chain
// tradingDeadline hasn't passed yet (so Oracle.resolve still reverts with
// TradingDeadlineNotPassed). We hide them from the listing to avoid showing
// stale tradeable cards. The hourly /api/cron/tick will auto-resolve them
// as NO once the deadline naturally passes (ESPN confirms the actual winner).
function dedupBySlot(markets: MarketSummary[]): MarketSummary[] {
  const bySlot = new Map<string, MarketSummary>();
  const unslotted: MarketSummary[] = [];
  for (const m of markets) {
    const slot = slotKeyFromQuestion(m.question);
    if (!slot) {
      unslotted.push(m);
      continue;
    }
    const prev = bySlot.get(slot);
    if (!prev) {
      bySlot.set(slot, m);
      continue;
    }
    // Prefer resolved (state=2) over open; otherwise pick the deeper pool.
    const prevScore =
      (prev.state === 2 ? 1e30 : 0) + Number(prev.poolYes + prev.poolNo);
    const curScore =
      (m.state === 2 ? 1e30 : 0) + Number(m.poolYes + m.poolNo);
    if (curScore > prevScore) bySlot.set(slot, m);
  }
  return [...unslotted, ...bySlot.values()];
}

const HIDDEN_MARKET_IDS = new Set<string>([
  // Lakers — eliminated from 2025-26 NBA playoffs
  "0x3793e7c75f2a9dcad6508712112936d26291a2eceefe7e29c961645130f82cab",
  // Real Madrid — eliminated from 2025-26 UEFA Champions League
  "0x6deae5460bdea1860297334457b629be2818a0e30b33cce2ef7d57b0b02948f0",
]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    // Default: 300 most-recent. Full sweep is available via ?limit=all.
    const limit =
      limitParam === "all"
        ? undefined
        : Number.isFinite(parsed) && parsed > 0
          ? Math.min(parsed, 2000)
          : 300;
    const raw = (await listAllMarkets({ limit })).filter(
      (m) => !HIDDEN_MARKET_IDS.has(m.id.toLowerCase()),
    );
    // Historical dedup: the pre-fix creator generated multiple markets per
    // (template, asset, target-date) as spot price drifted. Collapse each
    // slotKey down to a canonical winner: resolved markets first (settled
    // truth), then the highest-liquidity one, then the earliest-added.
    const showDupes = url.searchParams.get("dupes") === "1";
    const markets = showDupes ? raw : dedupBySlot(raw);
    // Convert BigInts to strings + compute YES probability so the client
    // doesn't have to.
    const serialized = markets.map((m) => {
      const total = m.poolYes + m.poolNo;
      const impliedYesBps =
        total > 0n ? Number((m.poolNo * 10000n) / total) : 5000;
      return {
        id: m.id,
        address: m.address,
        question: m.question,
        description: m.description,
        resolutionSource: m.resolutionSource,
        tradingDeadline: m.tradingDeadline.toString(),
        resolutionDeadline: m.resolutionDeadline.toString(),
        state: m.state,
        winningOutcome: m.winningOutcome,
        poolYes: m.poolYes.toString(),
        poolNo: m.poolNo.toString(),
        impliedYesProbabilityBps: impliedYesBps,
      };
    });
    return NextResponse.json(
      { fetchedAt: new Date().toISOString(), count: serialized.length, markets: serialized },
      {
        headers: {
          "cache-control":
            "public, s-maxage=20, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
