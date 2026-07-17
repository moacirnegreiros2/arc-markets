// Combined tick: resolve expired markets, then create new rolling markets.
// One endpoint = one Vercel cron slot — but we can have two daily fires
// (e.g. 00:00 and 12:00 UTC) by pointing two crons to the same path.

import { NextResponse } from "next/server";
import { assertCronAuth, getAdminClient, publicClient } from "@/lib/server/admin";
import { listAllMarkets, isPendingResolution } from "@/lib/server/markets";
import { resolveQuestion } from "@/lib/server/resolver";
import { planNewMarkets } from "@/lib/server/creator";
import { FACTORY_ABI, MARKET_ABI, ORACLE_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";
import type { Address } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry only on transient RPC errors — permanent errors (bad args, revert)
// fail fast so the tick doesn't burn its 300s budget on hopeless retries.
function isTransient(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return (
    msg.includes("request limit reached") ||
    msg.includes("RPC Request failed") ||
    msg.includes("timeout") ||
    msg.includes("ECONNRESET")
  );
}
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === tries - 1) throw err;
      await sleep(400 * (i + 1)); // 400, 800 ms
    }
  }
  throw lastErr;
}

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

type ResolveLog = {
  question: string;
  status: "resolved" | "manual" | "error";
  outcome?: 0 | 1;
  reason: string;
  txHash?: string;
};
type CreateLog = {
  question: string;
  marketId?: string;
  address?: string;
  createTxHash?: string;
  liquidityTxHash?: string;
  error?: string;
};

async function handler(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const now = new Date();
  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // --- 1. Resolve pass ---
  // Sweep the most-recent 800 markets. Resolved markets accumulate but the
  // pool of *pending* ones lives entirely in the recent tail (templates only
  // create near-term markets), so the rest is safe to skip per run.
  const TICK_WINDOW = 800;
  const allBefore = await listAllMarkets({ limit: TICK_WINDOW });
  const pending = allBefore.filter((m) => isPendingResolution(m, now));
  const resolveLog: ResolveLog[] = [];
  for (const m of pending) {
    try {
      const result = await resolveQuestion(m.question);
      if (result.outcome === null) {
        resolveLog.push({ question: m.question, status: "manual", reason: result.reason });
        continue;
      }
      const hash = await withRetry(() =>
        admin.walletClient.writeContract({
          address: CONTRACTS.Oracle,
          abi: ORACLE_ABI,
          functionName: "resolve",
          args: [m.address, result.outcome as 0 | 1],
        }),
      );
      resolveLog.push({
        question: m.question,
        status: "resolved",
        outcome: result.outcome,
        reason: result.reason,
        txHash: hash,
      });
    } catch (err) {
      resolveLog.push({
        question: m.question,
        status: "error",
        reason: (err as Error).message.split("\n")[0],
      });
    }
  }

  // --- 2. Create pass (dedup against current on-chain questions) ---
  // Templates only produce markets for near-term dates, so we only need
  // recent existing markets for dedup. Cheaper than re-reading everything.
  const allAfterResolve = await listAllMarkets({ limit: TICK_WINDOW });
  const existing = new Set(allAfterResolve.map((m) => m.question));
  const planned = await planNewMarkets(now, existing);

  const createLog: CreateLog[] = [];
  for (const spec of planned) {
    try {
      const createHash = await withRetry(() =>
        admin.walletClient.writeContract({
          address: CONTRACTS.MarketFactory,
          abi: FACTORY_ABI,
          functionName: "createMarket",
          args: [
            spec.question,
            spec.description,
            spec.resolutionSource,
            spec.tradingDeadline,
            spec.resolutionDeadline,
            BigInt(spec.feeBps),
          ],
        }),
      );
      const receipt = await withRetry(() =>
        publicClient.waitForTransactionReceipt({ hash: createHash }),
      );
      const createdLog = receipt.logs.find(
        (l) => l.address.toLowerCase() === CONTRACTS.MarketFactory.toLowerCase(),
      );
      const marketId = createdLog?.topics[1] as `0x${string}` | undefined;
      const marketAddr = (("0x" + (createdLog?.topics[2] ?? "").slice(-40)) as Address);

      let liquidityHash: `0x${string}` | undefined;
      if (/^0x[0-9a-fA-F]{40}$/.test(marketAddr)) {
        const approveHash = await withRetry(() =>
          admin.walletClient.writeContract({
            address: CONTRACTS.MockUSDC,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [marketAddr, spec.initialLiquidityUsdc],
          }),
        );
        await withRetry(() => publicClient.waitForTransactionReceipt({ hash: approveHash }));
        liquidityHash = await withRetry(() =>
          admin.walletClient.writeContract({
            address: marketAddr,
            abi: MARKET_ABI,
            functionName: "addLiquidity",
            args: [spec.initialLiquidityUsdc, 0n],
          }),
        );
        await withRetry(() => publicClient.waitForTransactionReceipt({ hash: liquidityHash! }));
      }

      createLog.push({
        question: spec.question,
        marketId,
        address: marketAddr,
        createTxHash: createHash,
        liquidityTxHash: liquidityHash,
      });
    } catch (err) {
      createLog.push({ question: spec.question, error: (err as Error).message.split("\n")[0] });
    }
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    totalBefore: allBefore.length,
    resolved: resolveLog.filter((x) => x.status === "resolved").length,
    pendingManual: resolveLog.filter((x) => x.status === "manual").length,
    errors: resolveLog.filter((x) => x.status === "error").length,
    created: createLog.filter((x) => !x.error).length,
    failed: createLog.filter((x) => x.error).length,
    resolveLog,
    createLog,
  });
}
