import { PagePending } from "../ui/PlatformPending";
import { CommissionsBulkBar } from "./CommissionsBulkBar";
import { OpenInvoicesTable } from "./OpenInvoicesTable";
import type { CommissionsData } from "./useCommissionsData";

export function OpenInvoicesPane({ data }: { data: CommissionsData }) {
  const {
    loading,
    viewEmpty,
    noMatches,
    statusFilter,
    debouncedQuery,
    query,
    canBulkPay,
    selectedIds,
    clearSelection,
    setBulkError,
    setBulkOpen,
    rows,
  } = data;
  return (
    <>
      {loading ? <PagePending /> : null}

      {viewEmpty && statusFilter === "all" ? (
        <div className="plat-commissions__empty" role="status">
          <p className="plat-commissions__empty-title">
            No invoices yet
          </p>
          <p className="plat-commissions__empty-copy">
            New invoices appear automatically on the agent pay day.
          </p>
        </div>
      ) : null}

      {noMatches || (viewEmpty && statusFilter !== "all") ? (
        <div className="plat-commissions__empty" role="status">
          <p className="plat-commissions__empty-title">
            {debouncedQuery
              ? "No matches"
              : statusFilter === "issued"
                ? "No issued invoices"
                : statusFilter === "paid"
                  ? "Nothing awaiting"
                  : "No invoices"}
          </p>
          <p className="plat-commissions__empty-copy">
            {debouncedQuery
              ? `Nothing matched “${query.trim()}”.`
              : statusFilter === "issued"
                ? "Nothing waiting to remit."
                : statusFilter === "paid"
                  ? "No paid invoices awaiting agent confirmation."
                  : "Try another filter."}
          </p>
        </div>
      ) : null}

      {canBulkPay && selectedIds.size > 0 ? (
        <CommissionsBulkBar
          count={selectedIds.size}
          onClear={clearSelection}
          onConfirmPay={() => {
            setBulkError(null);
            setBulkOpen(true);
          }}
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <OpenInvoicesTable
          rows={rows}
          canBulkPay={canBulkPay}
          issuedOnPage={data.issuedOnPage}
          selectedIds={selectedIds}
          toggleSelected={data.toggleSelected}
          invoiceSort={data.invoiceSort}
          onInvoiceSort={data.onInvoiceSort}
          portal={data.portal}
          route={data.route}
          orgIcons={data.orgIcons}
          openInvoice={data.openInvoice}
        />
      ) : null}
    </>
  );
}
