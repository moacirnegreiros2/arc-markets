"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS } from "@/config/contracts";
import { FACTORY_ABI, MARKET_ABI } from "@/lib/abis";
import { arcTestnet } from "@/config/chains";

export type MarketInfo = {
  id: `0x${string}`;
  address: `0x${string}`;
  question: string;
  description: string;
  state: number;
  winningOutcome: number;
  tradingDeadline: bigint;
  resolutionDeadline: bigint;
  feeBps: bigint;
  poolYes: bigint;
  poolNo: bigint;
  yesTokenId: bigint;
  noTokenId: bigint;
  impliedYesProbabilityBps: bigint;
  resolutionSource: string;
};

export function useMarketIds() {
  return useReadContract({
    address: CONTRACTS.MarketFactory,
    abi: FACTORY_ABI,
    functionName: "getMarketIds",
    chainId: arcTestnet.id,
  });
}

export function useMarketAddress(marketId: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.MarketFactory,
    abi: FACTORY_ABI,
    functionName: "getMarketAddress",
    args: marketId ? [marketId] : undefined,
    query: { enabled: !!marketId },
    chainId: arcTestnet.id,
  });
}

export function useMarketData(address: `0x${string}` | undefined) {
  const contract = {
    address,
    abi: MARKET_ABI,
    chainId: arcTestnet.id,
  } as const;

  return useReadContracts({
    contracts: address
      ? [
          { ...contract, functionName: "question" },
          { ...contract, functionName: "description" },
          { ...contract, functionName: "state" },
          { ...contract, functionName: "winningOutcome" },
          { ...contract, functionName: "tradingDeadline" },
          { ...contract, functionName: "resolutionDeadline" },
          { ...contract, functionName: "feeBps" },
          { ...contract, functionName: "poolYes" },
          { ...contract, functionName: "poolNo" },
          { ...contract, functionName: "yesTokenId" },
          { ...contract, functionName: "noTokenId" },
          { ...contract, functionName: "impliedYesProbabilityBps" },
          { ...contract, functionName: "resolutionSource" },
          { ...contract, functionName: "marketId" },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
}

export function parseMarketData(
  id: `0x${string}`,
  address: `0x${string}`,
  results: ReturnType<typeof useMarketData>["data"]
): MarketInfo | null {
  if (!results || results.length < 13) return null;
  if (results.some((r) => r.status === "failure" || r.result === undefined)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = results as any[];
  return {
    id,
    address,
    question: r[0].result as string,
    description: r[1].result as string,
    state: r[2].result as number,
    winningOutcome: r[3].result as number,
    tradingDeadline: r[4].result as bigint,
    resolutionDeadline: r[5].result as bigint,
    feeBps: r[6].result as bigint,
    poolYes: r[7].result as bigint,
    poolNo: r[8].result as bigint,
    yesTokenId: r[9].result as bigint,
    noTokenId: r[10].result as bigint,
    impliedYesProbabilityBps: r[11].result as bigint,
    resolutionSource: r[12].result as string,
  };
}
