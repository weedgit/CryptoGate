import { Navigate } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import type { Session } from "./api";
import { OrgListPagination } from "./OrgListPagination";
import { CommissionsPeriodBar } from "./commissions/CommissionsPeriodBar";
import { CommissionsStatusRail } from "./commissions/CommissionsStatusRail";
import { CommissionsTopbarSearch } from "./commissions/CommissionsTopbarSearch";
import { OpenInvoicesPane } from "./commissions/OpenInvoicesPane";
import { SettledPayoutsPane } from "./commissions/SettledPayoutsPane";
import { PAGE_SIZE } from "./commissions/commissionsShared";
import { useCommissionsData } from "./commissions/useCommissionsData";
import { usePageRefresh } from "../shared/pageRefresh";

type Props = { session: Session };

/** B12 — Platform → agent monthly commission invoices & payout history. */
export function PlatformCommissionsPage({ session }: Props) {
  const data = useCommissionsData(session);
  usePageRefresh(data.load);
  const {
    portal,
    route,
    canPay,
    error,
    okMessage,
    dismissToast,
    deepLinkId,
    showOpenInvoices,
    loading,
    total,
    page,
    pageCount,
    setPage,
  } = data;

  if (deepLinkId) {
    return (
      <Navigate
        to={route(`commissions/${deepLinkId}`)}
        replace
      />
    );
  }

  return (
    <div className="plat-bills plat-commissions">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />
      <AuthToast message={okMessage} tone="ok" onDismiss={dismissToast} />

      <CommissionsPeriodBar
        isPortal={Boolean(portal)}
        canPay={canPay}
        generatePeriod={data.generatePeriod}
        onGeneratePeriodChange={data.setGeneratePeriod}
        busy={data.busy}
        onGenerate={() => void data.onGenerateInvoices()}
      />

      <CommissionsTopbarSearch
        slot={data.topbarSlot}
        inputId={data.searchInputId}
        query={data.query}
        onQueryChange={data.setQuery}
      />

      <div className="plat-bills__panel">
        <CommissionsStatusRail
          statusFilter={data.statusFilter}
          statusCounts={data.statusCounts}
          onSelect={data.selectStatus}
          isPortal={Boolean(portal)}
          billingCalendar={data.billingCalendar}
          lastAutoRun={data.lastAutoRun}
        />

        <div className="plat-bills__main">
          <div className="plat-bills__table-wrap">
            <div className="plat-bills__table-scroll">
            {showOpenInvoices ? (
              <OpenInvoicesPane data={data} />
            ) : (
              <SettledPayoutsPane data={data} />
            )}
            </div>
            {!loading && total > 0 ? (
              <OrgListPagination
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
