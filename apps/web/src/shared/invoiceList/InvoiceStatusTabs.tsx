import {
  INVOICE_STATUS_CHIPS,
  type InvoiceStatusFilter,
} from "../invoiceListModel";
import { InvoiceStatusChipIcon } from "./InvoiceListIcons";

type Props = {
  statusFilter: InvoiceStatusFilter;
  setStatusFilter: (id: InvoiceStatusFilter) => void;
  showCount: boolean;
  total: number;
};

export function InvoiceStatusTabs({
  statusFilter,
  setStatusFilter,
  showCount,
  total,
}: Props) {
  return (
    <div
      className="invoice-list__status"
      role="tablist"
      aria-label="Invoice status"
    >
      {INVOICE_STATUS_CHIPS.map((chip) => (
        <button
          key={chip.id || "all"}
          type="button"
          role="tab"
          className={`invoice-list__chip${
            statusFilter === chip.id ? " is-active" : ""
          }`}
          onClick={() => setStatusFilter(chip.id)}
          aria-selected={statusFilter === chip.id}
        >
          <InvoiceStatusChipIcon id={chip.id} />
          <span className="invoice-list__chip-label">{chip.label}</span>
        </button>
      ))}
      {showCount ? (
        <span
          className="invoice-list__status-count"
          aria-live="polite"
          title={`${total.toLocaleString()} invoices`}
        >
          <span className="invoice-list__status-count-num">
            {total.toLocaleString()}
          </span>
          <span className="invoice-list__status-count-label">
            {total === 1 ? "invoice" : "invoices"}
          </span>
        </span>
      ) : null}
    </div>
  );
}
