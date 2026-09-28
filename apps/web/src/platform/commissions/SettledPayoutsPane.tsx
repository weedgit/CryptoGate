import { PagePending } from "../ui/PlatformPending";
import { SettledPayoutsTable } from "./SettledPayoutsTable";
import type { CommissionsData } from "./useCommissionsData";

export function SettledPayoutsPane({ data }: { data: CommissionsData }) {
  const { loading, viewEmpty, noMatches, query, rows } = data;
  return (
    <>
      {loading ? <PagePending /> : null}
      {viewEmpty ? (
        <div className="plat-commissions__empty" role="status">
          <p className="plat-commissions__empty-title">
            No settled payouts
          </p>
          <p className="plat-commissions__empty-copy">
            Appear here after the agent confirms receipt.
          </p>
        </div>
      ) : null}
      {noMatches ? (
        <div className="plat-commissions__empty" role="status">
          <p className="plat-commissions__empty-title">No matches</p>
          <p className="plat-commissions__empty-copy">
            Nothing matched “{query.trim()}”.
          </p>
        </div>
      ) : null}
      {!loading && rows.length > 0 ? (
        <SettledPayoutsTable
          rows={rows}
          historySort={data.historySort}
          onHistorySort={data.onHistorySort}
          portal={data.portal}
          route={data.route}
          orgIcons={data.orgIcons}
          openInvoice={data.openInvoice}
        />
      ) : null}
    </>
  );
}
