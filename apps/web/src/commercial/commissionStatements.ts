export type CommissionStatementRow = {
  id: string;
  periodKey: string;
  periodLabel: string;
  platformFeeCollected: number;
  commissionPercent: string;
  commissionAmount: number;
  payoutStatus: "paid" | "pending" | "scheduled";
};

export type AgentPayoutStatus = CommissionStatementRow["payoutStatus"];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Build commission statements from live service bills in the agent subtree. */
export function commissionHistoryFromBills(
  bills: ReadonlyArray<{
    orgId: string;
    periodStart: string;
    volumeFeeAmount: string;
    status: string;
  }>,
  merchantIds: ReadonlySet<string>,
  commissionPercent: string,
): CommissionStatementRow[] {
  const scoped = bills.filter((b) => merchantIds.has(b.orgId));
  if (scoped.length === 0) return [];

  const byPeriod = new Map<
    string,
    { fee: number; hasPaid: boolean; hasOpen: boolean }
  >();
  for (const b of scoped) {
    const key = b.periodStart.slice(0, 7);
    const fee = Number(b.volumeFeeAmount);
    if (!Number.isFinite(fee)) continue;
    const cur = byPeriod.get(key) ?? { fee: 0, hasPaid: false, hasOpen: false };
    cur.fee += fee;
    if (b.status === "paid") cur.hasPaid = true;
    if (b.status === "issued" || b.status === "overdue") cur.hasOpen = true;
    byPeriod.set(key, cur);
  }

  const bps = Math.round(Number(commissionPercent) * 100) || 100;
  return [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, agg]) => {
      const [y, m] = key.split("-");
      const monthIdx = Number(m) - 1;
      const mon = MONTH_LABELS[monthIdx] ?? m ?? "—";
      const platformFeeCollected = Math.round(agg.fee * 100) / 100;
      const commissionAmount =
        Math.round(platformFeeCollected * (bps / 10_000) * 100) / 100;
      let payoutStatus: AgentPayoutStatus = "scheduled";
      if (agg.hasPaid && !agg.hasOpen) payoutStatus = "paid";
      else if (agg.hasOpen) payoutStatus = "pending";
      return {
        id: `live-commission-${key}`,
        periodKey: key,
        periodLabel: `${mon} ${y}`,
        platformFeeCollected,
        commissionPercent,
        commissionAmount,
        payoutStatus,
      };
    });
}
