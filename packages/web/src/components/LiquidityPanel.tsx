"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { type MarketInfo } from "@/hooks/useMarkets";
import { MARKET_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";
import { parseUsdc, formatUsdc, explorerTxUrl } from "@/lib/utils";
import { arcTestnet } from "@/config/chains";

type Props = { market: MarketInfo };

export function LiquidityPanel({ market }: Props) {
  const { address: user } = useAccount();
  const [tab, setTab] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const amountBigInt = amount ? parseUsdc(amount) : 0n;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.MockUSDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: user ? [user, market.address] : undefined,
    query: { enabled: !!user },
    chainId: arcTestnet.id,
  });

  const { data: lpBalance } = useReadContract({
    address: market.address,
    abi: MARKET_ABI,
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user },
    chainId: arcTestnet.id,
  });

  const { data: totalLp } = useReadContract({
    address: market.address,
    abi: MARKET_ABI,
    functionName: "totalSupply",
    chainId: arcTestnet.id,
  });

  const needsApprove =
    tab === "add" && allowance !== undefined && allowance < amountBigInt;

  const busy = isPending || isConfirming;

  const handleApprove = () => {
    writeContract(
      {
        address: CONTRACTS.MockUSDC,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [market.address, BigInt(2) ** BigInt(256) - BigInt(1)],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) => {
          toast.success("Approve tx sent", {
            action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank") },
          });
          setTimeout(() => refetchAllowance(), 3000);
        },
        onError: (e) => toast.error(`Approve failed: ${e.message}`),
      }
    );
  };

  const handleAdd = () => {
    if (!amountBigInt) return;
    const minShares = (amountBigInt * 95n) / 100n;
    writeContract(
      {
        address: market.address,
        abi: MARKET_ABI,
        functionName: "addLiquidity",
        args: [amountBigInt, minShares],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) => {
          toast.success("Add liquidity tx sent", {
            action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank") },
          });
          setAmount("");
        },
        onError: (e) => toast.error(`Add liquidity failed: ${e.message}`),
      }
    );
  };

  const handleRemove = () => {
    if (!amountBigInt) return;
    writeContract(
      {
        address: market.address,
        abi: MARKET_ABI,
        functionName: "removeLiquidity",
        args: [amountBigInt],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) => {
          toast.success("Remove liquidity tx sent", {
            action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank") },
          });
          setAmount("");
        },
        onError: (e) => toast.error(`Remove failed: ${e.message}`),
      }
    );
  };

  const isOpen = market.state === 0;

  return (
    <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border-1)] flex items-center justify-between">
        <span className="text-sm font-medium">Liquidity</span>
        {user && lpBalance !== undefined && totalLp !== undefined && (totalLp as bigint) > 0n && (
          <span className="text-[11px] text-[var(--color-text-muted)] mono">
            Your share:{" "}
            {(lpBalance as bigint) > 0n
              ? ((Number(lpBalance as bigint) / Number(totalLp as bigint)) * 100).toFixed(2)
              : "0.00"}
            %
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {(["add", "remove"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-1.5 rounded-md capitalize transition-colors ${
                tab === t
                  ? "bg-[var(--color-bg-3)] text-[var(--color-text-primary)]"
                  : "bg-[var(--color-bg-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="rounded-lg bg-[var(--color-bg-2)] border border-[var(--color-border-1)] focus-within:border-[var(--color-accent)]/50 transition-colors">
          <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-[var(--color-text-muted)]">
            <span>{tab === "add" ? "Deposit" : "Burn"}</span>
            {user && lpBalance !== undefined && tab === "remove" && (
              <button
                onClick={() => setAmount(formatUsdc(lpBalance as bigint).replace(/,/g, ""))}
                className="hover:text-[var(--color-accent)]"
                type="button"
              >
                Bal: <span className="mono">{formatUsdc(lpBalance as bigint)}</span>
              </button>
            )}
          </div>
          <div className="flex items-center px-3 pb-3 pt-1 gap-2">
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent mono tabular-nums text-lg outline-none placeholder:text-[var(--color-text-muted)]/50"
            />
            <span className="text-xs text-[var(--color-text-secondary)] mono">
              {tab === "add" ? "USDC" : "LP"}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
          {tab === "add"
            ? `Deposits add equal YES+NO tokens to the pool. Earns ${Number(market.feeBps) / 100}% of every trade.`
            : "Burning LP shares returns proportional YES+NO tokens you can then trade or hold."}
        </p>

        {!user ? (
          <div className="text-xs text-center text-[var(--color-text-muted)] py-1">
            Connect a wallet to manage liquidity
          </div>
        ) : !isOpen ? (
          <button
            disabled
            className="w-full py-2 rounded-md bg-[var(--color-bg-3)] text-[var(--color-text-muted)] text-sm font-medium cursor-not-allowed"
          >
            Market closed
          </button>
        ) : needsApprove ? (
          <button
            onClick={handleApprove}
            disabled={busy}
            className="w-full py-2 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[var(--color-bg-0)] text-sm font-semibold"
          >
            {busy ? "Approving…" : "Approve USDC"}
          </button>
        ) : (
          <button
            onClick={tab === "add" ? handleAdd : handleRemove}
            disabled={busy || !amount || amountBigInt === 0n}
            className="w-full py-2 rounded-md bg-[var(--color-bg-3)] hover:bg-[var(--color-bg-4)] border border-[var(--color-border-2)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-text-primary)] text-sm font-medium transition-colors"
          >
            {busy
              ? "Confirming…"
              : tab === "add"
                ? "Add liquidity"
                : "Remove liquidity"}
          </button>
        )}
      </div>
    </div>
  );
}
