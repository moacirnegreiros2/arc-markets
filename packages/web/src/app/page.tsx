"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MarketCard } from "@/components/MarketCard";
import { MarketFilters, type SortKey } from "@/components/MarketFilters";
import { CONTRACTS } from "@/config/contracts";
import { categorize, type Category } from "@/lib/categories";
import { formatUsdc } from "@/lib/utils";
import { type MarketInfo } from "@/hooks/useMarkets";

type ApiMarket = {
  id: `0x${string}`;
  address: `0x${string}`;
  question: string;
  description: string;
  resolutionSource: string;
  tradingDeadline: string;
  resolutionDeadline: string;
  state: number;
  winningOutcome: number;
  poolYes: string;
  poolNo: string;
  impliedYesProbabilityBps: number;
};
type ApiResponse = {
  fetchedAt: string;
  count: number;
  markets: ApiMarket[];
  rpcError?: string;
};

// Convert API row → MarketInfo (BigInts back) so MarketCard's existing props work.
function toMarketInfo(m: ApiMarket): MarketInfo {
  return {
    id: m.id,
    address: m.address,
    question: m.question,
    description: m.description,
    resolutionSource: m.resolutionSource,
    state: m.state,
    winningOutcome: m.winningOutcome,
    tradingDeadline: BigInt(m.tradingDeadline),
    resolutionDeadline: BigInt(m.resolutionDeadline),
    feeBps: 0n,
    poolYes: BigInt(m.poolYes),
    poolNo: BigInt(m.poolNo),
    yesTokenId: 0n,
    noTokenId: 0n,
    impliedYesProbabilityBps: BigInt(m.impliedYesProbabilityBps),
  };
}

export default function HomePage() {
  const isDeployed =
    CONTRACTS.MarketFactory !== "0x0000000000000000000000000000000000000000";

  const [category, setCategory] = useState<Category>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("ending");
  const [visible, setVisible] = useState(20);
  // Status tab: "live" = only open markets, "all" = include resolved.
  // Default is "live" so the home leads with what people can actually trade.
  const [statusTab, setStatusTab] = useState<"live" | "endingSoon" | "all">("live");

  // Single fetch — server multicalls all 80 markets, returns cached JSON.
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["markets", "list"],
    queryFn: async () => {
      const r = await fetch("/api/markets/list", { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load markets");
      return r.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const markets: MarketInfo[] = useMemo(
    () => (data?.markets ?? []).map(toMarketInfo),
    [data],
  );

  // Reset pagination when filters change.
  useEffect(() => {
    setVisible(20);
  }, [category, search, sort, statusTab]);

  // Sort, then filter
  const sortedAndFiltered = useMemo(() => {
    const list = markets.slice();
    if (sort === "liquidity") {
      list.sort((a, b) => Number(b.poolYes + b.poolNo - (a.poolYes + a.poolNo)));
    } else if (sort === "ending") {
      // Open markets first, then by deadline ascending; resolved at the end
      list.sort((a, b) => {
        const ap = a.state === 0 ? 0 : a.state === 1 ? 1 : 2;
        const bp = b.state === 0 ? 0 : b.state === 1 ? 1 : 2;
        if (ap !== bp) return ap - bp;
        return Number(a.tradingDeadline - b.tradingDeadline);
      });
    } else {
      list.reverse(); // newest = factory registry order reversed
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    const in24h = now + 86_400n;
    return list.filter((m) => {
      if (statusTab === "live" && m.state !== 0) return false;
      if (statusTab === "endingSoon") {
        if (m.state !== 0) return false;
        if (m.tradingDeadline > in24h) return false;
      }
      if (category !== "All" && categorize(m.question) !== category) return false;
      if (search && !m.question.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [markets, sort, category, search, statusTab]);

  const tabCounts = useMemo(() => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const in24h = now + 86_400n;
    return {
      live: markets.filter((m) => m.state === 0).length,
      endingSoon: markets.filter(
        (m) => m.state === 0 && m.tradingDeadline <= in24h,
      ).length,
      all: markets.length,
    };
  }, [markets]);

  const counts = useMemo(() => {
    const c: Partial<Record<Category, number>> = { All: markets.length };
    for (const m of markets) {
      const cat = categorize(m.question);
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [markets]);

  const stats = useMemo(() => {
    const total = markets.length;
    const open = markets.filter((m) => m.state === 0).length;
    const totalLiquidity = markets.reduce(
      (s, m) => s + (m.poolYes + m.poolNo),
      0n,
    );
    return { total, open, totalLiquidity };
  }, [markets]);

  if (!isDeployed) {
    return (
      <div className="text-center py-24">
        <p className="text-4xl mb-4">🚧</p>
        <h2 className="text-2xl font-bold mb-2">Contracts Not Deployed Yet</h2>
        <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">
          Deploy the contracts to Arc Testnet first, then refresh this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero — inspired by Arc's dark ambient gradient and Circle's clean
          structure. Grid backdrop + soft dual-tone glow give depth without
          heavy imagery. */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-6 md:p-10">
        {/* Ambient layers */}
        <div className="grid-backdrop absolute inset-0 pointer-events-none" />
        <div
          className="absolute -top-24 -left-16 w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-accent-glow), transparent 65%)",
          }}
        />
        <div
          className="absolute -bottom-32 -right-24 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--color-warm-glow), transparent 65%)",
          }}
        />

        <div className="relative flex flex-col md:flex-row md:items-end gap-8">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--color-bg-2)]/70 border border-[var(--color-border-1)] backdrop-blur-sm">
              <span className="live-dot" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                Live on Arc Testnet · Settled in USDC
              </span>
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
              Trade the probability of{" "}
              <span className="text-gradient">anything</span>.
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-xl text-[15px] leading-relaxed">
              Binary outcomes settled in USDC. On-chain constant-product
              liquidity, two-second finality, and a resolver that reads from
              the same public data you do — no middlemen, no promises.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 md:gap-3 md:w-auto w-full">
            {[
              { label: "Markets", value: stats.total.toString() },
              { label: "Open", value: stats.open.toString() },
              {
                label: "Liquidity",
                value: `$${formatUsdc(stats.totalLiquidity)}`,
              },
            ].map((s) => (
              <div
                key={s.label}
                className="px-4 py-3 rounded-xl bg-[var(--color-bg-2)]/80 border border-[var(--color-border-1)] backdrop-blur-sm min-w-[100px]"
              >
                <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-muted)]">
                  {s.label}
                </div>
                <div className="mono tabular-nums text-xl font-semibold mt-1 text-[var(--color-text-primary)]">
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data?.rpcError && (
        <div className="rounded-md border border-[var(--color-border-1)] bg-[var(--color-bg-1)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          <span className="text-[var(--color-accent)] mr-2">⚠</span>
          Arc RPC is momentarily unavailable — showing cached data if any.
          The site refreshes every 30s.
        </div>
      )}

      {/* Status tabs — Live is the default so the home leads with actionable
          markets instead of the resolved backlog. */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-1)]">
        {[
          { key: "live" as const, label: "Live", count: tabCounts.live },
          {
            key: "endingSoon" as const,
            label: "Ending in 24h",
            count: tabCounts.endingSoon,
          },
          { key: "all" as const, label: "All", count: tabCounts.all },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              statusTab === t.key
                ? "border-[var(--color-accent)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-[var(--color-text-muted)] mono">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <MarketFilters
        selected={category}
        onSelect={setCategory}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        counts={counts}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[260px] rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-4 animate-pulse"
            >
              <div className="h-3 w-20 bg-[var(--color-bg-3)] rounded mb-3" />
              <div className="h-4 bg-[var(--color-bg-3)] rounded w-3/4 mb-2" />
              <div className="h-4 bg-[var(--color-bg-3)] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-4xl mb-4">📊</p>
          <h2 className="text-2xl font-bold mb-2">No markets yet</h2>
        </div>
      ) : sortedAndFiltered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--color-text-secondary)]">
            No markets match your filter.
          </p>
          <button
            onClick={() => {
              setCategory("All");
              setSearch("");
            }}
            className="mt-3 text-sm text-[var(--color-accent)] hover:underline"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedAndFiltered.slice(0, visible).map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
          {sortedAndFiltered.length > visible && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisible((v) => v + 20)}
                className="px-5 py-2 rounded-md bg-[var(--color-bg-2)] border border-[var(--color-border-1)] hover:border-[var(--color-border-2)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Load more
                <span className="ml-2 text-[var(--color-text-muted)] mono text-xs">
                  ({visible} / {sortedAndFiltered.length})
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
