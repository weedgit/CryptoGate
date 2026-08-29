/** Decorative mock payment order — marketing only (aria-hidden). */

const QR_MODULES: [number, number, number, number][] = [
  [1, 1, 7, 1],
  [1, 1, 1, 7],
  [7, 1, 1, 7],
  [1, 7, 7, 1],
  [3, 3, 3, 3],
  [19, 1, 7, 1],
  [19, 1, 1, 7],
  [25, 1, 1, 7],
  [19, 7, 7, 1],
  [21, 3, 3, 3],
  [1, 19, 7, 1],
  [1, 19, 1, 7],
  [7, 19, 1, 7],
  [1, 25, 7, 1],
  [3, 21, 3, 3],
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
];

const ROWS = [
  { label: "Order ID", value: "PO-8F2A-0194" },
  { label: "Amount", value: "1.2500 USDT" },
  { label: "Network", value: "TRON TRC-20" },
  { label: "Confirmations", value: "19 / 19" },
] as const;

export function MarketingOrderCard() {
  return (
    <article className="marketing-order-card" aria-hidden>
      <header className="marketing-order-card__head">
        <span className="marketing-order-card__kicker">Payment order</span>
        <h2 className="marketing-order-card__title">Collection request</h2>
      </header>

      <dl className="marketing-order-card__rows">
        {ROWS.map((row) => (
          <div key={row.label} className="marketing-order-card__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="marketing-order-card__progress" role="presentation">
        <div className="marketing-order-card__progress-fill" />
      </div>

      <footer className="marketing-order-card__footer">
        <div className="marketing-order-card__qr">
          <svg
            viewBox="0 0 27 27"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="crispEdges"
          >
            {QR_MODULES.map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" />
            ))}
          </svg>
        </div>
        <div className="marketing-order-card__meta">
          <span className="marketing-order-card__status">Completed</span>
          <span className="marketing-order-card__hint">Required confirmations met</span>
        </div>
      </footer>
    </article>
  );
}
