/**
 * Market price history for dashboard rate cards: one live median per asset
 * every SAMPLE_INTERVAL_MS, kept for SAMPLE_RETENTION_DAYS.
 */
import { getPool } from "../db/pool.mjs";

export const SAMPLE_INTERVAL_MS = 5 * 60_000;
export const SAMPLE_RETENTION_DAYS = 400;
const PRUNE_INTERVAL_MS = 24 * 60 * 60_000;

/** @type {Map<string, number>} asset → last sample time */
const lastSampleAt = new Map();
let lastPruneAt = 0;

/**
 * Store fresh medians that are due a sample; prune old rows once a day.
 * @param {Array<{ asset: string, rate: string, source: string }>} prices
 * @param {number} [now]
 */
export async function recordRateSamples(prices, now = Date.now()) {
  const due = prices.filter((p) => now - (lastSampleAt.get(p.asset) ?? 0) >= SAMPLE_INTERVAL_MS);
  if (due.length === 0) return 0;
  const pool = getPool();
  await pool.query(
    `INSERT INTO fx_rate_samples (asset, sampled_at, rate, source)
     SELECT a, to_timestamp($4::double precision / 1000), r::numeric, s
       FROM unnest($1::text[], $2::text[], $3::text[]) AS t(a, r, s)
     ON CONFLICT DO NOTHING`,
    [due.map((p) => p.asset), due.map((p) => p.rate), due.map((p) => p.source), now],
  );
  for (const p of due) lastSampleAt.set(p.asset, now);
  if (now - lastPruneAt >= PRUNE_INTERVAL_MS) {
    lastPruneAt = now;
    await pool.query(
      `DELETE FROM fx_rate_samples WHERE sampled_at < now() - make_interval(days => $1)`,
      [SAMPLE_RETENTION_DAYS],
    );
  }
  return due.length;
}

/** Test hook. */
export function resetRateSampleClock() {
  lastSampleAt.clear();
  lastPruneAt = 0;
}
