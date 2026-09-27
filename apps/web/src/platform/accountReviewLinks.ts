export type ReviewScope = { agentId: string } | { merchantId: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** UTC month bounds, matching the MTD KPIs computed by the API. */
export function utcMonthBounds(now: Date = new Date()): {
  monthStart: string;
  monthEnd: string;
  today: string;
} {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    monthStart: utcDateKey(new Date(Date.UTC(y, m, 1))),
    monthEnd: utcDateKey(new Date(Date.UTC(y, m + 1, 0))),
    today: utcDateKey(now),
  };
}

function scopeEntry(scope: ReviewScope): [string, string] {
  return "agentId" in scope ? ["agent", scope.agentId] : ["merchant", scope.merchantId];
}

/** Completed invoices created this UTC month for the agent subtree or merchant. */
export function volumeReviewQuery(scope: ReviewScope, now: Date = new Date()): string {
  const { monthStart, today } = utcMonthBounds(now);
  const q = new URLSearchParams({
    status: "completed",
    period: "custom",
    from: monthStart,
    to: today,
    utc: "1",
  });
  q.set(...scopeEntry(scope));
  return q.toString();
}

/** Service bills whose billing period overlaps this UTC month. */
export function billsReviewQuery(scope: ReviewScope, now: Date = new Date()): string {
  const { monthStart, monthEnd } = utcMonthBounds(now);
  const q = new URLSearchParams();
  q.set(...scopeEntry(scope));
  q.set("periodFrom", monthStart);
  q.set("periodTo", monthEnd);
  return q.toString();
}
