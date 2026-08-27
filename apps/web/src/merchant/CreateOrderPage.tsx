import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  createOrder,
  getPaymentDetails,
  type PaymentDetails,
} from "./api";
import {
  matchingModeHint,
  matchingModeLabel,
  VALIDITY_OPTIONS,
} from "./matchingLabels";

type Props = {
  /** Merchant default matching mode (read-only on create). */
  matchingMode?: string;
};

export function CreateOrderPage({ matchingMode = "B" }: Props) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("245.00");
  const [asset] = useState("USDT");
  const [network, setNetwork] = useState("tron");
  const [validitySeconds, setValiditySeconds] = useState(1800);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PaymentDetails | null>(null);

  const modeLabel = matchingModeLabel(matchingMode);
  const modeHint = matchingModeHint(matchingMode);
  const validityLabel = useMemo(
    () =>
      VALIDITY_OPTIONS.find((o) => o.seconds === validitySeconds)?.label ??
      `${Math.round(validitySeconds / 60)} Minutes`,
    [validitySeconds],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const order = await createOrder({
        amount: amount.trim(),
        asset,
        network,
        validitySeconds,
      });
      const pay = await getPaymentDetails(order.id);
      setPreview(pay);
      navigate(`/merchant/orders/${order.id}`, { replace: false, state: { pay } });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Create order failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="split">
      <form className="panel panel-form" onSubmit={onSubmit}>
        <h2>Order Generation Specifications</h2>
        <div className="field">
          <label htmlFor="amount">PAYMENT AMOUNT</label>
          <div className="amount-box">
            <input
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              required
              disabled={loading}
            />
            <span className="asset">{asset}</span>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="network">SETTLEMENT PROTOCOL</label>
            <select
              id="network"
              className="field-control"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              disabled={loading}
            >
              <option value="tron">TRC-20 (TRON)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="validity">EXPIRE TIME WINDOW</label>
            <select
              id="validity"
              className="field-control"
              value={validitySeconds}
              onChange={(e) => setValiditySeconds(Number(e.target.value))}
              disabled={loading}
            >
              {VALIDITY_OPTIONS.map((o) => (
                <option key={o.seconds} value={o.seconds}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mode-card">
          <h3>Active Mode: {modeLabel}</h3>
          <p>{modeHint}</p>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={loading || !amount.trim()}>
          {loading ? "Creating…" : "GENERATE INVOICE"}
        </button>
      </form>
      <aside className="panel panel-preview">
        <h2>Live Preview (Customer terminal view)</h2>
        <div className="preview-device">
          <div className="preview-head">
            <strong>CryptoGate checkout</strong>
            <span className="timer">{validityLabel.split(" ")[0]}:00</span>
          </div>
          <div className="preview-amount">
            <p className="label">TOTAL AMOUNT TO SEND</p>
            <p className="value">
              {(preview?.copyAmount ?? amount) || "—"} {asset}
            </p>
          </div>
          <div className="preview-meta">
            <span className="muted">
              {asset} · {network === "tron" ? "TRC-20" : network.toUpperCase()}
            </span>
            <span className="muted">Mode · {modeLabel}</span>
          </div>
          <div className="qr-slot">
            {preview?.qrPayload ? (
              <img
                className="preview-qr-img"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(preview.qrPayload)}`}
                alt="Payment QR preview"
                width={160}
                height={160}
              />
            ) : (
              "QR after generate"
            )}
          </div>
          <div>
            <p className="label" style={{ color: "var(--muted)", fontSize: 11, margin: "0 0 4px" }}>
              PAYMENT ADDRESS ({asset} {network.toUpperCase()})
            </p>
            <div className="addr-box">
              {preview?.receiveAddress ?? "Address assigned on create"}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
