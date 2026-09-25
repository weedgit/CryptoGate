/** Sum commission owed (issued) vs remitted (paid|settled) for period keys. */
export function sumCommissionDashboardKpis(
  rows: {
    periodKey: string;
    commissionAmount: number | string;
    payoutStatus: string;
  }[],
  monthKeys: Set<string>,
): { commissionOwed: number; commissionPaid: number } {
  let commissionOwed = 0;
  let commissionPaid = 0;
  for (const row of rows) {
    if (!monthKeys.has(row.periodKey)) continue;
    const amt = Number(row.commissionAmount) || 0;
    if (row.payoutStatus === "issued") {
      commissionOwed += amt;
    } else if (
      row.payoutStatus === "paid" ||
      row.payoutStatus === "settled"
    ) {
      commissionPaid += amt;
    }
  }
  return {
    commissionOwed: Math.round(commissionOwed * 100) / 100,
    commissionPaid: Math.round(commissionPaid * 100) / 100,
  };
}

/** YYYY-MM keys spanning inclusive local calendar months of [from, to]. */
export function commissionMonthKeys(from: Date, to: Date): Set<string> {
  const keys = new Set<string>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    keys.add(`${y}-${m}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}
