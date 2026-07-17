"use client";

import { use } from "react";
import Link from "next/link";
import {
  useMarketData,
  parseMarketData,
  useMarketAddress,
} from "@/hooks/useMarkets";
import { TradePanel } from "@/components/TradePanel";
import { LiquidityPanel } from "@/components/LiquidityPanel";
import { MarketChart } from "@/components/MarketChart";
import {
  formatDeadline,
  formatUsdc,
  MARKET_STATE,
  timeLeft,
} from "@/lib/utils";
import { categorize, CATEGORY_ICON } from "@/lib/categories";

export default function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const marketId = id as `0x${string}`;

  const { data: address } = useMarketAddress(marketId);
  const { data: results, isLoading } = useMarketData(
    address as `0x${string}` | undefined,
  );

  const market =
    address && results
      ? parseMarketData(marketId, address as `0x${string}`, results)
      : null;

  if (isLoading || !market) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-[var(--color-bg-2)] rounded w-32" />
        <div className="h-8 bg-[var(--color-bg-2)] rounded w-2/3" />
        <div className="grid grid-cols-3 gap-4 mt-8">
          <div className="col-span-2 h-96 bg-[var(--color-bg-1)] border border-[var(--color-border-1)] rounded-xl" />
          <div className="h-96 bg-[var(--color-bg-1)] border border-[var(--color-border-1)] rounded-xl" />
        </div>
      </div>
    );
  }

  const yesPct = Number(market.impliedYesProbabilityBps) / 100;
  const noPct = 100 - yesPct;
  const stateLabel = MARKET_STATE[market.state as 0 | 1 | 2] ?? "Unknown";
  const totalPool = formatUsdc(market.poolYes + market.poolNo);
  const category = categorize(market.question);
  const isOpen = market.state === 0;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <Link href="/" className="hover:text-[var(--color-text-primary)]">
          Markets
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text-secondary)]">
          {CATEGORY_ICON[category]} {category}
        </span>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 text-[11px]">
              <span
                className={`px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  market.state === 0
                    ? "bg-[var(--color-yes-bg)] text-[var(--color-yes)]"
                    : market.state === 1
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                }`}
              >
                {stateLabel}
              </span>
              {isOpen && (
                <span className="text-[var(--color-text-muted)] mono">
                  closes in {timeLeft(market.tradingDeadline)}
                </span>
              )}
              <span className="text-[var(--color-text-muted)] mono ml-auto">
                {market.address.slice(0, 6)}…{market.address.slice(-4)}
              </span>
            </div>
            <h1 className="text-2xl md:text-[26px] font-semibold leading-tight text-[var(--color-text-primary)]">
              {market.question}
            </h1>
            {market.description && (
              <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
                {market.description}
              </p>
            )}
          </div>

          {/* Probability summary */}
          <div className="flex flex-col items-end gap-1 min-w-[140px]">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
              YES probability
            </div>
            <div className="mono tabular-nums text-4xl font-semibold text-[var(--color-yes)]">
              {yesPct.toFixed(1)}%
            </div>
            <div className="mono text-xs text-[var(--color-text-muted)]">
              NO {noPct.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Probability bar */}
        <div className="mt-4 h-1.5 rounded-full bg-[var(--color-bg-3)] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-yes)] to-[var(--color-accent)]"
            style={{ width: `${yesPct}%` }}
          />
        </div>

        {/* Quick stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px mt-4 rounded-lg overflow-hidden bg-[var(--color-border-1)]">
          {[
            { k: "Liquidity", v: `$${totalPool}` },
            { k: "Pool YES", v: formatUsdc(market.poolYes) },
            { k: "Pool NO", v: formatUsdc(market.poolNo) },
            { k: "Fee", v: `${Number(market.feeBps) / 100}%` },
          ].map((s) => (
            <div
              key={s.k}
              className="bg-[var(--color-bg-2)] px-3 py-2.5"
            >
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {s.k}
              </div>
              <div className="mono tabular-nums text-sm font-semibold mt-0.5">
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resolved banner */}
      {market.state === 2 && (
        <div
          className={`rounded-xl p-4 border ${
            market.winningOutcome === 0
              ? "bg-[var(--color-yes-bg)] border-[var(--color-yes-border)] text-[var(--color-yes)]"
              : "bg-[var(--color-no-bg)] border-[var(--color-no-border)] text-[var(--color-no)]"
          }`}
        >
          <span className="font-semibold">
            Resolved — {market.winningOutcome === 0 ? "YES" : "NO"} won
          </span>
          <span className="text-[var(--color-text-secondary)] text-sm ml-2">
            Winning token holders can redeem 1:1 for USDC.
          </span>
        </div>
      )}

      {/* Main two-col grid */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* LEFT: chart + details */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-[var(--color-text-secondary)]">
                YES price history
              </h2>
              <span className="text-[11px] text-[var(--color-text-muted)] mono">
                via on-chain events
              </span>
            </div>
            <MarketChart marketAddress={market.address} />
          </div>

          <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-4">
            <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Resolution
            </h2>
            <p className="text-sm leading-relaxed">{market.resolutionSource}</p>
            <div className="mt-3 grid grid-cols-2 gap-px rounded-lg overflow-hidden bg-[var(--color-border-1)]">
              <div className="bg-[var(--color-bg-2)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Trading deadline
                </div>
                <div className="text-xs mt-0.5 mono">
                  {formatDeadline(market.tradingDeadline)}
                </div>
              </div>
              <div className="bg-[var(--color-bg-2)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Resolution deadline
                </div>
                <div className="text-xs mt-0.5 mono">
                  {formatDeadline(market.resolutionDeadline)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: trade + liquidity (sticky on desktop) */}
        <div className="space-y-4 lg:sticky lg:top-[120px] self-start">
          <TradePanel market={market} />
          <LiquidityPanel market={market} />
        </div>
      </div>
    </div>
  );
}
