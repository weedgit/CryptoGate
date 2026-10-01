/** Shared Invoice list model — periods, status chips, role defaults. */
import {
  addDaysYmd,
  formatInZone,
  zonedEndOfDay,
  zonedStartOfDay,
  zonedYmd,
} from "./dateTime";

export type InvoiceListVariant = "platform" | "merchant" | "cashier";

export type InvoiceStatusFilter =
  | "payment_anomaly"
  | "open"
  | "completed"
  | "closed"
  | "";

export type InvoicePeriodId =
  | "today"
  | "7d"
  | "this_month"
  | "last_month"
  | "30d"
  | "90d"
  | "all"
  | "custom";

export const INVOICE_STATUS_CHIPS: {
  id: InvoiceStatusFilter;
  label: string;
}[] = [
  { id: "", label: "All" },
  { id: "payment_anomaly", label: "Attention" },
  { id: "open", label: "Open" },
  { id: "completed", label: "Completed" },
  { id: "closed", label: "Closed" },
];

export const INVOICE_PERIOD_OPTIONS: {
  id: InvoicePeriodId;
  label: string;
}[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

export const INVOICE_PAGE_SIZE = 25;

export function isOpenTriageStatus(status: InvoiceStatusFilter): boolean {
  return status === "payment_anomaly" || status === "open";
}

/** Calendar date in the viewer's zone → `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInputValue(d: Date): string {
  return zonedYmd(d);
}

/** Named period → From/To date-input values (empty for All / Custom). */
export function periodToDateInputs(period: InvoicePeriodId): {
  from: string;
  to: string;
} {
  if (period === "all" || period === "custom") return { from: "", to: "" };
  const range = periodToRange(period);
  return {
    from: range.createdFrom ? toDateInputValue(new Date(range.createdFrom)) : "",
    to: range.createdTo ? toDateInputValue(new Date(range.createdTo)) : "",
  };
}

/**
 * Period in the viewer's zone → ISO createdFrom / createdTo (inclusive end ≈ now for open-ended).
 * `utcDays` reads custom From/To as UTC calendar days instead.
 */
export function periodToRange(
  period: InvoicePeriodId,
  customFrom?: string,
  customTo?: string,
  utcDays = false,
): { createdFrom?: string; createdTo?: string } {
  const now = new Date();
  if (period === "all") return {};
  if (period === "custom") {
    const zone = utcDays ? "UTC" : undefined;
    const valid = (v?: string) => Boolean(v?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()));
    return {
      createdFrom: valid(customFrom) ? zonedStartOfDay(customFrom!.trim(), zone).toISOString() : undefined,
      createdTo: valid(customTo) ? zonedEndOfDay(customTo!.trim(), zone).toISOString() : undefined,
    };
  }
  const today = zonedYmd(now);
  const nowIso = now.toISOString();
  if (period === "today") {
    return { createdFrom: zonedStartOfDay(today).toISOString(), createdTo: nowIso };
  }
  if (period === "this_month") {
    return { createdFrom: zonedStartOfDay(`${today.slice(0, 8)}01`).toISOString(), createdTo: nowIso };
  }
  if (period === "last_month") {
    const firstThis = `${today.slice(0, 8)}01`;
    const lastPrev = addDaysYmd(firstThis, -1);
    return {
      createdFrom: zonedStartOfDay(`${lastPrev.slice(0, 8)}01`).toISOString(),
      createdTo: zonedEndOfDay(lastPrev).toISOString(),
    };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { createdFrom: start.toISOString(), createdTo: nowIso };
}

export type InvoiceRoleDefaults = {
  status: InvoiceStatusFilter;
  period: InvoicePeriodId;
};

export function invoiceDefaultsForSession(
  variant: InvoiceListVariant,
  session: {
    memberships: { orgType?: string | null; role: string }[];
  },
): InvoiceRoleDefaults {
  if (variant === "cashier") {
    return { status: "open", period: "today" };
  }
  const platformMem = session.memberships.find((m) => m.orgType === "platform");
  const merchantMem = session.memberships.find(
    (m) => m.orgType === "merchant" || m.orgType === "merchant_site",
  );
  if (variant === "platform") {
    if (platformMem?.role === "viewer") {
      return { status: "completed", period: "this_month" };
    }
    return { status: "payment_anomaly", period: "30d" };
  }
  // merchant
  if (merchantMem?.role === "viewer" || (!merchantMem && platformMem?.role === "viewer")) {
    return { status: "completed", period: "this_month" };
  }
  return { status: "open", period: "all" };
}

export function formatInvoiceWhen(iso: string | undefined): string {
  if (!iso) return "—";
  return formatInZone(iso, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatInvoiceCreatedDate(iso: string | undefined): string {
  if (!iso) return "—";
  return formatInZone(iso, { month: "short", day: "numeric", year: "numeric" });
}

export function formatInvoiceCreatedTime(iso: string | undefined): string {
  if (!iso) return "";
  const text = formatInZone(iso, { hour: "numeric", minute: "2-digit" });
  return text === "—" ? "" : text;
}

/** "10.500000" → "10.50", "0.00123400" → "0.001234" — at least 2 decimals, trailing zeros trimmed. */
export function formatCryptoAmount(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return "—";
  const [whole, frac = ""] = s.split(".");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${trimmed}`;
}

/** USD per 1 unit of the asset: 2 decimals from $1, up to 6 significant below $1. */
export function formatFundRate(raw: string | null | undefined): string | null {
  const n = Number(raw);
  if (raw == null || raw === "" || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1) {
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return `$${n.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
}

/**
 * Locked pricing rate, else market rate, else the effective rate
 * (invoice USD ÷ crypto payable) for orders created before rates were stored.
 */
export function invoiceFundRate(order: {
  pricingRate?: string | null;
  marketRate?: string | null;
  invoiceAmountUsd?: string | null;
  payableAmount: { amount: string };
}): string | null {
  const stored = formatFundRate(order.pricingRate ?? order.marketRate);
  if (stored) return stored;
  const usd = Number(order.invoiceAmountUsd);
  const crypto = Number(order.payableAmount.amount);
  if (!Number.isFinite(usd) || !Number.isFinite(crypto) || usd <= 0 || crypto <= 0) return null;
  return formatFundRate(String(usd / crypto));
}

const PRICING_MODE_LABEL: Record<string, string> = {
  pegged_1to1: "Pegged 1:1",
  market: "Market rate",
};

const STABLE_ASSETS = new Set(["USDT", "USDC"]);

export type InvoiceConversion = {
  cryptoLabel: string;
  unit: string;
  /** "$10.00 ÷ $1.00" — invoice USD ÷ fund rate. */
  formula: string | null;
  /** "$1.00" — USD per 1 unit of the asset. */
  rateLabel: string | null;
  evidence: {
    kind: "quote" | "peg" | "derived";
    label: string;
    /** Short second line: source and when, or how the rate was derived. */
    meta: string;
    /** Multi-line detail for the hover card. */
    detail: string[];
  };
};

function usd2(raw: string | null | undefined): string | null {
  const n = Number(raw);
  if (raw == null || raw === "" || !Number.isFinite(n)) return null;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * How the crypto payable was reached from the invoice USD, and what backs the rate:
 * a stored quote, a 1:1 stablecoin peg, or (older orders) USD ÷ crypto.
 */
export function invoiceConversion(order: {
  asset: string;
  pricingRate?: string | null;
  marketRate?: string | null;
  pricingMode?: string | null;
  rateSource?: string | null;
  rateFetchedAt?: string | null;
  createdAt?: string;
  invoiceAmountUsd?: string | null;
  payableAmount: { amount: string; currency?: string };
}): InvoiceConversion {
  const unit = order.payableAmount.currency || order.asset;
  const cryptoLabel = formatCryptoAmount(order.payableAmount.amount);
  const rate = invoiceFundRate(order);
  const usd = usd2(order.invoiceAmountUsd);
  const formula = usd && rate ? `${usd} ÷ ${rate}` : null;
  const modeLabel = order.pricingMode ? (PRICING_MODE_LABEL[order.pricingMode] ?? order.pricingMode) : null;
  const when = formatInvoiceWhen(order.rateFetchedAt ?? order.createdAt);
  const exact = `${usd ?? "—"} ÷ ${rate ?? "—"} per ${order.asset} = ${cryptoLabel} ${unit}`;
  const stored = formatFundRate(order.pricingRate);
  const market = formatFundRate(order.marketRate);

  if (stored) {
    const pegged = order.pricingMode === "pegged_1to1";
    const source = order.rateSource?.trim() || null;
    const label = pegged ? "Pegged 1:1" : source ? `Quote · ${source}` : "Locked at creation";
    const detail = [exact, `Rate ${stored} per ${order.asset}${modeLabel ? ` · ${modeLabel}` : ""}`];
    if (source) detail.push(`Source: ${source}`);
    if (market && market !== stored) detail.push(`Market rate ${market} at quote time`);
    detail.push(`Locked ${when}`);
    const meta = source && !pegged ? `${source} · ${when}` : `Locked ${when}`;
    return {
      cryptoLabel,
      unit,
      formula,
      rateLabel: rate,
      evidence: { kind: pegged ? "peg" : "quote", label, meta, detail },
    };
  }

  const stable = STABLE_ASSETS.has(order.asset.toUpperCase()) && rate === "$1.00";
  return {
    cryptoLabel,
    unit,
    formula,
    rateLabel: rate,
    evidence: stable
      ? {
          kind: "peg",
          label: "Stablecoin 1:1",
          meta: "No quote stored",
          detail: [exact, `${order.asset} priced 1:1 to USD`, `Created ${when}`],
        }
      : {
          kind: "derived",
          label: "From invoice amount",
          meta: "USD ÷ crypto amount",
          detail: [exact, "No rate quote stored for this order", `Created ${when}`],
        },
  };
}

/** Max span for unscoped platform history (Completed / Closed). */
export const PLATFORM_HISTORY_MAX_DAYS = 31;
/** Tighter cap when status is All (heaviest scan) without merchant/site. */
export const PLATFORM_ALL_STATUS_MAX_DAYS = 7;

/**
 * Platform-wide (no merchant/site) interactive history gates — open triage skips.
 * Returns a gate message when the browse should not run.
 */
export function platformUnscopedHistoryGate(opts: {
  status: InvoiceStatusFilter;
  period: InvoicePeriodId;
  createdFrom?: string;
  createdTo?: string;
}): string | null {
  if (isOpenTriageStatus(opts.status)) return null;

  const maxDays =
    opts.status === "" ? PLATFORM_ALL_STATUS_MAX_DAYS : PLATFORM_HISTORY_MAX_DAYS;
  const maxMs = maxDays * 24 * 60 * 60 * 1000;

  if (opts.period === "all" || opts.period === "90d") {
    return opts.status === ""
      ? `Platform-wide All is limited to ${PLATFORM_ALL_STATUS_MAX_DAYS} days. Pick a merchant/site for longer ranges, or use Export.`
      : `Select a merchant or site, or choose a shorter period (max ${PLATFORM_HISTORY_MAX_DAYS} days) to browse history.`;
  }

  if (opts.period === "custom") {
    if (!opts.createdFrom || !opts.createdTo) {
      return "Set a custom date range, or pick a merchant/site.";
    }
    const span =
      Date.parse(opts.createdTo) - Date.parse(opts.createdFrom);
    if (!Number.isFinite(span) || span > maxMs) {
      return opts.status === ""
        ? `Platform-wide All custom range max is ${PLATFORM_ALL_STATUS_MAX_DAYS} days. Pick a merchant/site for longer archives.`
        : `Custom range max is ${PLATFORM_HISTORY_MAX_DAYS} days without a merchant/site.`;
    }
    return null;
  }

  // Named periods: this_month / last_month / 30d can exceed 7d — block for All status.
  if (opts.status === "") {
    if (
      opts.period === "this_month" ||
      opts.period === "last_month" ||
      opts.period === "30d"
    ) {
      return `Platform-wide All is limited to ${PLATFORM_ALL_STATUS_MAX_DAYS} days (Today or Last 7 days). Pick a merchant/site for month/30d views.`;
    }
  }

  return null;
}

/** Period options disabled on platform when unscoped (no merchant/site). */
export function platformUnscopedPeriodDisabled(
  status: InvoiceStatusFilter,
  periodId: InvoicePeriodId,
): boolean {
  if (isOpenTriageStatus(status)) return false;
  if (periodId === "all" || periodId === "90d") return true;
  if (status === "") {
    return (
      periodId === "this_month" ||
      periodId === "last_month" ||
      periodId === "30d"
    );
  }
  return false;
}
