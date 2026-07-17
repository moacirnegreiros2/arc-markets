// DeFiLlama — public TVL API, free, no key.
// https://defillama.com/docs/api

const LLAMA = "https://api.llama.fi";

export type TvlPoint = { date: Date; tvl: number };

/** Historical TVL points for a chain (e.g. "Base", "Arbitrum"). */
export async function chainTvlHistory(chain: string): Promise<TvlPoint[] | null> {
  const r = await fetch(
    `${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(chain)}`,
    { next: { revalidate: 1800 } },
  );
  if (!r.ok) return null;
  const arr = (await r.json()) as { date: number; tvl: number }[];
  return arr.map((p) => ({ date: new Date(p.date * 1000), tvl: p.tvl }));
}

/** Max TVL touched within [from, to]. */
export async function maxTvlInWindow(
  chain: string,
  from: Date,
  to: Date,
): Promise<number | null> {
  const hist = await chainTvlHistory(chain);
  if (!hist) return null;
  let max = -Infinity;
  for (const p of hist) {
    if (p.date >= from && p.date <= to) {
      if (p.tvl > max) max = p.tvl;
    }
  }
  return isFinite(max) ? max : null;
}

/** Current TVL for a chain. */
export async function currentChainTvl(chain: string): Promise<number | null> {
  const hist = await chainTvlHistory(chain);
  if (!hist?.length) return null;
  return hist[hist.length - 1].tvl;
}
