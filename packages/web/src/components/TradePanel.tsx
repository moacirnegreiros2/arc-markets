"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { toast } from "sonner";
import { type MarketInfo } from "@/hooks/useMarkets";
import { MARKET_ABI, ERC20_ABI, ERC1155_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";
import { parseUsdc, formatUsdc, explorerTxUrl } from "@/lib/utils";
import { arcTestnet } from "@/config/chains";

type Props = { market: MarketInfo };
type Side = "buy" | "sell";
type Outcome = 0 | 1;

const SLIPPAGE_PRESETS = [50, 100, 200]; // bps

export function TradePanel({ market }: Props) {
  const { address: user } = useAccount();
  const [side, setSide] = useState<Side>("buy");
  const [outcome, setOutcome] = useState<Outcome>(0);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const busy = isPending || isConfirming;

  const amountBigInt = amount ? parseUsdc(amount) : 0n;
  const isOpen = market.state === 0;

  // Allowances / balances
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.MockUSDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: user ? [user, market.address] : undefined,
    query: { enabled: !!user },
    chainId: arcTestnet.id,
  });

  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: CONTRACTS.OutcomeToken,
    abi: ERC1155_ABI,
    functionName: "isApprovedForAll",
    args: user ? [user, market.address] : undefined,
    query: { enabled: !!user },
    chainId: arcTestnet.id,
  });

  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.MockUSDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user },
    chainId: arcTestnet.id,
  });

  const { data: yesBalance } = useReadContract({
    address: CONTRACTS.OutcomeToken,
    abi: ERC1155_ABI,
    functionName: "balanceOf",
    args: user ? [user, market.yesTokenId] : undefined,
    query: { enabled: !!user },
    chainId: arcTestnet.id,
  });
  const { data: noBalance } = useReadContract({
    address: CONTRACTS.OutcomeToken,
    abi: ERC1155_ABI,
    functionName: "balanceOf",
    args: user ? [user, market.noTokenId] : undefined,
    query: { enabled: !!user },
    chainId: arcTestnet.id,
  });

  // Previews
  const { data: buyPreview } = useReadContract({
    address: market.address,
    abi: MARKET_ABI,
    functionName: "previewBuy",
    args: amountBigInt > 0n ? [outcome, amountBigInt] : undefined,
    query: { enabled: side === "buy" && amountBigInt > 0n },
    chainId: arcTestnet.id,
  });

  const { data: sellPreview } = useReadContract({
    address: market.address,
    abi: MARKET_ABI,
    functionName: "previewSell",
    args: amountBigInt > 0n ? [outcome, amountBigInt] : undefined,
    query: { enabled: side === "sell" && amountBigInt > 0n },
    chainId: arcTestnet.id,
  });

  const yesPct = Number(market.impliedYesProbabilityBps) / 100;
  const priceFor = (o: Outcome) => (o === 0 ? yesPct : 100 - yesPct);

  const needsApproveUsdc =
    side === "buy" &&
    user &&
    allowance !== undefined &&
    (allowance as bigint) < amountBigInt;
  const needsApproveERC1155 = side === "sell" && user && !isApproved;

  const sideToast = (txt: string, hash: `0x${string}`) =>
    toast.success(txt, {
      action: {
        label: "View",
        onClick: () => window.open(explorerTxUrl(hash), "_blank"),
      },
    });

  const handleApproveUSDC = () =>
    writeContract(
      {
        address: CONTRACTS.MockUSDC,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [market.address, BigInt(2) ** 256n - 1n],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (h) => {
          sideToast("Approval submitted", h);
          setTimeout(refetchAllowance, 3000);
        },
        onError: (e) => toast.error(e.message.split("\n")[0]),
      },
    );

  const handleApproveERC1155 = () =>
    writeContract(
      {
        address: CONTRACTS.OutcomeToken,
        abi: ERC1155_ABI,
        functionName: "setApprovalForAll",
        args: [market.address, true],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (h) => {
          sideToast("Approval submitted", h);
          setTimeout(refetchApproval, 3000);
        },
        onError: (e) => toast.error(e.message.split("\n")[0]),
      },
    );

  const handleBuy = () => {
    if (!amountBigInt || !buyPreview) return;
    const [tokensOut] = buyPreview as readonly [bigint, bigint];
    const minOut = tokensOut - (tokensOut * BigInt(slippageBps)) / 10000n;
    writeContract(
      {
        address: market.address,
        abi: MARKET_ABI,
        functionName: "buy",
        args: [outcome, amountBigInt, minOut],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (h) => {
          sideToast(`Bought ${outcome === 0 ? "YES" : "NO"}`, h);
          setAmount("");
        },
        onError: (e) => toast.error(e.message.split("\n")[0]),
      },
    );
  };

  const handleSell = () => {
    if (!amountBigInt || !sellPreview) return;
    const [tokensIn] = sellPreview as readonly [bigint, bigint];
    const maxIn = tokensIn + (tokensIn * BigInt(slippageBps)) / 10000n;
    writeContract(
      {
        address: market.address,
        abi: MARKET_ABI,
        functionName: "sell",
        args: [outcome, amountBigInt, maxIn],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (h) => {
          sideToast(`Sold ${outcome === 0 ? "YES" : "NO"}`, h);
          setAmount("");
        },
        onError: (e) => toast.error(e.message.split("\n")[0]),
      },
    );
  };

  const handleRedeem = () =>
    writeContract(
      {
        address: market.address,
        abi: MARKET_ABI,
        functionName: "redeem",
        args: [],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (h) => sideToast("Redeem submitted", h),
        onError: (e) => toast.error(e.message.split("\n")[0]),
      },
    );

  const userBal = side === "buy" ? usdcBalance : outcome === 0 ? yesBalance : noBalance;

  const setMax = () => {
    if (!userBal) return;
    setAmount(formatUsdc(userBal as bigint).replace(/,/g, ""));
  };

  // Resolved -> show redeem instead
  if (market.state === 2) {
    return (
      <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border-1)] flex items-center justify-between">
          <span className="text-sm font-medium">Redeem</span>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              market.winningOutcome === 0
                ? "bg-[var(--color-yes-bg)] text-[var(--color-yes)]"
                : "bg-[var(--color-no-bg)] text-[var(--color-no)]"
            }`}
          >
            {market.winningOutcome === 0 ? "YES" : "NO"} won
          </span>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Your YES</span>
              <span className="mono">
                {yesBalance !== undefined
                  ? formatUsdc(yesBalance as bigint)
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Your NO</span>
              <span className="mono">
                {noBalance !== undefined
                  ? formatUsdc(noBalance as bigint)
                  : "—"}
              </span>
            </div>
          </div>
          <button
            disabled={busy || !user}
            onClick={handleRedeem}
            className="w-full py-2.5 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-bg-0)] text-sm font-semibold transition-colors"
          >
            {busy ? "Confirming…" : "Redeem 1:1 for USDC"}
          </button>
        </div>
      </div>
    );
  }

  const insufficientUsdc =
    side === "buy" &&
    user &&
    usdcBalance !== undefined &&
    amountBigInt > (usdcBalance as bigint);

  return (
    <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] overflow-hidden">
      {/* Side tabs */}
      <div className="grid grid-cols-2">
        {(["buy", "sell"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`py-2.5 text-sm font-medium transition-colors capitalize border-b-2 ${
              side === s
                ? "border-[var(--color-accent)] text-[var(--color-text-primary)] bg-[var(--color-bg-1)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] bg-[var(--color-bg-2)]/40"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* YES / NO selector — big, like a price-side toggle */}
        <div className="grid grid-cols-2 gap-2">
          {([0, 1] as Outcome[]).map((o) => {
            const active = outcome === o;
            const isYes = o === 0;
            return (
              <button
                key={o}
                onClick={() => setOutcome(o)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  active
                    ? isYes
                      ? "border-[var(--color-yes)] bg-[var(--color-yes-bg)]"
                      : "border-[var(--color-no)] bg-[var(--color-no-bg)]"
                    : "border-[var(--color-border-1)] bg-[var(--color-bg-2)] hover:border-[var(--color-border-2)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold tracking-wider ${
                      isYes ? "text-[var(--color-yes)]" : "text-[var(--color-no)]"
                    }`}
                  >
                    {isYes ? "YES" : "NO"}
                  </span>
                </div>
                <div
                  className={`mono tabular-nums text-xl font-semibold mt-1 ${
                    active
                      ? isYes
                        ? "text-[var(--color-yes)]"
                        : "text-[var(--color-no)]"
                      : "text-[var(--color-text-primary)]"
                  }`}
                >
                  {priceFor(o).toFixed(0)}¢
                </div>
              </button>
            );
          })}
        </div>

        {/* Amount input */}
        <div className="rounded-lg bg-[var(--color-bg-2)] border border-[var(--color-border-1)] focus-within:border-[var(--color-accent)]/60 transition-colors">
          <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-[var(--color-text-muted)]">
            <span>{side === "buy" ? "Pay" : "Receive"}</span>
            {user && (
              <button
                onClick={setMax}
                className="hover:text-[var(--color-accent)] transition-colors"
                type="button"
              >
                Bal:{" "}
                <span className="mono">
                  {userBal !== undefined ? formatUsdc(userBal as bigint) : "—"}
                </span>
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
              className="flex-1 bg-transparent mono tabular-nums text-xl outline-none placeholder:text-[var(--color-text-muted)]/50"
            />
            <span className="text-sm text-[var(--color-text-secondary)] mono">
              {side === "buy" ? "USDC" : "USDC"}
            </span>
          </div>
        </div>

        {/* Quick amount chips */}
        {side === "buy" && (
          <div className="flex gap-1.5">
            {["10", "50", "100", "500"].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className="flex-1 py-1.5 rounded-md text-xs bg-[var(--color-bg-2)] border border-[var(--color-border-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-2)] transition-colors"
              >
                ${v}
              </button>
            ))}
          </div>
        )}

        {/* Preview rows */}
        {side === "buy" && buyPreview && amountBigInt > 0n && (
          <div className="rounded-md bg-[var(--color-bg-2)] border border-[var(--color-border-1)] p-2.5 text-xs space-y-1">
            <Row
              label={`${outcome === 0 ? "YES" : "NO"} tokens out`}
              value={formatUsdc(buyPreview[0])}
              accent={outcome === 0 ? "yes" : "no"}
            />
            <Row label="Fee" value={`${formatUsdc(buyPreview[1])} USDC`} />
            <Row
              label="Avg. price"
              value={`${((Number(amountBigInt - buyPreview[1]) / Number(buyPreview[0])) * 100).toFixed(1)}¢`}
            />
          </div>
        )}

        {side === "sell" && sellPreview && amountBigInt > 0n && (
          <div className="rounded-md bg-[var(--color-bg-2)] border border-[var(--color-border-1)] p-2.5 text-xs space-y-1">
            <Row
              label={`${outcome === 0 ? "YES" : "NO"} tokens in`}
              value={formatUsdc(sellPreview[0])}
              accent={outcome === 0 ? "yes" : "no"}
            />
            <Row label="Fee" value={`${formatUsdc(sellPreview[1])} USDC`} />
          </div>
        )}

        {/* Slippage */}
        <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
          <span>Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_PRESETS.map((bps) => (
              <button
                key={bps}
                onClick={() => setSlippageBps(bps)}
                className={`px-2 py-0.5 rounded mono ${
                  slippageBps === bps
                    ? "bg-[var(--color-bg-3)] text-[var(--color-text-primary)]"
                    : "hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {(bps / 100).toFixed(bps < 100 ? 1 : 0)}%
              </button>
            ))}
          </div>
        </div>

        {/* Action button */}
        {!user ? (
          <div className="text-xs text-center text-[var(--color-text-muted)] py-2">
            Connect a wallet to trade
          </div>
        ) : !isOpen ? (
          <button
            disabled
            className="w-full py-2.5 rounded-md bg-[var(--color-bg-3)] text-[var(--color-text-muted)] text-sm font-semibold cursor-not-allowed"
          >
            Market closed
          </button>
        ) : needsApproveUsdc ? (
          <button
            onClick={handleApproveUSDC}
            disabled={busy}
            className="w-full py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[var(--color-bg-0)] text-sm font-semibold transition-colors"
          >
            {busy ? "Approving…" : "Approve USDC"}
          </button>
        ) : needsApproveERC1155 ? (
          <button
            onClick={handleApproveERC1155}
            disabled={busy}
            className="w-full py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[var(--color-bg-0)] text-sm font-semibold transition-colors"
          >
            {busy ? "Approving…" : "Approve outcome tokens"}
          </button>
        ) : insufficientUsdc ? (
          <button
            disabled
            className="w-full py-2.5 rounded-md bg-[var(--color-bg-3)] text-[var(--color-text-muted)] text-sm font-semibold cursor-not-allowed"
          >
            Insufficient USDC
          </button>
        ) : (
          <button
            onClick={side === "buy" ? handleBuy : handleSell}
            disabled={busy || amountBigInt === 0n}
            className={`w-full py-2.5 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              outcome === 0
                ? "bg-[var(--color-yes)] hover:brightness-110 text-[var(--color-bg-0)]"
                : "bg-[var(--color-no)] hover:brightness-110 text-white"
            }`}
          >
            {busy
              ? "Confirming…"
              : `${side === "buy" ? "Buy" : "Sell"} ${outcome === 0 ? "YES" : "NO"}`}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "yes" | "no";
}) {
  const color =
    accent === "yes"
      ? "text-[var(--color-yes)]"
      : accent === "no"
        ? "text-[var(--color-no)]"
        : "text-[var(--color-text-primary)]";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={`mono tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
