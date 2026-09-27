import {
  parseOptionalDateWindow,
  safeNumericSql,
} from "../dashboard/dashboard-range.mjs";

/** UI status buckets (partition: open activation bills live under "activation" only). */
export const SERVICE_BILL_BUCKETS = Object.freeze([
  "all",
  "issued",
  "overdue",
  "unpaid",
  "draft",
  "activation",
  "paid",
  "voided",
  "cancelled",
  // Merchant portal: every bill still to pay (incl. drafts / activation), any overdue.
  "open",
  "late",
]);

export const SERVICE_BILL_SORTS = Object.freeze({
  billId: "id",
  merchant:
    "(SELECT lower(o.name) FROM org_accounts o WHERE o.id = service_bills.org_id)",
  billedVolume: safeNumericSql("COALESCE(billed_volume_usd, '0')"),
  total: safeNumericSql("total_amount"),
  dueDate: "due_at",
  status: "status",
  period: "period_start",
  activationFirst: "activationFirst",
});

export const OPEN_ACTIVATION_SQL =
  "(bill_kind = 'activation' AND status NOT IN ('paid', 'voided', 'cancelled'))";

/**
 * @param {string} bucket
 * @returns {string | null} SQL predicate on service_bills (unaliased), null = no filter
 */
export function bucketPredicateSql(bucket) {
  switch (bucket) {
    case "activation":
      return OPEN_ACTIVATION_SQL;
    case "draft":
      return `(status = 'draft' AND NOT ${OPEN_ACTIVATION_SQL})`;
    case "unpaid":
      return `(status IN ('issued', 'overdue') AND NOT ${OPEN_ACTIVATION_SQL})`;
    case "issued":
      return `(status = 'issued' AND NOT ${OPEN_ACTIVATION_SQL})`;
    case "overdue":
      return `(status = 'overdue' AND NOT ${OPEN_ACTIVATION_SQL})`;
    case "open":
      return "(status IN ('draft', 'issued', 'overdue'))";
    case "late":
      return "(status = 'overdue')";
    case "paid":
    case "voided":
    case "cancelled":
      return `(status = '${bucket}')`;
    default:
      return null;
  }
}

/** @param {string} s */
export function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * "SB-1A2B3C4D", "1a2b-3c" → hex fragment of the bill uuid; null when not hex.
 * @param {string} q
 */
export function billIdSearchHex(q) {
  const t = q.trim().toLowerCase().replace(/^sb-?/, "").replace(/-/g, "");
  return /^[0-9a-f]{2,32}$/.test(t) ? t : null;
}

/** Due or created on a selected local day; open issued / overdue bills always stay visible. */
export const parseServiceBillWindow = parseOptionalDateWindow;

/**
 * @param {URLSearchParams} sp
 * @returns {{ ok: true, query: { bucket: string, window: { from: string, to: string, tz: string } | null, q: string, sort: string, dir: "asc" | "desc" } } | { ok: false, message: string }}
 */
export function parseServiceBillListQuery(sp) {
  const bucket = sp.get("bucket")?.trim() || "all";
  if (!SERVICE_BILL_BUCKETS.includes(bucket)) {
    return { ok: false, message: "Invalid bucket" };
  }
  const win = parseServiceBillWindow(sp);
  if (!win.ok) return win;
  const q = (sp.get("q") ?? "").trim().slice(0, 120);
  const sort = sp.get("sort")?.trim() || "dueDate";
  if (!Object.hasOwn(SERVICE_BILL_SORTS, sort)) {
    return { ok: false, message: "Invalid sort" };
  }
  const dirRaw = sp.get("dir")?.trim() || "desc";
  if (dirRaw !== "asc" && dirRaw !== "desc") {
    return { ok: false, message: "dir must be asc or desc" };
  }
  return { ok: true, query: { bucket, window: win.window, q, sort, dir: dirRaw } };
}
