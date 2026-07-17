import { NextResponse } from "next/server";
import { assertCronAuth, getAdminClient, publicClient } from "@/lib/server/admin";
import { listAllMarkets } from "@/lib/server/markets";
import { planNewMarkets } from "@/lib/server/creator";
import { FACTORY_ABI, MARKET_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";
import type { Address } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CreatedLog = {
  question: string;
  marketId?: string;
  address?: string;
  createTxHash?: string;
  liquidityTxHash?: string;
  error?: string;
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
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const now = new Date();
  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const existing = await listAllMarkets();
  const existingQuestions = new Set(existing.map((m) => m.question));

  const planned = await planNewMarkets(now, existingQuestions);
  const log: CreatedLog[] = [];

  for (const spec of planned) {
    try {
      // 1. createMarket
      const createHash = await admin.walletClient.writeContract({
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
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

      // Pull marketId/address from MarketCreated event
      // event MarketCreated(bytes32 indexed marketId, address indexed market, ...)
      const createdLog = receipt.logs.find(
        (l) => l.address.toLowerCase() === CONTRACTS.MarketFactory.toLowerCase(),
      );
      const marketId = createdLog?.topics[1] as `0x${string}` | undefined;
      const marketAddr = (("0x" + (createdLog?.topics[2] ?? "").slice(-40)) as Address) ||
        undefined;

      // 2. approve + wait + addLiquidity + wait
      let liquidityHash: `0x${string}` | undefined;
      if (marketAddr && /^0x[0-9a-fA-F]{40}$/.test(marketAddr)) {
        const approveHash = await admin.walletClient.writeContract({
          address: CONTRACTS.MockUSDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [marketAddr, spec.initialLiquidityUsdc],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        liquidityHash = await admin.walletClient.writeContract({
          address: marketAddr,
          abi: MARKET_ABI,
          functionName: "addLiquidity",
          args: [spec.initialLiquidityUsdc, 0n],
        });
        await publicClient.waitForTransactionReceipt({ hash: liquidityHash });
      } else {
        log.push({
          question: spec.question,
          createTxHash: createHash,
          error: `Could not decode market address from event log (got: ${marketAddr})`,
        });
        continue;
      }

      log.push({
        question: spec.question,
        marketId,
        address: marketAddr,
        createTxHash: createHash,
        liquidityTxHash: liquidityHash,
      });
    } catch (err) {
      log.push({
        question: spec.question,
        error: (err as Error).message.split("\n")[0],
      });
    }
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    existingMarkets: existing.length,
    planned: planned.length,
    created: log,
  });
}
