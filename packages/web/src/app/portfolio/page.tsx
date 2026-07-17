"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useMarketIds, useMarketAddress, useMarketData, parseMarketData } from "@/hooks/useMarkets";
import { ERC1155_ABI, MARKET_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";
import { arcTestnet } from "@/config/chains";
import { formatUsdc, explorerTxUrl, MARKET_STATE, OUTCOME_LABEL } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

function MarketPosition({ id }: { id: `0x${string}` }) {
  const { address: user } = useAccount();
  const { data: addr } = useMarketAddress(id);
  const { data: results } = useMarketData(addr as `0x${string}` | undefined);
  const market = addr && results ? parseMarketData(id, addr as `0x${string}`, results) : null;
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: yesBalance } = useReadContract({
    address: CONTRACTS.OutcomeToken,
    abi: ERC1155_ABI,
    functionName: "balanceOf",
    args: user && market ? [user, market.yesTokenId] : undefined,
    query: { enabled: !!user && !!market },
    chainId: arcTestnet.id,
  });

  const { data: noBalance } = useReadContract({
    address: CONTRACTS.OutcomeToken,
    abi: ERC1155_ABI,
    functionName: "balanceOf",
    args: user && market ? [user, market.noTokenId] : undefined,
    query: { enabled: !!user && !!market },
    chainId: arcTestnet.id,
  });

  const { data: lpBalance } = useReadContract({
    address: addr as `0x${string}`,
    abi: MARKET_ABI,
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user && !!addr },
    chainId: arcTestnet.id,
  });

  if (!market) return null;

  const yb = (yesBalance ?? 0n) as bigint;
  const nb = (noBalance ?? 0n) as bigint;
  const lpb = (lpBalance ?? 0n) as bigint;

  if (yb === 0n && nb === 0n && lpb === 0n) return null;

  const handleRedeem = () => {
    writeContract(
      {
        address: market.address,
        abi: MARKET_ABI,
        functionName: "redeem",
        args: [],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) => {
          toast.success("Redeem tx sent", {
            action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank") },
          });
        },
        onError: (e) => toast.error(`Redeem failed: ${e.message}`),
      }
    );
  };

  const busy = isPending || isConfirming;
  const winTokenBalance =
    market.state === 2
      ? market.winningOutcome === 0
        ? yb
        : nb
      : 0n;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <Link
          href={`/market/${id}`}
          className="font-medium text-sm hover:text-blue-400 transition-colors line-clamp-2 flex-1"
        >
          {market.question}
        </Link>
        <span className={`text-xs px-2 py-0.5 rounded-full ml-2 shrink-0 ${
          market.state === 0 ? "bg-green-900/50 text-green-400"
          : market.state === 1 ? "bg-yellow-900/50 text-yellow-400"
          : "bg-blue-900/50 text-blue-400"
        }`}>
          {MARKET_STATE[market.state as 0|1|2]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {yb > 0n && (
          <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-2 text-center">
            <div className="text-green-400 font-medium">{formatUsdc(yb)}</div>
            <div className="text-zinc-500">YES tokens</div>
          </div>
        )}
        {nb > 0n && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-2 text-center">
            <div className="text-red-400 font-medium">{formatUsdc(nb)}</div>
            <div className="text-zinc-500">NO tokens</div>
          </div>
        )}
        {lpb > 0n && (
          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-2 text-center">
            <div className="text-blue-400 font-medium">{formatUsdc(lpb)}</div>
            <div className="text-zinc-500">LP shares</div>
          </div>
        )}
      </div>

      {market.state === 2 && winTokenBalance > 0n && (
        <button
          onClick={handleRedeem}
          disabled={busy}
          className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {busy ? "Confirming..." : `Redeem ${formatUsdc(winTokenBalance)} USDC`}
        </button>
      )}

      {market.state === 2 && winTokenBalance === 0n && (
        <p className="text-xs text-zinc-500 text-center">
          {OUTCOME_LABEL[market.winningOutcome as 0 | 1]} won — your tokens have no value
        </p>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const { address: user } = useAccount();
  const { data: ids } = useMarketIds();

  if (!user) {
    return (
      <div className="text-center py-24">
        <p className="text-4xl mb-4">👤</p>
        <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
        <p className="text-zinc-400">Connect to see your positions and P&L.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="text-zinc-400 mt-1">Your positions across all markets</p>
      </div>
      {!ids || ids.length === 0 ? (
        <p className="text-zinc-500">No markets to check — go trade!</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ids.map((id) => (
            <MarketPosition key={id} id={id} />
          ))}
        </div>
      )}
    </div>
  );
}
