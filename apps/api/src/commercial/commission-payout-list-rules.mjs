/** Paid invoices awaiting agent confirmation this long are flagged as stuck. */
export const COMMISSION_PAID_AGING_DAYS = 7;

export const COMMISSION_PAID_AGING_SQL = `(payout_status = 'paid' AND paid_at <= now() - interval '${COMMISSION_PAID_AGING_DAYS} days')`;

export const COMMISSION_PAYOUT_SORTS = Object.freeze({
  period: "period_key",
  agent: "lower(payee_name)",
  fee: "platform_fee_collected",
  rate: "(CASE WHEN commission_percent ~ '^[0-9]+(\\.[0-9]+)?$' THEN commission_percent::numeric ELSE 0 END)",
  commission: "commission_amount",
  status: "payout_status",
  tx: "COALESCE(tx_ref, '')",
  address: "COALESCE(payout_address, '')",
  paidAt: "paid_at",
  settledAt: "COALESCE(settled_at, paid_at)",
});

/**
 * @param {URLSearchParams} sp
 * @returns {{ ok: true, query: { q: string, sort: string, dir: "asc" | "desc", agingFirst: boolean } } | { ok: false, message: string }}
 */
export function parseCommissionListQuery(sp) {
  const q = (sp.get("q") ?? "").trim().slice(0, 120);
  const sort = sp.get("sort")?.trim() || "period";
  if (!Object.hasOwn(COMMISSION_PAYOUT_SORTS, sort)) {
    return { ok: false, message: "Invalid sort" };
  }
  const dir = sp.get("dir")?.trim() || "desc";
  if (dir !== "asc" && dir !== "desc") {
    return { ok: false, message: "dir must be asc or desc" };
  }
  return { ok: true, query: { q, sort, dir, agingFirst: sp.get("agingFirst") === "1" } };
}

/**
 * "CI-1A2B3C4D" / "1a2b3c" → hex fragment of the payout uuid; null when not hex.
 * @param {string} q
 */
export function payoutIdSearchHex(q) {
  const t = q.trim().toLowerCase().replace(/^ci-?/, "").replace(/-/g, "");
  return /^[0-9a-f]{2,32}$/.test(t) ? t : null;
}
