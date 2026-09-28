/**
 * Server clock offset from `X-Server-Time` (epoch ms). Epoch time is the same
 * in every time zone, so this only corrects device clock drift; zones apply
 * when a moment is formatted for display.
 */

const SAMPLE_TTL_MS = 10 * 60_000;

let offsetMs = 0;
let bestRttMs = Number.POSITIVE_INFINITY;
let sampledAt = 0;

/** Record one response. The fastest round trip gives the tightest estimate. */
export function recordServerTime(
  header: string | null,
  sentAtMs: number,
  rttMs: number,
): void {
  const serverMs = Number(header);
  if (!header || !Number.isFinite(serverMs) || rttMs < 0) return;
  const now = Date.now();
  const stale = now - sampledAt > SAMPLE_TTL_MS;
  if (!stale && rttMs >= bestRttMs) return;
  offsetMs = serverMs - (sentAtMs + rttMs / 2);
  bestRttMs = rttMs;
  sampledAt = now;
}

/** Current time on the server's clock, as epoch ms. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function serverClockOffsetMs(): number {
  return offsetMs;
}
