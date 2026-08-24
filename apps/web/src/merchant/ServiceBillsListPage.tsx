import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  listServiceBills,
  type ServiceBill,
  type Session,
} from "./api";
import { formatShortTime } from "./orderStatus";
import {
  formatBillId,
  formatBillPeriod,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { sessionCanCheckoutServiceBill } from "./org";

type Filter = "all" | "overdue";

type Props = { session: Session };

export function ServiceBillsListPage({ session }: Props) {
  const navigate = useNavigate();
  const canPay = useMemo(() => sessionCanCheckoutServiceBill(session), [session]);
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<ServiceBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listServiceBills({
        status: filter === "overdue" ? "overdue" : undefined,
      });
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load service bills");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bills-page">
      <div className="bills-banner" role="note">
        Service bills pay for CryptoGate software. Customer payments go to your wallet
        separately.
      </div>

      <div className="orders-toolbar">
        <div className="filter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`filter-tab${filter === "all" ? " active" : ""}`}
            aria-selected={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            className={`filter-tab bills-filter-overdue${filter === "overdue" ? " active" : ""}`}
            aria-selected={filter === "overdue"}
            onClick={() => setFilter("overdue")}
          >
            Overdue
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading service bills…</p>
      ) : items.length === 0 ? (
        <div className="panel empty-orders">
          <h2>No service bills</h2>
          <p className="muted">
            Platform SaaS invoices appear here when issued. They are separate from
            payment orders.
          </p>
        </div>
      ) : (
        <div className="bills-table" role="table">
          <div className="bills-head" role="row">
            <span>BILL</span>
            <span>PERIOD</span>
            <span>SUBSCRIPTION</span>
            <span>VOLUME FEE</span>
            <span>TOTAL</span>
            <span>STATUS</span>
            <span>DUE</span>
            <span />
          </div>
          {items.map((b) => {
            const payable = b.status === "issued" || b.status === "overdue";
            return (
              <div key={b.id} className="bills-row" role="row">
                <button
                  type="button"
                  className="bills-row-main"
                  onClick={() => navigate(`/merchant/service-bills/${b.id}`)}
                >
                  <span className="mono">{formatBillId(b.id)}</span>
                  <span className="muted">{formatBillPeriod(b.periodStart, b.periodEnd)}</span>
                  <span>${b.subscriptionAmount}</span>
                  <span>${b.volumeFeeAmount}</span>
                  <span className="bills-total">
                    ${b.totalAmount} {b.currency}
                  </span>
                  <span>
                    <span className={`status-badge tone-${serviceBillStatusTone(b.status)}`}>
                      {serviceBillStatusLabel(b.status)}
                    </span>
                  </span>
                  <span className="muted">{formatShortTime(b.dueAt)}</span>
                </button>
                {canPay && payable ? (
                  <Link
                    className="btn-primary btn-inline btn-tiny"
                    to={`/merchant/service-bills/${b.id}`}
                    state={{ openCheckout: true }}
                  >
                    Pay
                  </Link>
                ) : (
                  <span className="muted bills-pay-dash">—</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
