import type { PaymentOrder } from "../api";
import { formatExpiryRemaining, orderStatusLabel } from "../orderStatus";
import { PaymentQrCanvas } from "../../shared/PaymentQrCanvas";
import { GatewayQrTerminal } from "../../shared/GatewayQrTerminal";
import { AssetIcon, NetworkIcon, QrCenterNetworkMark } from "../../platform/cryptoIcons";
import type { OrderDetailView } from "./orderDetailView";

type Props = {
  order: PaymentOrder | null;
  view: OrderDetailView;
  nowTick: number;
  copied: boolean;
  onCopyAddress: () => void;
};

export function OrderGatewayCard({
  order,
  view,
  nowTick,
  copied,
  onCopyAddress,
}: Props) {
  const {
    asset,
    network,
    settled,
    amount,
    networkDisplay,
    qrTerminal,
    qrPayload,
    status,
    expiresAt,
    address,
  } = view;

  return (
    <section className="plat-settings__card order-detail-gateway">
      <div className="plat-settings__card-body order-detail-gateway__body">
        <div className="order-detail-gateway__pay-panel">
          <div className="order-detail-gateway__amount">
            <div className="order-detail-gateway__chain-icons" aria-hidden>
              <AssetIcon asset={asset} />
              <NetworkIcon network={network} />
            </div>
            <span className="order-detail-gateway__amount-label">
              {settled ? "Amount paid" : "Amount due"}
            </span>
            <p className="order-detail-gateway__amount-value fund-amount">
              {amount} {asset}
            </p>
            <p className="order-detail-gateway__amount-net">
              <NetworkIcon network={network} />
              <span>{networkDisplay}</span>
            </p>
          </div>

          <div className="order-detail-gateway__qr-wrap">
            <div
              className={`order-detail-gateway__qr${
                qrTerminal ? " is-terminal" : ""
              }`}
            >
              {qrPayload && !qrTerminal ? (
                <>
                  <PaymentQrCanvas
                    payload={qrPayload}
                    size={204}
                    alt="Payment QR"
                  />
                  <span className="order-detail-gateway__qr-mark" aria-hidden>
                    <QrCenterNetworkMark network={network} />
                  </span>
                </>
              ) : (
                <GatewayQrTerminal
                  kind={
                    settled
                      ? "completed"
                      : status === "payment_anomaly"
                        ? "anomaly"
                        : status === "expired"
                          ? "expired"
                          : status === "failed" || status === "cancelled"
                            ? "failed"
                            : "unavailable"
                  }
                  title={
                    status === "failed" || status === "cancelled"
                      ? orderStatusLabel(status, order)
                      : undefined
                  }
                />
              )}
            </div>
            <p
              className={`order-detail-gateway__timer${
                qrTerminal ? " is-terminal" : ""
              }`}
              key={settled ? "settled" : nowTick}
            >
              {settled
                ? "Payment completed — QR no longer needed"
                : status === "payment_anomaly"
                  ? "Attention — do not collect again"
                  : status === "expired"
                    ? "Order expired — a late on-chain send will not auto-complete"
                    : status === "failed" || status === "cancelled"
                      ? orderStatusLabel(status, order)
                      : `Valid for ${formatExpiryRemaining(expiresAt)}`}
            </p>
          </div>

          <div className="order-detail-gateway__address-block">
            <span className="order-detail-gateway__field-label">Payment address</span>
            <div className="order-detail-gateway__address-row">
              <div className="order-detail-gateway__address-icons" aria-hidden>
                <AssetIcon asset={asset} />
                <NetworkIcon network={network} />
              </div>
              <p
                className="order-detail-gateway__address mono"
                title={address || undefined}
              >
                {address || "—"}
              </p>
            </div>
            <button
              type="button"
              className="order-detail-gateway__copy-btn"
              onClick={onCopyAddress}
              disabled={!address}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>

          {order?.memoOrTag ? (
            <div className="order-detail-gateway__memo">
              <span className="order-detail-gateway__field-label">Memo / tag</span>
              <p className="order-detail-gateway__memo-value mono">{order.memoOrTag}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
