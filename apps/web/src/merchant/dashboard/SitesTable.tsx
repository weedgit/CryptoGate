import { Link } from "react-router-dom";
import { OrgListPagination } from "../../platform/OrgListPagination";
import { OrgBrandMark } from "../../shared/OrgBrandMark";
import { merchantRoute } from "../../shared/portalRouting";
import { UsdAmount } from "./UsdAmount";
import { usePagedRows } from "./usePagedRows";
import { ChartHelpButton } from "../../platform/ui/ChartHelpButton";
import { CARD_HELP } from "../cardHelp";

export type SiteRow = {
  id: string;
  name: string;
  iconKey?: string | null;
  orders: number;
  volume: number;
  anomalies: number;
};

type Props = {
  rows: SiteRow[];
  periodLabel?: string;
};

export function SitesTable({ rows, periodLabel }: Props) {
  const paged = usePagedRows(rows);
  if (rows.length === 0) return null;
  return (
    <section className="merchant-dash-list merchant-dash-sites" aria-labelledby="merchant-dash-sites-title">
      <header className="merchant-dash-list__head">
        <div className="overview-charts__heading">
          <h2 id="merchant-dash-sites-title" className="overview-charts__title">
            Sites
            <ChartHelpButton openOnHover label="About sites" text={CARD_HELP.sites} />
          </h2>
          <p className="overview-charts__subtitle">
            {periodLabel ? `Orders and volume by site · ${periodLabel}` : "Orders and volume by site"}
          </p>
        </div>
        <Link className="merchant-dash-list__more" to={merchantRoute("sites")}>
          View sites →
        </Link>
      </header>
      <div className="merchant-dash-list__frame">
        <div className="merchant-dash-list__scroll">
          <table className="merchant-dash-table">
            <thead>
              <tr>
                <th>Site</th>
                <th className="is-num">Orders</th>
                <th className="is-num">Volume</th>
                <th className="is-end">Anomalies</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="merchant-dash-table__who">
                      <OrgBrandMark
                        name={s.name}
                        iconKey={s.iconKey ?? null}
                        size={32}
                        className="merchant-dash-table__avatar"
                      />
                      <Link
                        className="merchant-dash-table__name"
                        to={merchantRoute(`sites/${encodeURIComponent(s.id)}`)}
                      >
                        {s.name}
                      </Link>
                    </span>
                  </td>
                  <td className="is-num">
                    <span className={s.orders === 0 ? "merchant-dash-table__zero" : undefined}>
                      {s.orders.toLocaleString()}
                    </span>
                  </td>
                  <td className="is-num">
                    <UsdAmount value={s.volume} />
                  </td>
                  <td className="is-end">
                    {s.anomalies > 0 ? (
                      <span className="merchant-dash-table__flag is-danger">{s.anomalies}</span>
                    ) : (
                      <span className="merchant-dash-table__flag is-clear">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <OrgListPagination
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          pageSize={paged.pageSize}
          onPageChange={paged.setPage}
        />
      </div>
    </section>
  );
}
