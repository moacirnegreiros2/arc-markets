// FRED (Federal Reserve Economic Data) — free, no key for CSV exports.
// https://fred.stlouisfed.org/categories
//
// Series of interest:
//   FEDFUNDS  monthly avg federal funds rate
//   DFF       daily federal funds rate
//   CPIAUCNS  CPI All Urban Consumers, NSA
//   CPILFENS  Core CPI

const FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv";

export type FredRow = { date: Date; value: number };

/** Returns full series as parsed rows, sorted ascending by date. */
export async function fredSeries(seriesId: string): Promise<FredRow[] | null> {
  const r = await fetch(`${FRED}?id=${seriesId}`, {
    next: { revalidate: 3600 },
    headers: { Accept: "text/csv" },
  });
  if (!r.ok) return null;
  const text = await r.text();
  const lines = text.split(/\r?\n/).slice(1).filter(Boolean);
  const rows: FredRow[] = [];
  for (const line of lines) {
    const [dateStr, valueStr] = line.split(",");
    const value = parseFloat(valueStr);
    if (!isFinite(value)) continue;
    const date = new Date(dateStr + "T00:00:00Z");
    if (isNaN(date.getTime())) continue;
    rows.push({ date, value });
  }
  return rows;
}

/** Most recent observation. */
export async function fredLatest(seriesId: string): Promise<FredRow | null> {
  const rows = await fredSeries(seriesId);
  if (!rows?.length) return null;
  return rows[rows.length - 1];
}

/** Observation on or last before `target`. */
export async function fredAtOrBefore(
  seriesId: string,
  target: Date,
): Promise<FredRow | null> {
  const rows = await fredSeries(seriesId);
  if (!rows?.length) return null;
  let best: FredRow | null = null;
  for (const r of rows) {
    if (r.date.getTime() <= target.getTime()) best = r;
    else break;
  }
  return best;
}

/** Year-over-year % change for a monthly series at the given target month-end. */
export async function fredYoYAt(
  seriesId: string,
  target: Date,
): Promise<number | null> {
  const rows = await fredSeries(seriesId);
  if (!rows?.length) return null;
  // Find the row for the target month (or the last observation that month)
  const targetYM = target.getUTCFullYear() * 12 + target.getUTCMonth();
  const findIdx = (ym: number) => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.date.getUTCFullYear() * 12 + r.date.getUTCMonth() === ym) return i;
    }
    return -1;
  };
  const nowIdx = findIdx(targetYM);
  const prevIdx = findIdx(targetYM - 12);
  if (nowIdx === -1 || prevIdx === -1) return null;
  const cur = rows[nowIdx].value;
  const prev = rows[prevIdx].value;
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/**
 * Did the Fed change rates between the last two FEDFUNDS monthly observations?
 * Returns:
 *   "cut"  if latest < previous - threshold
 *   "hike" if latest > previous + threshold
 *   "hold" otherwise
 */
export async function fedRateMove(
  thresholdPct = 0.10,
): Promise<{ move: "cut" | "hike" | "hold"; latest: number; previous: number; latestDate: Date } | null> {
  const rows = await fredSeries("FEDFUNDS");
  if (!rows || rows.length < 2) return null;
  const a = rows[rows.length - 1];
  const b = rows[rows.length - 2];
  if (a.value < b.value - thresholdPct) {
    return { move: "cut", latest: a.value, previous: b.value, latestDate: a.date };
  }
  if (a.value > b.value + thresholdPct) {
    return { move: "hike", latest: a.value, previous: b.value, latestDate: a.date };
  }
  return { move: "hold", latest: a.value, previous: b.value, latestDate: a.date };
}
