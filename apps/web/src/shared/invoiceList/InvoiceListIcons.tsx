import type { InvoiceStatusFilter } from "../invoiceListModel";

export function InvoiceStatusChipIcon({ id }: { id: InvoiceStatusFilter }) {
  const props = {
    className: "invoice-list__chip-icon",
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (id === "payment_anomaly") {
    return (
      <svg {...props}>
        <path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (id === "open") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (id === "completed") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
    );
  }
  if (id === "closed") {
    return (
      <svg {...props}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 12h6" />
      </svg>
    );
  }
  // All
  return (
    <svg {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

const ACTION_ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function PlusIcon() {
  return (
    <svg {...ACTION_ICON}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...ACTION_ICON}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg {...ACTION_ICON}>
      <path d="M20 11a8 8 0 0 0-14.9-3.5" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3.5" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}
