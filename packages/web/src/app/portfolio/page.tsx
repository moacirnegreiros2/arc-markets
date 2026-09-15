"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodePacked, keccak256 } from "viem";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ERC1155_ABI, MARKET_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";
import { arcTestnet } from "@/config/chains";
import {
  formatUsdc,
  explorerTxUrl,
  MARKET_STATE,
  OUTCOME_LABEL,
} from "@/lib/utils";

/*
 * Portfolio v2 — one HTTP fetch + one balanceOfBatch RPC instead of
 * 3 × N reads per market. On testnet where N is now >3000, the old
 * approach hit the RPC's rate limit before any position could render.
 *
 * Steps:
 *  1. Load the whole market list from /api/markets/list?limit=all.
 *  2. Compute yesTokenId & noTokenId for every market client-side
 *     (they are keccak256(abi.encodePacked(marketId, outcomeIndex))).
 *  3. One balanceOfBatch call fetches all YES + NO balances at once.
 *  4. LP balances come through a multicall against each Market.balanceOf.
 *  5. Filter to markets where the user actually has something.
 */

type ApiMarket = {
  id: `0x${string}`;
  address: `0x${string}`;
  question: string;
  tradingDeadline: string;
  resolutionDeadline: string;
  state: number;
  winningOutcome: number;
  poolYes: string;
  poolNo: string;
};

type Position = {
  id: `0x${string}`;
  address: `0x${string}`;
  question: string;
  state: number;
  winningOutcome: number;
  yesBalance: bigint;
  noBalance: bigint;
  lpBalance: bigint;
};

function outcomeTokenId(marketId: `0x${string}`, outcome: 0 | 1): bigint {
  return BigInt(keccak256(encodePacked(["bytes32", "uint8"], [marketId, outcome])));
}

function useAllMarkets() {
  return useQuery<{ markets: ApiMarket[] }>({
    queryKey: ["markets", "list", "all"],
    queryFn: async () => {
      const r = await fetch("/api/markets/list?limit=all", { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load markets");
      return r.json();
    },
    // Full sweep is expensive on the server; keep cache generous.
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

function PositionCard({
  position,
}: {
  position: Position;
}) {
  const {
    writeContract,
    data: txHash,
    isPending,
  } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const handleRedeem = () => {
    writeContract(
      {
        address: position.address,
        abi: MARKET_ABI,
        functionName: "redeem",
        args: [],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) => {
          toast.success("Redeem tx sent", {
            action: {
              label: "View",
              onClick: () => window.open(explorerTxUrl(hash), "_blank"),
            },
          });
        },
        onError: (e) => toast.error(`Redeem failed: ${e.message}`),
      },
    );
  };

  const busy = isPending || isConfirming;
  const winTokenBalance =
    position.state === 2
      ? position.winningOutcome === 0
        ? position.yesBalance
        : position.noBalance
      : 0n;

  return (
    <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)]/80 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/market/${position.id}`}
          className="font-medium text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors line-clamp-2 flex-1"
        >
          {position.question}
        </Link>
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
            position.state === 0
              ? "bg-[var(--color-yes-bg)] text-[var(--color-yes)]"
              : position.state === 1
                ? "bg-[var(--color-bg-3)] text-[var(--color-warm)]"
                : "bg-[var(--color-bg-3)] text-[var(--color-accent)]"
          }`}
        >
          {MARKET_STATE[position.state as 0 | 1 | 2]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {position.yesBalance > 0n && (
          <div className="rounded-lg border border-[var(--color-yes-border)] bg-[var(--color-yes-bg)] p-2 text-center">
            <div className="text-[var(--color-yes)] font-medium mono tabular-nums">
              {formatUsdc(position.yesBalance)}
            </div>
            <div className="text-[var(--color-text-muted)]">YES</div>
          </div>
        )}
        {position.noBalance > 0n && (
          <div className="rounded-lg border border-[var(--color-no-border)] bg-[var(--color-no-bg)] p-2 text-center">
            <div className="text-[var(--color-no)] font-medium mono tabular-nums">
              {formatUsdc(position.noBalance)}
            </div>
            <div className="text-[var(--color-text-muted)]">NO</div>
          </div>
        )}
        {position.lpBalance > 0n && (
          <div className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-2 text-center">
            <div className="text-[var(--color-accent)] font-medium mono tabular-nums">
              {formatUsdc(position.lpBalance)}
            </div>
            <div className="text-[var(--color-text-muted)]">LP</div>
          </div>
        )}
      </div>

      {position.state === 2 && winTokenBalance > 0n && (
        <button
          onClick={handleRedeem}
          disabled={busy}
          className="w-full py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-[var(--color-bg-0)] hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {busy ? "Confirming..." : `Redeem ${formatUsdc(winTokenBalance)} USDC`}
        </button>
      )}

      {position.state === 2 && winTokenBalance === 0n && (
        <p className="text-xs text-[var(--color-text-muted)] text-center">
          {OUTCOME_LABEL[position.winningOutcome as 0 | 1]} won — your tokens have no value
        </p>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const { address: user } = useAccount();
  const { data: apiData, isLoading: loadingMarkets } = useAllMarkets();
  const markets = apiData?.markets ?? [];

  // Pre-compute all token IDs (2 per market).
  const { addresses, tokenIds, users } = useMemo(() => {
    const tokenIds: bigint[] = [];
    const addresses: `0x${string}`[] = [];
    for (const m of markets) {
      addresses.push(m.address);
      tokenIds.push(outcomeTokenId(m.id, 0));
      tokenIds.push(outcomeTokenId(m.id, 1));
    }
    const users = user ? tokenIds.map(() => user) : [];
    return { addresses, tokenIds, users };
  }, [markets, user]);

  // 1 RPC for every outcome-token balance at once.
  const { data: batchBalances, isLoading: loadingBalances } = useReadContract({
    address: CONTRACTS.OutcomeToken,
    abi: ERC1155_ABI,
    functionName: "balanceOfBatch",
    args: user ? [users, tokenIds] : undefined,
    query: { enabled: !!user && tokenIds.length > 0 },
    chainId: arcTestnet.id,
  }) as { data: bigint[] | undefined; isLoading: boolean };

  // Multicall the LP balance for each market address in one shot.
  const { data: lpBalances, isLoading: loadingLp } = useReadContracts({
    contracts: user
      ? addresses.map((addr) => ({
          address: addr,
          abi: MARKET_ABI,
          functionName: "balanceOf",
          args: [user],
          chainId: arcTestnet.id,
        }))
      : [],
    query: { enabled: !!user && addresses.length > 0 },
  });

  const positions: Position[] = useMemo(() => {
    if (!user || !batchBalances) return [];
    const out: Position[] = [];
    for (let i = 0; i < markets.length; i++) {
      const yes = batchBalances[i * 2] ?? 0n;
      const no = batchBalances[i * 2 + 1] ?? 0n;
      const lpResult = lpBalances?.[i];
      const lp =
        (lpResult && lpResult.status === "success" ? (lpResult.result as bigint) : 0n) ?? 0n;
      if (yes === 0n && no === 0n && lp === 0n) continue;
      out.push({
        id: markets[i].id,
        address: markets[i].address,
        question: markets[i].question,
        state: markets[i].state,
        winningOutcome: markets[i].winningOutcome,
        yesBalance: yes,
        noBalance: no,
        lpBalance: lp,
      });
    }
    // Open first, then closed, then resolved.
    out.sort((a, b) => a.state - b.state);
    return out;
  }, [batchBalances, lpBalances, markets, user]);

  if (!user) {
    return (
      <div className="text-center py-24">
        <p className="text-4xl mb-4">👤</p>
        <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
        <p className="text-[var(--color-text-secondary)]">
          Connect to see your positions and P&amp;L.
        </p>
      </div>
    );
  }

  const loading = loadingMarkets || loadingBalances || loadingLp;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Your positions across all markets ({markets.length} scanned).
        </p>
      </div>

      {loading && positions.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] animate-pulse"
            />
          ))}
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-24 rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)]">
          <p className="text-3xl mb-3">🪙</p>
          <p className="text-[var(--color-text-secondary)]">
            No positions yet — head to <Link href="/" className="text-[var(--color-accent)] hover:underline">the markets</Link> and place a trade.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {positions.map((p) => (
            <PositionCard key={p.id} position={p} />
          ))}
        </div>
      )}
    </div>
  );
}
