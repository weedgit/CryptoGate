import { Link } from "react-router-dom";
import { DefaultUserAvatar } from "../../auth/DefaultUserAvatar";
import { OrgListPagination } from "../../platform/OrgListPagination";
import { merchantRoute } from "../../shared/portalRouting";
import type { CashierRow } from "./cashierRows";
import { UsdAmount } from "./UsdAmount";
import { usePagedRows } from "./usePagedRows";

type Props = {
  rows: CashierRow[];
  periodLabel: string;
  invoicesHref: (userId: string) => string;
};

function PersonAvatar({ src }: { src: string | null }) {
  return (
    <span className="merchant-dash-table__person" aria-hidden>
      {src ? <img src={src} alt="" draggable={false} /> : <DefaultUserAvatar />}
    </span>
  );
}

export function CashiersTable({ rows, periodLabel, invoicesHref }: Props) {
  const paged = usePagedRows(rows);
  if (rows.length === 0) return null;
  const showPin = rows.some((c) => c.posPin !== null);
  const missingPins = rows.filter((c) => c.posPin === false && !c.paused).length;
  return (
    <section
      className="merchant-dash-list merchant-dash-cashiers"
      aria-labelledby="merchant-dash-cashiers-title"
    >
      <header className="merchant-dash-list__head">
        <div className="overview-charts__heading">
          <h2 id="merchant-dash-cashiers-title" className="overview-charts__title">
            Cashiers
          </h2>
          <p className="overview-charts__subtitle">{`Sales by cashier · ${periodLabel}`}</p>
        </div>
        {missingPins > 0 ? (
          <Link className="merchant-dash-list__more is-warn" to={merchantRoute("settings/team")}>
            {missingPins} without POS PIN · Set in Team →
          </Link>
        ) : (
          <Link className="merchant-dash-list__more" to={merchantRoute("settings/team")}>
            Manage team →
          </Link>
        )}
      </header>
      <div className="merchant-dash-list__frame">
        <div className="merchant-dash-list__scroll">
          <table className="merchant-dash-table">
            <thead>
              <tr>
                <th>Cashier</th>
                <th className="is-num">Orders</th>
                <th className="is-num">Volume</th>
                {showPin ? <th className="is-end">POS PIN</th> : null}
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((c) => {
                const email = c.email ?? "—";
                const primary = c.name ?? email;
                return (
                  <tr key={c.key} className={c.paused ? "is-paused" : undefined}>
                    <td>
                      <span className="merchant-dash-table__who">
                        <PersonAvatar src={c.avatarUrl} />
                        <span className="merchant-dash-table__meta">
                          {c.userId ? (
                            <Link
                              className="merchant-dash-table__name"
                              to={invoicesHref(c.userId)}
                              title={c.email ?? undefined}
                            >
                              {primary}
                            </Link>
                          ) : (
                            <span className="merchant-dash-table__name" title={c.email ?? undefined}>
                              {primary}
                            </span>
                          )}
                          {c.name || c.paused ? (
                            <span className="merchant-dash-table__sub">
                              {c.name ? email : null}
                              {c.paused ? (
                                <span className="merchant-dash-table__tag">Paused</span>
                              ) : null}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="is-num">
                      <span className={c.count === 0 ? "merchant-dash-table__zero" : undefined}>
                        {c.count.toLocaleString()}
                      </span>
                    </td>
                    <td className="is-num">
                      <UsdAmount value={c.volumeUsd} />
                    </td>
                    {showPin ? (
                      <td className="is-end">
                        <span
                          className={`merchant-dash-table__pin${
                            c.posPin === true ? " is-on" : c.posPin === false ? " is-off" : ""
                          }`}
                        >
                          {c.posPin === true ? "Set" : c.posPin === false ? "Not set" : "N/A"}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
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
