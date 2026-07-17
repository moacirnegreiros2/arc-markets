// Server-side market discovery + state reads using viem multicall.
//
// Optimizations:
//  1) Immutable fields (question/description/resolutionSource/deadlines) are
//     cached per market address across function invocations — they never
//     change post-initialize, so we only fetch them once per market.
//  2) Dynamic fields (state/winningOutcome/poolYes/poolNo) are refetched
//     every call, but summaries themselves are memoized with a short TTL.
//  3) Multicall is chunked, rate-throttled and retried — Arc testnet RPC
//     returns "request limit reached" if aggregate3 payloads or QPS run high.

import type { Address } from "viem";
import { publicClient } from "./admin";
import { FACTORY_ABI, MARKET_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/config/contracts";

export type MarketSummary = {
  id: `0x${string}`;
  address: Address;
  question: string;
  description: string;
  resolutionSource: string;
  tradingDeadline: bigint;
  resolutionDeadline: bigint;
  state: number;
  winningOutcome: number;
  poolYes: bigint;
  poolNo: bigint;
};

const IMMUTABLE_FIELDS = [
  "question",
  "description",
  "resolutionSource",
  "tradingDeadline",
  "resolutionDeadline",
] as const;

const DYNAMIC_FIELDS = ["state", "winningOutcome", "poolYes", "poolNo"] as const;

type Immutable = {
  question: string;
  description: string;
  resolutionSource: string;
  tradingDeadline: bigint;
  resolutionDeadline: bigint;
};

// Module-scope caches — survive across warm invocations on the same instance.
const idsCache: { at: number; value: `0x${string}`[] } = { at: 0, value: [] };
const addressCache = new Map<`0x${string}`, Address>(); // marketId -> address
const immutableCache = new Map<Address, Immutable>();
const summariesCache: { at: number; value: MarketSummary[] } = { at: 0, value: [] };

const IDS_TTL_MS = 30_000; // getMarketIds() is cheap; short refresh
const SUMMARIES_TTL_MS = 15_000;

// Arc testnet RPC rate-limits aggressively per IP (~1 req/s effective).
// We keep aggregate3 chunks fat (fewer round-trips) and only add a small
// sleep between chunks — the RPC itself throttles us anyway. Retries with
// exponential backoff cover transient "request limit reached" spikes.
const CHUNK = 50;
const SLEEP_MS = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chunkedMulticall<T>(
  contracts: readonly {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }[],
  allowFailure: boolean,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < contracts.length; i += CHUNK) {
    const slice = contracts.slice(i, i + CHUNK);
    let lastErr: unknown;
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const res = await publicClient.multicall({
          contracts: slice as never,
          allowFailure: allowFailure as never,
          batchSize: 0,
        });
        out.push(...(res as T[]));
        ok = true;
      } catch (err) {
        lastErr = err;
        // Exponential backoff: 300 → 900 → 2700 ms
        await sleep(300 * Math.pow(3, attempt));
      }
    }
    if (!ok) throw lastErr;
    if (i + CHUNK < contracts.length) await sleep(SLEEP_MS);
  }
  return out;
}

async function getIds(): Promise<`0x${string}`[]> {
  const now = Date.now();
  if (idsCache.value.length && now - idsCache.at < IDS_TTL_MS) {
    return idsCache.value;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const ids = (await publicClient.readContract({
        address: CONTRACTS.MarketFactory,
        abi: FACTORY_ABI,
        functionName: "getMarketIds",
      })) as `0x${string}`[];
      idsCache.at = now;
      idsCache.value = ids;
      return ids;
    } catch (err) {
      lastErr = err;
      await sleep(500 * Math.pow(2, attempt)); // 500, 1000, 2000, 4000, 8000
    }
  }
  if (idsCache.value.length) return idsCache.value; // stale-while-error
  throw lastErr;
}

async function resolveAddresses(ids: readonly `0x${string}`[]): Promise<Address[]> {
  const missing: `0x${string}`[] = [];
  for (const id of ids) if (!addressCache.has(id)) missing.push(id);
  if (missing.length) {
    const calls = missing.map((id) => ({
      address: CONTRACTS.MarketFactory,
      abi: FACTORY_ABI,
      functionName: "getMarketAddress",
      args: [id] as const,
    }));
    const addrs = await chunkedMulticall<Address>(calls, false);
    for (let i = 0; i < missing.length; i++) addressCache.set(missing[i], addrs[i]);
  }
  return ids.map((id) => addressCache.get(id)!);
}

async function loadImmutables(addresses: readonly Address[]): Promise<Immutable[]> {
  const missing: Address[] = [];
  for (const a of addresses) if (!immutableCache.has(a)) missing.push(a);
  if (missing.length) {
    const calls: {
      address: Address;
      abi: readonly unknown[];
      functionName: string;
    }[] = [];
    for (const addr of missing) {
      for (const fn of IMMUTABLE_FIELDS) {
        calls.push({ address: addr, abi: MARKET_ABI, functionName: fn });
      }
    }
    const res = await chunkedMulticall<unknown>(calls, false);
    for (let i = 0; i < missing.length; i++) {
      const base = i * IMMUTABLE_FIELDS.length;
      immutableCache.set(missing[i], {
        question: (res[base] as string) ?? "",
        description: (res[base + 1] as string) ?? "",
        resolutionSource: (res[base + 2] as string) ?? "",
        tradingDeadline: (res[base + 3] as bigint) ?? 0n,
        resolutionDeadline: (res[base + 4] as bigint) ?? 0n,
      });
    }
  }
  return addresses.map((a) => immutableCache.get(a)!);
}

async function loadDynamic(addresses: readonly Address[]): Promise<
  { state: number; winningOutcome: number; poolYes: bigint; poolNo: bigint }[]
> {
  const calls: { address: Address; abi: readonly unknown[]; functionName: string }[] = [];
  for (const addr of addresses) {
    for (const fn of DYNAMIC_FIELDS) {
      calls.push({ address: addr, abi: MARKET_ABI, functionName: fn });
    }
  }
  const res = await chunkedMulticall<unknown>(calls, false);
  return addresses.map((_, i) => {
    const base = i * DYNAMIC_FIELDS.length;
    return {
      state: Number((res[base] as number | bigint) ?? 0),
      winningOutcome: Number((res[base + 1] as number | bigint) ?? 0),
      poolYes: (res[base + 2] as bigint) ?? 0n,
      poolNo: (res[base + 3] as bigint) ?? 0n,
    };
  });
}

// Options for listAllMarkets. `limit` restricts to the N most recent (last
// pushed onto marketIds); default returns everything.
export type ListOptions = { limit?: number };

export async function listAllMarkets(opts: ListOptions = {}): Promise<MarketSummary[]> {
  const now = Date.now();
  const applyLimit = (arr: MarketSummary[]) =>
    opts.limit ? arr.slice(-opts.limit) : arr;

  if (summariesCache.value.length && now - summariesCache.at < SUMMARIES_TTL_MS) {
    return applyLimit(summariesCache.value);
  }

  try {
    const allIds = await getIds();
    if (allIds.length === 0) return [];

    // If the caller asked for a subset, only read the last N markets on-chain.
    // This is the fast path for the public listing (thousands of markets).
    const ids = opts.limit ? allIds.slice(-opts.limit) : allIds;

    const addresses = await resolveAddresses(ids);
    const immutables = await loadImmutables(addresses);
    const dynamics = await loadDynamic(addresses);

    const summaries: MarketSummary[] = ids.map((id, i) => ({
      id,
      address: addresses[i],
      ...immutables[i],
      ...dynamics[i],
    }));

    // Cache full sweeps; partial sweeps only overwrite if the cache is empty.
    if (!opts.limit || summariesCache.value.length === 0) {
      summariesCache.at = Date.now();
      summariesCache.value = summaries;
    }
    return summaries;
  } catch (err) {
    if (summariesCache.value.length) {
      console.warn("[listAllMarkets] fresh fetch failed, serving stale:", (err as Error).message);
      return applyLimit(summariesCache.value);
    }
    throw err;
  }
}

export function isPendingResolution(m: MarketSummary, now: Date): boolean {
  if (m.state === 2) return false; // already resolved
  return now.getTime() / 1000 >= Number(m.tradingDeadline);
}
