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

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Live "Needs attention" ticket for anomalies, or the resolved note once closed. */
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
    asset,
    amount,
    received,
    amountLine,
  } = view;
  const hasReceived = received != null && String(received).trim() !== "";
  const mismatch = hasReceived && Number(received) !== Number(amount);

  if (isAnomaly) {
    return (
      <section
        className="order-detail-anomaly order-detail-anomaly--live no-print"
        role="alert"
        key={`anomaly-${order?.id ?? orderNumber}`}
      >
        <header className="order-detail-anomaly__head">
          <span className="order-detail-anomaly__head-icon" aria-hidden>
            <AlertIcon />
          </span>
          <h2 className="order-detail-anomaly__title">Needs attention</h2>
          <span className="order-detail-anomaly__pill">Action required</span>
        </header>

        <div className="order-detail-anomaly__section">
          <p className="order-detail-anomaly__label">Reason</p>
          <p className="order-detail-anomaly__why">{reasonLabel}</p>
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
            <div className={mismatch ? "is-mismatch" : undefined}>
              <dt>Received</dt>
              <dd className="order-detail-anomaly__amt">
                {hasReceived ? (
                  <>
                    <AssetIcon asset={asset} />
                    <span>
                      {received} {asset}
                    </span>
                  </>
                ) : (
                  <span className="order-detail-anomaly__amt-missing">Not synced yet</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="order-detail-anomaly__section">
          {showResolve ? (
            <div className="order-detail-anomaly__resolve">
              <label
                className="order-detail-anomaly__note-label"
                htmlFor="anomaly-resolve-note"
              >
                Resolve note
              </label>
              <textarea
                id="anomaly-resolve-note"
                className="order-detail-anomaly__note"
                rows={3}
                maxLength={1000}
                value={resolveNote}
                onChange={(e) => onResolveNoteChange(e.target.value)}
                placeholder="What did you check?"
                disabled={resolving}
              />
              <button
                type="button"
                className="order-detail-anomaly__resolve-btn"
                disabled={resolving || !resolveNote.trim()}
                onClick={onResolve}
              >
                <CheckIcon />
                {resolving ? "Resolving…" : "Resolve"}
              </button>
              <p className="order-detail-anomaly__hint">Closes the ticket. Does not mark paid.</p>
            </div>
          ) : (
            <p className="order-detail-anomaly__hint">
              {isPlatform
                ? "Watch-only. The merchant Owner or Admin resolves it."
                : "Only an Owner or Admin can resolve this."}
            </p>
          )}
        </div>
      </section>
    );
  }

  if (!order?.anomalyResolutionNote) return null;

  return (
    <section className="order-detail-anomaly order-detail-anomaly--resolved no-print">
      <header className="order-detail-anomaly__head">
        <span className="order-detail-anomaly__head-icon" aria-hidden>
          <CheckIcon />
        </span>
        <h2 className="order-detail-anomaly__title">Attention resolved</h2>
        {order.anomalyResolvedAt ? (
          <span className="order-detail-anomaly__head-meta">
            {formatShortTime(order.anomalyResolvedAt)}
          </span>
        ) : null}
      </header>
      <div className="order-detail-anomaly__section">
        {reasonLabel ? (
          <>
            <p className="order-detail-anomaly__label">Reason</p>
            <p className="order-detail-anomaly__why">{reasonLabel}</p>
          </>
        ) : null}
        {amountLine ? <p className="order-detail-anomaly__copy">{amountLine}</p> : null}
        <p className="order-detail-anomaly__label order-detail-anomaly__label--gap">
          Staff note
        </p>
        <p className="order-detail-anomaly__copy">{order.anomalyResolutionNote}</p>
      </div>
    </section>
  );
}
