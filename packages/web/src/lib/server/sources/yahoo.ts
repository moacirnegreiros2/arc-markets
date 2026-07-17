// Yahoo Finance unofficial chart endpoint — free, no key.
// Returns OHLC and adjusted-close series for any ticker.
//
// Symbols of interest:
//   ^BVSP   Ibovespa
//   ^GSPC   S&P 500
//   ^IXIC   NASDAQ Composite
//   TSLA    Tesla
//   COIN    Coinbase
//   NFLX    Netflix
//   AAPL    Apple

const Y = "https://query1.finance.yahoo.com/v8/finance/chart";

export type YahooCandle = { date: Date; open: number; high: number; low: number; close: number };

/**
 * Daily candles for the trailing `rangeDays`.
 * Yahoo's chart endpoint uses `range` keywords. We map ~365 → "1y", etc.
 */
export async function dailyCandles(
  symbol: string,
  rangeDays = 365,
): Promise<YahooCandle[] | null> {
  const range =
    rangeDays <= 5 ? "5d"
      : rangeDays <= 31 ? "1mo"
        : rangeDays <= 95 ? "3mo"
          : rangeDays <= 200 ? "6mo"
            : rangeDays <= 400 ? "1y"
              : "5y";
  const url = `${Y}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const r = await fetch(url, {
    next: { revalidate: 600 },
    headers: { "user-agent": "Mozilla/5.0 ArcMarkets/1.0" },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as {
    chart?: { result?: [{ timestamp?: number[]; indicators?: { quote?: [{ open: number[]; high: number[]; low: number[]; close: number[] }] } }] };
  };
  const result = j.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!ts || !q) return null;
  const candles: YahooCandle[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close[i] == null) continue;
    candles.push({
      date: new Date(ts[i] * 1000),
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
    });
  }
  return candles;
}

/** Close on or last before `target` UTC date. */
export async function closeOnOrBefore(
  symbol: string,
  target: Date,
): Promise<{ date: Date; close: number } | null> {
  const candles = await dailyCandles(symbol, 400);
  if (!candles?.length) return null;
  let best: YahooCandle | null = null;
  for (const c of candles) {
    if (c.date.getTime() <= target.getTime()) best = c;
    else break;
  }
  return best ? { date: best.date, close: best.close } : null;
}

/** Latest close. */
export async function latestClose(
  symbol: string,
): Promise<{ date: Date; close: number } | null> {
  const candles = await dailyCandles(symbol, 5);
  if (!candles?.length) return null;
  const last = candles[candles.length - 1];
  return { date: last.date, close: last.close };
}
