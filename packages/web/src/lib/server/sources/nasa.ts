// NASA GISTEMP — global temperature anomaly time series.
// Public CSV, no key.
// https://data.giss.nasa.gov/gistemp/

const GISTEMP_CSV =
  "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";

/**
 * Returns annual anomaly (J-D column) by year, sorted ascending by year.
 * Anomaly is in degrees Celsius vs the 1951-1980 base.
 */
export async function annualAnomalies(): Promise<Map<number, number> | null> {
  const r = await fetch(GISTEMP_CSV, { next: { revalidate: 86400 } });
  if (!r.ok) return null;
  const text = await r.text();
  // CSV has a 1-line preamble, then a header row, then rows of data.
  const lines = text.split(/\r?\n/);
  const out = new Map<number, number>();
  for (const line of lines) {
    const cols = line.split(",");
    if (cols.length < 14) continue;
    const year = parseInt(cols[0], 10);
    if (!isFinite(year) || year < 1880) continue;
    const jd = parseFloat(cols[13]); // J-D column
    if (!isFinite(jd)) continue;
    out.set(year, jd);
  }
  return out;
}

/** Rank of `year` within the full GISTEMP record (1 = hottest). null if missing. */
export async function rankOfYear(year: number): Promise<number | null> {
  const map = await annualAnomalies();
  if (!map) return null;
  if (!map.has(year)) return null;
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.findIndex(([y]) => y === year) + 1;
}
