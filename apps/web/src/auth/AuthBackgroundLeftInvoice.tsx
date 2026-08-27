import { useEffect, useState } from "react";

type Props = {
  reducedMotion: boolean;
  underWordmark?: boolean;
};

type OrderStatus = "pending" | "verifying" | "completed";

const STATUSES: OrderStatus[] = ["pending", "verifying", "completed"];

const ROWS = [
  { label: "Order ID", value: "PO-8F2A-0194" },
  { label: "Amount", value: "1.2500 USDT" },
  { label: "Network", value: "TRON (TRC-20)" },
  { label: "Receive", value: "TXk9…4mP2" },
  { label: "Confirmations", value: "8 / 12" },
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  verifying: "Verifying",
  completed: "Completed",
};

export function AuthBackgroundLeftInvoice({
  reducedMotion,
  underWordmark = false,
}: Props) {
  const [statusIdx, setStatusIdx] = useState(0);
  const status = STATUSES[statusIdx];

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUSES.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return (
    <div
      className={`auth-invoice-panel${
        underWordmark ? " auth-invoice-panel--under-wordmark" : ""
      }`}
      aria-hidden
    >
      <div className="auth-invoice-stack">
        <div className="auth-invoice-doc auth-invoice-doc--back" />
        <article
          className={`auth-invoice-doc auth-invoice-doc--front${
            reducedMotion ? " auth-invoice-doc--static" : ""
          }`}
        >
          {!reducedMotion ? <div className="auth-invoice-scan" /> : null}

          <header className="auth-invoice-head">
            <span className="auth-invoice-kicker">Payment order</span>
            <h2 className="auth-invoice-title">Collection request</h2>
          </header>

          <dl className="auth-invoice-rows">
            {ROWS.map((row, i) => (
              <div
                key={row.label}
                className="auth-invoice-row"
                style={{ animationDelay: `${0.35 + i * 0.12}s` }}
              >
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="auth-invoice-footer">
            <div className="auth-invoice-qr" aria-hidden>
              <svg
                viewBox="0 0 27 27"
                xmlns="http://www.w3.org/2000/svg"
                shapeRendering="crispEdges"
              >
                {/* Mini Version-1-ish finder + modules (decorative) */}
                {[
                  // TL finder
                  [1, 1, 7, 1],
                  [1, 1, 1, 7],
                  [7, 1, 1, 7],
                  [1, 7, 7, 1],
                  [3, 3, 3, 3],
                  // TR finder
                  [19, 1, 7, 1],
                  [19, 1, 1, 7],
                  [25, 1, 1, 7],
                  [19, 7, 7, 1],
                  [21, 3, 3, 3],
                  // BL finder
                  [1, 19, 7, 1],
                  [1, 19, 1, 7],
                  [7, 19, 1, 7],
                  [1, 25, 7, 1],
                  [3, 21, 3, 3],
                  // Timing
                  [9, 7, 1, 1],
                  [11, 7, 1, 1],
                  [13, 7, 1, 1],
                  [15, 7, 1, 1],
                  [17, 7, 1, 1],
                  [7, 9, 1, 1],
                  [7, 11, 1, 1],
                  [7, 13, 1, 1],
                  [7, 15, 1, 1],
                  [7, 17, 1, 1],
                  // Data sprinkle
                  [9, 9, 1, 1],
                  [11, 9, 1, 1],
                  [14, 9, 1, 1],
                  [16, 10, 1, 1],
                  [9, 11, 1, 1],
                  [12, 11, 1, 1],
                  [15, 12, 1, 1],
                  [10, 13, 1, 1],
                  [13, 13, 1, 1],
                  [16, 13, 1, 1],
                  [9, 15, 1, 1],
                  [11, 15, 1, 1],
                  [14, 15, 1, 1],
                  [17, 15, 1, 1],
                  [12, 16, 1, 1],
                  [15, 17, 1, 1],
                  [9, 19, 1, 1],
                  [11, 20, 1, 1],
                  [14, 19, 1, 1],
                  [16, 21, 1, 1],
                  [19, 11, 1, 1],
                  [21, 12, 1, 1],
                  [23, 14, 1, 1],
                  [20, 15, 1, 1],
                  [22, 17, 1, 1],
                  [19, 19, 1, 1],
                  [21, 20, 1, 1],
                  [23, 22, 1, 1],
                  [20, 23, 1, 1],
                  [22, 24, 1, 1],
                ].map(([x, y, w, h], i) => (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="currentColor"
                  />
                ))}
              </svg>
            </div>
            <div className="auth-invoice-meta">
              <span
                className={`auth-invoice-status auth-invoice-status--${status}`}
              >
                {STATUS_LABEL[status]}
              </span>
              <span className="auth-invoice-expiry">Expires in 14:32</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
