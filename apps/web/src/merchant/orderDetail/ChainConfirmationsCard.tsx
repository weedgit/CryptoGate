import type { OrderDetailView } from "./orderDetailView";

type Props = {
  status: string;
  progress: OrderDetailView["progress"];
  confirmationStatusSuffix: string;
  txHash: string | null | undefined;
  watching: boolean;
  polling: boolean;
  copiedTx: boolean;
  onCopyTxHash: () => void;
};

export function ChainConfirmationsCard({
  status,
  progress,
  confirmationStatusSuffix,
  txHash,
  watching,
  polling,
  copiedTx,
  onCopyTxHash,
}: Props) {
  return (
    <section
      className={`plat-settings__card order-detail-aside-card order-detail-chain${
        status === "verifying" ? " is-verifying" : ""
      }${
        progress.filled >= progress.total && progress.total > 0
          ? " is-complete"
          : ""
      }`}
    >
      <div className="plat-settings__card-head order-detail-chain__head">
        <h2 className="plat-settings__card-title">Blockchain confirmations</h2>
        <div className="order-detail-chain__head-meta">
          {watching ? (
            <span
              className={`order-detail-chain__live${polling ? " is-polling" : ""}`}
              aria-live="polite"
            >
              <span className="order-detail-chain__live-dot" aria-hidden />
              Live
            </span>
          ) : null}
          <span className="order-detail-chain__badge" aria-hidden>
            <span className="order-detail-chain__badge-fill">{progress.filled}</span>
            <span className="order-detail-chain__badge-sep">/</span>
            <span>{progress.total}</span>
          </span>
        </div>
      </div>
      <div className="plat-settings__card-body">
        <div
          className={`order-detail-chain__blocks${
            progress.filled >= progress.total && progress.total > 0
              ? " is-complete"
              : ""
          }${status === "verifying" ? " is-live" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.filled}
          aria-label={`${progress.filled} of ${progress.total} block confirmations`}
          style={{
            ["--conf-total" as string]: String(
              Math.max(1, progress.total),
            ),
          }}
        >
          {Array.from({ length: progress.total }, (_, i) => (
            <div
              key={i}
              className={[
                "order-detail-chain__block",
                i < progress.filled ? "is-filled" : "",
                status === "verifying" && i === progress.filled
                  ? "is-next"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                ["--i" as string]: i,
                ["--fill-t" as string]:
                  progress.total > 1 ? i / (progress.total - 1) : 0,
              }}
            />
          ))}
        </div>
        <p className="order-detail-chain__status">
          <span className="order-detail-chain__status-count">
            {progress.filled} of {progress.total} block confirmations
          </span>
          <span className="order-detail-chain__status-note">
            {confirmationStatusSuffix}
          </span>
        </p>
        {txHash ? (
          <label className="order-detail-chain__tx plat-settings__field">
            <span>Transaction hash</span>
            <div className="field-shell field-shell--copy">
              <input
                className="plat-settings__input mono"
                readOnly
                value={txHash}
                aria-label="Transaction hash"
              />
              <button
                type="button"
                className="field-shell__copy-btn"
                onClick={onCopyTxHash}
              >
                {copiedTx ? "Copied" : "Copy"}
              </button>
            </div>
          </label>
        ) : null}
      </div>
    </section>
  );
}
