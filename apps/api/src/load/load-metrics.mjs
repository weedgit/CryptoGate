/**
 * Latency helpers for M4-12 load runs.
 * @param {number[]} samplesMs
 * @param {number} p 0–100
 */
export function percentile(samplesMs, p) {
  if (samplesMs.length === 0) return 0;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

/**
 * @param {number[]} samplesMs
 * @param {number} wallMs
 * @param {string} name
 */
export function summarize(samplesMs, wallMs, name) {
  const n = samplesMs.length;
  const sum = samplesMs.reduce((a, b) => a + b, 0);
  return {
    name,
    count: n,
    wallMs: Math.round(wallMs),
    rps: wallMs > 0 ? Number(((n / wallMs) * 1000).toFixed(1)) : 0,
    p50Ms: Math.round(percentile(samplesMs, 50)),
    p95Ms: Math.round(percentile(samplesMs, 95)),
    p99Ms: Math.round(percentile(samplesMs, 99)),
    meanMs: n ? Math.round(sum / n) : 0,
  };
}

/**
 * Run `work(i)` for i in 0..total-1 with limited concurrency.
 * @param {number} total
 * @param {number} concurrency
 * @param {(i: number) => Promise<void>} work
 * @returns {Promise<number[]>} per-op latency ms
 */
export async function runConcurrent(total, concurrency, work) {
  /** @type {number[]} */
  const samples = [];
  let next = 0;

  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= total) return;
      const t0 = performance.now();
      await work(i);
      samples.push(performance.now() - t0);
    }
  }

  const n = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return samples;
}
