/**
 * Run async work over items with a concurrency cap. Result order matches input.
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapPool(items, concurrency, fn) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const cap = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  /** @type {R[]} */
  const results = new Array(list.length);
  let next = 0;

  async function worker() {
    while (next < list.length) {
      const i = next;
      next += 1;
      results[i] = await fn(list[i], i);
    }
  }

  await Promise.all(Array.from({ length: cap }, () => worker()));
  return results;
}
