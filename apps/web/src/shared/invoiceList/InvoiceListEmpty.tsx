import type { InvoiceStatusFilter } from "../invoiceListModel";

type Props = {
  gateMessage: string | null;
  statusFilter: InvoiceStatusFilter;
};

export function InvoiceListEmpty({ gateMessage, statusFilter }: Props) {
  return (
    <div className="invoice-list__empty" role="status">
      <p className="invoice-list__empty-title">
        {gateMessage ? "Select a scope" : "No invoices"}
      </p>
      <p className="invoice-list__empty-copy">
        {gateMessage ??
          (statusFilter === "payment_anomaly"
            ? "Nothing needs Attention. Try Open or clear filters."
            : "No invoices match these filters. Change period or filters.")}
      </p>
    </div>
  );
}
