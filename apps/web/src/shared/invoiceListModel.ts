/** Shared Invoice list model — periods, status chips, role defaults. */

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

/** Local calendar date → `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
 * Browser-local period → ISO createdFrom / createdTo (inclusive end ≈ now for open-ended).
 * `utcDays` reads custom From/To as UTC calendar days instead.
 */
export function periodToRange(
  period: InvoicePeriodId,
  customFrom?: string,
  customTo?: string,
  utcDays = false,
): { createdFrom?: string; createdTo?: string } {
  const now = new Date();
  const end = new Date(now);
  if (period === "all") return {};
  if (period === "custom") {
    const zone = utcDays ? "Z" : "";
    const from = customFrom?.trim()
      ? new Date(`${customFrom}T00:00:00${zone}`)
      : null;
    const to = customTo?.trim() ? new Date(`${customTo}T23:59:59.999${zone}`) : null;
    return {
      createdFrom: from && !Number.isNaN(from.getTime()) ? from.toISOString() : undefined,
      createdTo: to && !Number.isNaN(to.getTime()) ? to.toISOString() : undefined,
    };
  }
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { createdFrom: start.toISOString(), createdTo: end.toISOString() };
  }
  if (period === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { createdFrom: start.toISOString(), createdTo: end.toISOString() };
  }
  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { createdFrom: start.toISOString(), createdTo: last.toISOString() };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { createdFrom: start.toISOString(), createdTo: end.toISOString() };
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatInvoiceCreatedDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatInvoiceCreatedTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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
