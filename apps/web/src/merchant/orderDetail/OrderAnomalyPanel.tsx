import type { PaymentOrder } from "../api";
import { formatShortTime } from "../orderStatus";
import { AssetIcon } from "../../platform/cryptoIcons";
import type { OrderDetailView } from "./orderDetailView";

type Props = {
  order: PaymentOrder | null;
  view: OrderDetailView;
  isPlatform: boolean;
  showResolve: boolean;
  resolveNote: string;
  onResolveNoteChange: (value: string) => void;
  resolving: boolean;
  onResolve: () => void;
};

/** Live "Needs Attention" ticket for anomalies, or the resolved note once closed. */
export function OrderAnomalyPanel({
  order,
  view,
  isPlatform,
  showResolve,
  resolveNote,
  onResolveNoteChange,
  resolving,
  onResolve,
}: Props) {
  const {
    isAnomaly,
    orderNumber,
    reasonLabel,
    explain,
    asset,
    amount,
    received,
    guidance,
    amountLine,
  } = view;

  return isAnomaly ? (
    <section
      className="order-detail-anomaly order-detail-anomaly--live no-print"
      role="alert"
      key={`anomaly-${order?.id ?? orderNumber}`}
    >
      <header className="order-detail-anomaly__head">
        <p className="order-detail-anomaly__title">Needs Attention</p>
      </header>

      <div className="order-detail-anomaly__section">
        <p className="order-detail-anomaly__label">Why</p>
        <p className="order-detail-anomaly__why">{reasonLabel}</p>
        {explain.inferred ? (
          <p className="order-detail-anomaly__inferred">
            Exact cause code was not stored on this ticket — this is the best
            explanation from the amounts and matching mode.
          </p>
        ) : null}
        <dl className="order-detail-anomaly__amounts">
          <div>
            <dt>Expected</dt>
            <dd className="order-detail-anomaly__amt">
              <AssetIcon asset={asset} />
              <span>
                {amount} {asset}
              </span>
            </dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd className="order-detail-anomaly__amt">
              <AssetIcon asset={asset} />
              <span>
                {received != null && String(received).trim()
                  ? `${received} ${asset}`
                  : "— (check tx on explorer; amount may still be syncing)"}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="order-detail-anomaly__section">
        <div className="order-detail-anomaly__what">
          <p className="order-detail-anomaly__label">What to do</p>
          <span className="plat-card-help order-detail-anomaly__help">
            <button
              type="button"
              className="plat-card-help__btn"
              aria-label={guidance}
            >
              ?
            </button>
            <span className="plat-card-help__tip" role="tooltip">
              {guidance}
            </span>
          </span>
        </div>
        {showResolve ? (
          <div className="order-detail-anomaly__resolve">
            <label
              className="order-detail-anomaly__note-label"
              htmlFor="anomaly-resolve-note"
            >
              Resolve note <span aria-hidden>(required)</span>
            </label>
            <textarea
              id="anomaly-resolve-note"
              className="order-detail-anomaly__note"
              rows={3}
              maxLength={1000}
              value={resolveNote}
              onChange={(e) => onResolveNoteChange(e.target.value)}
              placeholder="e.g. Checked explorer — customer A paid this 60 USDT; closed sibling ticket."
              disabled={resolving}
            />
            <div className="order-detail-anomaly__actions">
              <button
                type="button"
                className="order-detail-anomaly__resolve-btn"
                disabled={resolving || !resolveNote.trim()}
                onClick={onResolve}
              >
                {resolving ? "Resolving…" : "Resolve"}
              </button>
              <p className="order-detail-anomaly__hint">
                Closes this ticket after you reconcile. Does not mark paid.
                Urgent alerts stop once resolved.
              </p>
            </div>
          </div>
        ) : (
          <p className="order-detail-anomaly__hint">
            {isPlatform
              ? "Platform is watch-only here. Merchant Owner or Administrator resolves after reconciling — never mark paid from platform."
              : "Ask Owner or Administrator to resolve if this is not your order."}
          </p>
        )}
      </div>
    </section>
  ) : order?.anomalyResolutionNote ? (
    <section className="order-detail-anomaly order-detail-anomaly--resolved no-print">
      <header className="order-detail-anomaly__head">
        <p className="order-detail-anomaly__title">Attention resolved</p>
      </header>
      <p className="order-detail-anomaly__copy">
        {reasonLabel ? `${reasonLabel}. ` : ""}
        {amountLine ? `${amountLine} ` : ""}
        Staff note: {order.anomalyResolutionNote}
        {order.anomalyResolvedAt
          ? ` (${formatShortTime(order.anomalyResolvedAt)})`
          : ""}
      </p>
    </section>
  ) : null;
}
