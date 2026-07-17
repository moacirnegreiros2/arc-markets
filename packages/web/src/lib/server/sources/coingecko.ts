// Public price sources. No API key needed for the free tier.
// CoinGecko: https://www.coingecko.com/en/api/documentation

const CG = "https://api.coingecko.com/api/v3";

const SYMBOL_TO_ID: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  bnb: "binancecoin",
  ada: "cardano",
  doge: "dogecoin",
  matic: "matic-network",
  link: "chainlink",
  arb: "arbitrum",
  op: "optimism",
};

export function resolveCoinId(symbolOrName: string): string | null {
  const k = symbolOrName.trim().toLowerCase();
  return SYMBOL_TO_ID[k] ?? null;
}

/** Current spot price in USD (CoinGecko free tier). */
export async function spotPriceUsd(symbol: string): Promise<number | null> {
  const id = resolveCoinId(symbol);
  if (!id) return null;
  const r = await fetch(
    `${CG}/simple/price?ids=${id}&vs_currencies=usd`,
    { next: { revalidate: 60 } },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as Record<string, { usd: number }>;
  return j[id]?.usd ?? null;
}

/**
 * Historical close (UTC) for a given date.
 * Date format: dd-mm-yyyy (CoinGecko's required format).
 */
export async function historicalPriceUsd(
  symbol: string,
  date: Date,
): Promise<number | null> {
  const id = resolveCoinId(symbol);
  if (!id) return null;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const r = await fetch(
    `${CG}/coins/${id}/history?date=${dd}-${mm}-${yyyy}&localization=false`,
    { next: { revalidate: 86400 } },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as {
    market_data?: { current_price?: { usd?: number } };
  };
  return j.market_data?.current_price?.usd ?? null;
}

/** Bitcoin dominance (%) from CoinGecko /global. */
export async function btcDominanceFraction(): Promise<number | null> {
  const r = await fetch(`${CG}/global`, { next: { revalidate: 300 } });
  if (!r.ok) return null;
  const j = (await r.json()) as {
    data?: { market_cap_percentage?: { btc?: number } };
  };
  return j.data?.market_cap_percentage?.btc ?? null;
}

/**
 * Largest market cap (USD) of any coin in a CoinGecko category
 * (e.g. "meme-token") as a single number.
 */
export async function largestMcapInCategory(
  categoryId: string,
): Promise<number | null> {
  const r = await fetch(
    `${CG}/coins/markets?vs_currency=usd&category=${categoryId}&order=market_cap_desc&per_page=1&page=1`,
    { next: { revalidate: 600 } },
  );
  if (!r.ok) return null;
  const arr = (await r.json()) as { market_cap?: number }[];
  return arr[0]?.market_cap ?? null;
}

/**
 * Price (USD) closest to `unix` (within ±1h window).
 * Uses CoinGecko's market_chart/range which returns 5-minute candles for short ranges.
 */
export async function priceAtUnix(
  symbol: string,
  unix: number,
): Promise<number | null> {
  const id = resolveCoinId(symbol);
  if (!id) return null;
  const from = unix - 3600;
  const to = unix + 3600;
  const r = await fetch(
    `${CG}/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`,
    { next: { revalidate: 120 } },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { prices?: [number, number][] };
  if (!j.prices?.length) return null;
  const targetMs = unix * 1000;
  let best: [number, number] | null = null;
  for (const p of j.prices) {
    if (!best || Math.abs(p[0] - targetMs) < Math.abs(best[0] - targetMs)) {
      best = p;
    }
  }
  return best?.[1] ?? null;
}

/** Returns true if any 1h candle in the window closed at/above `threshold`. */
export async function priceTouchedAbove(
  symbol: string,
  threshold: number,
  fromUnix: number,
  toUnix: number,
): Promise<boolean | null> {
  const id = resolveCoinId(symbol);
  if (!id) return null;
  const r = await fetch(
    `${CG}/coins/${id}/market_chart/range?vs_currency=usd&from=${fromUnix}&to=${toUnix}`,
    { next: { revalidate: 600 } },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { prices?: [number, number][] };
  if (!j.prices) return null;
  return j.prices.some(([, p]) => p >= threshold);
}
