import { Link } from "react-router-dom";

type Props = {
  area?: string;
};

export function CashierForbiddenPage({ area = "this area" }: Props) {
  return (
    <div className="panel cashier-forbidden">
      <h2>Access restricted</h2>
      <p className="muted">
        Cashiers cannot access {area}. Settlement, matching mode, fees, service
        bills, reports, sites, team, and API settings require Owner or
        Administrator access.
      </p>
      <p>
        <Link to="/merchant" style={{ color: "var(--teal)" }}>
          ← Back to cashier dashboard
        </Link>
      </p>
    </div>
  );
}
