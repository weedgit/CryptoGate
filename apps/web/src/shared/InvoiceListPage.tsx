import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import type { Session } from "../merchant/api";
import { OrgListPagination } from "../platform/OrgListPagination";
import { PagePending } from "../platform/ui/PlatformPending";
import { TopbarSearch } from "./TopbarSearch";
import { INVOICE_PAGE_SIZE, type InvoiceListVariant } from "./invoiceListModel";
import { InvoiceAssetStrip } from "./invoiceList/InvoiceAssetStrip";
import { InvoiceFiltersPanel } from "./invoiceList/InvoiceFiltersPanel";
import { InvoiceListEmpty } from "./invoiceList/InvoiceListEmpty";
import { InvoiceListHeader } from "./invoiceList/InvoiceListHeader";
import { InvoiceStatusTabs } from "./invoiceList/InvoiceStatusTabs";
import { InvoiceTable } from "./invoiceList/InvoiceTable";
import { useInvoiceListData } from "./invoiceList/useInvoiceListData";
import { usePageRefresh } from "./pageRefresh";

type Props = {
  session: Session;
  variant: InvoiceListVariant;
};

export function InvoiceListPage({ session, variant }: Props) {
  const list = useInvoiceListData(session, variant);
  usePageRefresh(list.load);
  const {
    canExport,
    statusFilter,
    exportJob,
    orders,
    total,
    loading,
    refreshing,
    hasLoaded,
    gateMessage,
    topbarSlot,
  } = list;

  const showEmpty = !loading && (gateMessage || orders.length === 0);

  return (
    <div className={`invoice-list invoice-list--${variant}${refreshing ? " is-refreshing" : ""}`}>
      <AuthToast message={list.error} tone="error" onDismiss={list.dismissToast} />
      <AuthToast message={list.okToast} tone="ok" onDismiss={list.dismissToast} />

      {topbarSlot
        ? createPortal(
            <TopbarSearch
              placeholder="Search Invoice #, id, or reference"
              aria-label="Search invoices"
              value={list.query}
              onChange={list.setQuery}
              onEnter={(q) => list.setDebouncedQ(q)}
            />,
            topbarSlot,
          )
        : null}

      {refreshing ? (
        <div className="invoice-list__progress" aria-hidden />
      ) : null}

      <InvoiceListHeader
        summary={list.summary}
        canExport={canExport}
        canCreate={list.canCreate}
        needsScopeGate={list.needsScopeGate}
        total={total}
        exportJob={exportJob}
        exportBusy={list.exportBusy}
        exportHref={list.exportHref}
        requestAsyncExport={list.requestAsyncExport}
      />

      <InvoiceAssetStrip byAsset={list.summary.byAsset} />

      {exportJob?.status === "failed" && exportJob.error ? (
        <p className="invoice-list__export-error" role="alert">
          Export failed: {exportJob.error}
        </p>
      ) : null}

      <div className="invoice-list__workspace">
        <InvoiceFiltersPanel
          variant={variant}
          cashierOnly={list.cashierOnly}
          period={list.period}
          periodSelectOptions={list.periodSelectOptions}
          applyPeriod={list.applyPeriod}
          utcDays={list.utcDays}
          customFrom={list.customFrom}
          customTo={list.customTo}
          onFromChange={list.onFromChange}
          onToChange={list.onToChange}
          agents={list.agents}
          agentFilter={list.agentFilter}
          setAgentFilter={list.setAgentFilter}
          merchants={list.merchants}
          merchantFilter={list.merchantFilter}
          setMerchantFilter={list.setMerchantFilter}
          sitesForSelect={list.sitesForSelect}
          siteFilter={list.siteFilter}
          setSiteFilter={list.setSiteFilter}
          cashiers={list.cashiers}
          cashierOrgId={list.cashierOrgId}
          cashierFilter={list.cashierFilter}
          setCashierFilter={list.setCashierFilter}
          assetFilter={list.assetFilter}
          setAssetFilter={list.setAssetFilter}
          networkFilter={list.networkFilter}
          setNetworkFilter={list.setNetworkFilter}
          channelFilter={list.channelFilter}
          setChannelFilter={list.setChannelFilter}
          resetFilters={list.resetFilters}
        />

        <div className="invoice-list__main">
          <InvoiceStatusTabs
            statusFilter={statusFilter}
            setStatusFilter={list.setStatusFilter}
            showCount={!gateMessage && !loading}
            total={total}
          />

          {canExport && total > 5000 ? (
            <p className="invoice-list__summary-hint">
              Narrow filters or Request export for CSV
            </p>
          ) : null}

          <div className="invoice-list__table-wrap">
            {loading && !hasLoaded ? <PagePending /> : null}

            {showEmpty ? (
              <InvoiceListEmpty gateMessage={gateMessage} statusFilter={statusFilter} />
            ) : null}

            {!loading && !gateMessage && orders.length > 0 ? (
              <InvoiceTable
                variant={variant}
                orders={orders}
                orgById={list.orgById}
                userNameById={list.userNameById}
                userAvatarById={list.userAvatarById}
                nowMs={list.nowMs}
                orderHref={list.orderHref}
              />
            ) : null}
          </div>

          {!loading && !gateMessage && total > 0 ? (
            <OrgListPagination
              page={list.page}
              pageCount={list.pageCount}
              total={total}
              pageSize={INVOICE_PAGE_SIZE}
              onPageChange={list.setPage}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
