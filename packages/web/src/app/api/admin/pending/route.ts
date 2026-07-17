import { NextResponse } from "next/server";
import { listAllMarkets, isPendingResolution } from "@/lib/server/markets";
import { resolveQuestion } from "@/lib/server/resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeAll = url.searchParams.get("all") === "1";

  const now = new Date();
  const all = await listAllMarkets();
  const target = includeAll
    ? all.filter((m) => m.state !== 2)
    : all.filter((m) => isPendingResolution(m, now));

  // Sequentialize the resolver runs to avoid stampedes against external APIs.
  const enriched = [];
  for (const m of target) {
    let r;
    try {
      r = await resolveQuestion(m.question);
    } catch (err) {
      r = { outcome: null, reason: `Error: ${(err as Error).message.split("\n")[0]}` };
    }
    enriched.push({
      marketId: m.id,
      address: m.address,
      question: m.question,
      tradingDeadline: Number(m.tradingDeadline),
      resolutionDeadline: Number(m.resolutionDeadline),
      state: m.state,
      pending: isPendingResolution(m, now),
      canAutoResolve: r.outcome !== null,
      suggestedOutcome: r.outcome,
      reason: r.reason,
      source: r.source,
    });
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    totalMarkets: all.length,
    pending: enriched.filter((x) => x.pending).length,
    autoResolvable: enriched.filter((x) => x.canAutoResolve).length,
    items: enriched,
  });
}
