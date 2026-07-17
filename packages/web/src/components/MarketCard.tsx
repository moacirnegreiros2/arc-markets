"use client";

import Link from "next/link";
import { type MarketInfo } from "@/hooks/useMarkets";
import { formatUsdc, timeLeft, MARKET_STATE } from "@/lib/utils";
import { categorize, CATEGORY_ICON } from "@/lib/categories";

type Props = { market: MarketInfo };

export function MarketCard({ market }: Props) {
  const yesPct = Number(market.impliedYesProbabilityBps) / 100;
  const noPct = 100 - yesPct;
  const stateLabel = MARKET_STATE[market.state as 0 | 1 | 2] ?? "Unknown";
  const liquidity = formatUsdc(market.poolYes + market.poolNo);
  const category = categorize(market.question);
  const isOpen = market.state === 0;

  return (
    <Link href={`/market/${market.id}`} className="block group">
      <div className="card-hover h-full rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-4 flex flex-col gap-3">
        {/* Top row: category + status */}
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
          <span className="text-[var(--color-text-muted)]">
            <span className="mr-1">{CATEGORY_ICON[category]}</span>
            {category}
          </span>
          <span
            className={`mono ${
              isOpen
                ? "text-[var(--color-text-secondary)]"
                : market.state === 2
                  ? "text-[var(--color-accent)]"
                  : "text-amber-400"
            }`}
          >
            {isOpen ? timeLeft(market.tradingDeadline) : stateLabel}
          </span>
        </div>

        {/* Question */}
        <h3 className="text-[15px] leading-snug font-medium line-clamp-3 min-h-[60px] text-[var(--color-text-primary)] group-hover:text-white transition-colors">
          {market.question}
        </h3>

        {/* Probability + thin bar */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between mono tabular-nums">
            <span className="text-[var(--color-yes)] text-[22px] font-semibold leading-none">
              {yesPct.toFixed(0)}%
            </span>
            <span className="text-[var(--color-text-muted)] text-[11px] uppercase tracking-wider">
              YES
            </span>
          </div>
          <div className="h-1 rounded-full bg-[var(--color-bg-3)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-yes)] transition-all"
              style={{ width: `${yesPct}%` }}
            />
          </div>
        </div>

        {/* YES / NO action buttons (visual price cue) */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="text-center py-2 rounded-md border border-[var(--color-yes-border)] bg-[var(--color-yes-bg)] text-[var(--color-yes)] text-sm font-medium group-hover:bg-[var(--color-yes)]/20 transition-colors">
            Buy YES <span className="mono opacity-80">· ${(yesPct / 100).toFixed(2)}</span>
          </div>
          <div className="text-center py-2 rounded-md border border-[var(--color-no-border)] bg-[var(--color-no-bg)] text-[var(--color-no)] text-sm font-medium group-hover:bg-[var(--color-no)]/20 transition-colors">
            Buy NO <span className="mono opacity-80">· ${(noPct / 100).toFixed(2)}</span>
          </div>
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between pt-2 mt-auto border-t border-[var(--color-border-1)] text-[11px] text-[var(--color-text-muted)] mono">
          <span>Liq · ${liquidity}</span>
          <span className="truncate ml-2">
            {market.address.slice(0, 6)}…{market.address.slice(-4)}
          </span>
        </div>
      </div>
    </Link>
  );
}
