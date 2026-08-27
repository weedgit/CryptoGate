type Props = {
  reducedMotion: boolean;
};

/** Version-2 style 25×25 matrix — decorative only, not scannable payload. */
const QR_SIZE = 25;
/** Clear modules under the center brand mark (with quiet pad). */
const LOGO_CLEAR = { r0: 8, c0: 8, r1: 16, c1: 16 };

function buildDecorativeQr(): boolean[][] {
  const m: boolean[][] = Array.from({ length: QR_SIZE }, () =>
    Array.from({ length: QR_SIZE }, () => false),
  );

  const set = (r: number, c: number, v: boolean) => {
    if (r >= 0 && r < QR_SIZE && c >= 0 && c < QR_SIZE) m[r][c] = v;
  };

  const placeFinder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= QR_SIZE || cc < 0 || cc >= QR_SIZE) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          set(rr, cc, false);
          continue;
        }
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        set(rr, cc, onBorder || inCenter);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, QR_SIZE - 7);
  placeFinder(QR_SIZE - 7, 0);

  for (let i = 8; i < QR_SIZE - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Alignment near bottom-right (away from center logo)
  const ar = 18;
  const ac = 18;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const onBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
      const center = r === 0 && c === 0;
      set(ar + r, ac + c, onBorder || center);
    }
  }

  set(QR_SIZE - 8, 8, true);

  const inLogoClear = (r: number, c: number) =>
    r >= LOGO_CLEAR.r0 &&
    r <= LOGO_CLEAR.r1 &&
    c >= LOGO_CLEAR.c0 &&
    c <= LOGO_CLEAR.c1;

  const reserved = (r: number, c: number) => {
    const inFinder = (r0: number, c0: number) =>
      r >= r0 - 1 && r <= r0 + 7 && c >= c0 - 1 && c <= c0 + 7;
    if (inFinder(0, 0) || inFinder(0, QR_SIZE - 7) || inFinder(QR_SIZE - 7, 0)) {
      return true;
    }
    if (r === 6 || c === 6) return true;
    if (r >= ar - 2 && r <= ar + 2 && c >= ac - 2 && c <= ac + 2) return true;
    if (inLogoClear(r, c)) return true;
    return false;
  };

  for (let r = 0; r < QR_SIZE; r++) {
    for (let c = 0; c < QR_SIZE; c++) {
      if (reserved(r, c)) continue;
      const n = (r * 17 + c * 31 + r * c * 7) % 11;
      set(r, c, n === 0 || n === 3 || n === 7 || n === 8);
    }
  }

  // Force quiet zone under logo
  for (let r = LOGO_CLEAR.r0; r <= LOGO_CLEAR.r1; r++) {
    for (let c = LOGO_CLEAR.c0; c <= LOGO_CLEAR.c1; c++) {
      set(r, c, false);
    }
  }

  return m;
}

const QR_MATRIX = buildDecorativeQr();

function DecorativeQrSvg({ className }: { className?: string }) {
  const quiet = 1;
  const vb = QR_SIZE + quiet * 2;
  // Logo sits in cleared module window (8..16) → SVG coords + quiet
  const logoX = LOGO_CLEAR.c0 + quiet + 0.55;
  const logoY = LOGO_CLEAR.r0 + quiet + 0.55;
  const logoSize = LOGO_CLEAR.c1 - LOGO_CLEAR.c0 - 0.1;
  const pad = 0.55;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${vb} ${vb}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
    >
      {QR_MATRIX.flatMap((row, r) =>
        row.flatMap((on, c) =>
          on
            ? [
                <rect
                  key={`${r}-${c}`}
                  x={c + quiet}
                  y={r + quiet}
                  width={1}
                  height={1}
                  fill="currentColor"
                />,
              ]
            : [],
        ),
      )}

      {/* Soft plate so modules never touch the brand mark */}
      <rect
        x={logoX - pad}
        y={logoY - pad}
        width={logoSize + pad * 2}
        height={logoSize + pad * 2}
        rx={1.4}
        fill="rgba(10, 14, 22, 0.92)"
        shapeRendering="geometricPrecision"
      />
      {/* Center brand mark — cool steel to match QR modules */}
      <rect
        x={logoX}
        y={logoY}
        width={logoSize}
        height={logoSize}
        rx={1.35}
        fill="#5a7088"
        stroke="rgba(140, 170, 200, 0.55)"
        strokeWidth={0.35}
        shapeRendering="geometricPrecision"
      />
      <text
        x={logoX + logoSize / 2}
        y={logoY + logoSize / 2 + 0.15}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#d0dce8"
        fontFamily="IBM Plex Mono, ui-monospace, monospace"
        fontSize={logoSize * 0.52}
        fontWeight="700"
        shapeRendering="geometricPrecision"
      >
        ₿
      </text>
    </svg>
  );
}

/** Decorative receive QR — cool steel stack / scan language (fits slate canvas). */
export function AuthBackgroundLeftQr({ reducedMotion }: Props) {
  return (
    <div className="auth-qr-panel" aria-hidden>
      <div className="auth-qr-stack">
        <div className="auth-qr-doc auth-qr-doc--back" />
        <article
          className={`auth-qr-doc auth-qr-doc--front${
            reducedMotion ? " auth-qr-doc--static" : ""
          }`}
        >
          {!reducedMotion ? <div className="auth-qr-scan" /> : null}

          <div
            className={`auth-qr-frame${reducedMotion ? " auth-qr-frame--static" : ""}`}
          >
            <DecorativeQrSvg className="auth-qr-glyph" />
          </div>

          <footer className="auth-qr-meta">
            <span className="auth-qr-asset">1.2500 USDT · Bitcoin</span>
            <span className="auth-qr-hint">Point camera at code</span>
          </footer>
        </article>
      </div>
    </div>
  );
}
