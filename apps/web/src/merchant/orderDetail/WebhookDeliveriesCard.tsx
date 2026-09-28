import { formatShortTime } from "../orderStatus";
import type { OrderWebhookRow } from "./useOrderWebhookDeliveries";

type Props = {
  rows: OrderWebhookRow[];
  msg: string | null;
  busy: boolean;
  canResend: boolean;
  onResend: (row: OrderWebhookRow) => void;
};

export function WebhookDeliveriesCard({
  rows,
  msg,
  busy,
  canResend,
  onResend,
}: Props) {
  return (
    <section className="plat-settings__card order-detail-aside-card order-detail-webhooks-card no-print">
      <div className="plat-settings__card-head">
        <h2 className="plat-settings__card-title">Webhook deliveries</h2>
      </div>
      <div className="plat-settings__card-body">
        {msg ? (
          <p className="plat-settings__card-note" role="status">
            {msg}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="muted">No webhook deliveries recorded for this order yet.</p>
        ) : (
          <div className="delivery-table">
            <div className="delivery-head">
              <span>EVENT</span>
              <span>STATUS</span>
              <span>HTTP</span>
              <span>ATTEMPT</span>
              <span>TIME</span>
              {canResend ? <span /> : null}
            </div>
            {rows.map((d) => (
              <div key={d.id} className="delivery-row">
                <span className="mono">{d.eventType}</span>
                <span>{d.status}</span>
                <span>{d.responseStatus ?? d.httpStatus ?? "—"}</span>
                <span>{d.attempt}</span>
                <span className="muted">
                  {formatShortTime(d.deliveredAt ?? d.createdAt)}
                </span>
                {canResend ? (
                  <button
                    type="button"
                    className="btn-ghost btn-tiny"
                    disabled={
                      busy ||
                      (d.status !== "failed" && d.status !== "success")
                    }
                    onClick={() => onResend(d)}
                  >
                    Resend
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
