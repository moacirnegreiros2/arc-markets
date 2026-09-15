import { NextResponse } from "next/server";
import { assertCronAuth, getAdminClient } from "@/lib/server/admin";
import { listAllMarkets, isPendingResolution } from "@/lib/server/markets";
import { resolveQuestion } from "@/lib/server/resolver";
import { ORACLE_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 minutes for cold-resolve passes

type LogEntry = {
  marketId: string;
  address: string;
  question: string;
  status: "resolved" | "manual" | "error";
  outcome?: 0 | 1;
  reason: string;
  txHash?: string;
};

export async function GET(req: Request) {
  try {
    return await handler(req);
  } catch (err) {
    const e = err as Error;
    return NextResponse.json(
      { error: e.message, stack: e.stack?.split("\n").slice(0, 5).join("\n") },
      { status: 500 },
    );
  }
}

async function handler(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 401 },
    );
  }

  const now = new Date();
  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: `getAdminClient: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  let markets;
  try {
    markets = await listAllMarkets();
  } catch (err) {
    // Full sweep is heavy; if RPC is unavailable, skip cleanly instead of
    // 500-ing and triggering an alert. Runs again next day.
    return NextResponse.json({
      checkedAt: now.toISOString(),
      skipped: true,
      reason: `market list read failed: ${(err as Error).message.split("\n")[0]}`,
    });
  }
  const pending = markets.filter((m) => isPendingResolution(m, now));
  const log: LogEntry[] = [];

  for (const m of pending) {
    try {
      const result = await resolveQuestion(m.question);
      if (result.outcome === null) {
        log.push({
          marketId: m.id,
          address: m.address,
          question: m.question,
          status: "manual",
          reason: result.reason,
        });
        continue;
      }
      // Send resolve tx through Oracle
      const hash = await admin.walletClient.writeContract({
        address: CONTRACTS.Oracle,
        abi: ORACLE_ABI,
        functionName: "resolve",
        args: [m.address, result.outcome],
      });
      log.push({
        marketId: m.id,
        address: m.address,
        question: m.question,
        status: "resolved",
        outcome: result.outcome,
        reason: result.reason,
        txHash: hash,
      });
    } catch (err) {
      log.push({
        marketId: m.id,
        address: m.address,
        question: m.question,
        status: "error",
        reason: (err as Error).message.split("\n")[0],
      });
    }
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    totalMarkets: markets.length,
    pending: pending.length,
    actions: log,
  });
}
