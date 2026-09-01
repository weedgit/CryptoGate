import { Link } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";

type Props = {
  area?: string;
};

export function CashierForbiddenPage({ area = "this area" }: Props) {
  return (
    <div className="merchant-access-gate">
      <div className="portal-access-gate__card" role="alert">
        <div className="portal-access-gate__head">
          <div className="portal-access-gate__mark" aria-hidden>
            <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
              <path
                d="M24 6 10 12v10c0 8.5 5.8 16.4 14 18 8.2-1.6 14-9.5 14-18V12L24 6Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M18 24h12M24 18v12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.55"
              />
            </svg>
          </div>
          <h2 className="portal-access-gate__title">Access restricted</h2>
        </div>
        <p className="portal-access-gate__copy">
          Cashiers cannot access {area}. Settlement, matching mode, fees, service bills,
          reports, sites, team, and API settings require Owner or Administrator access.
        </p>
        <ul className="portal-access-gate__roles" aria-label="Allowed roles">
          <li>
            <span className="portal-access-gate__role-pill">Owner</span>
          </li>
          <li>
            <span className="portal-access-gate__role-pill">Administrator</span>
          </li>
        </ul>
        <div className="portal-access-gate__actions">
          <Link className="btn-primary portal-access-gate__btn" to={merchantRoute()}>
            Back to dashboard
          </Link>
          <Link className="btn-secondary portal-access-gate__btn" to={merchantRoute("orders")}>
            My orders
          </Link>
        </div>
      </div>
    </div>
  );
}
