type TerminalKind =
  | "completed"
  | "paid"
  | "voided"
  | "expired"
  | "anomaly"
  | "failed"
  | "unavailable"
  | "loading";

type Props = {
  kind: TerminalKind;
  /** Override primary line (defaults from kind). */
  title?: string;
  /** Override secondary line (defaults from kind). */
  detail?: string;
};

const DEFAULTS: Record<
  TerminalKind,
  { title: string; detail: string; showCheck: boolean; voidStyle: boolean }
> = {
  completed: {
    title: "Completed",
    detail: "Payment recorded — scan QR not needed",
    showCheck: true,
    voidStyle: false,
  },
  paid: {
    title: "Paid",
    detail: "Remittance recorded — scan QR not needed",
    showCheck: true,
    voidStyle: false,
  },
  voided: {
    title: "Voided",
    detail: "No remittance due",
    showCheck: false,
    voidStyle: true,
  },
  expired: {
    title: "Expired",
    detail: "This order is no longer payable",
    showCheck: false,
    voidStyle: true,
  },
  anomaly: {
    title: "Review needed",
    detail: "Do not collect again — resolve in portal",
    showCheck: false,
    voidStyle: true,
  },
  failed: {
    title: "Closed",
    detail: "Order will not accept payment",
    showCheck: false,
    voidStyle: true,
  },
  unavailable: {
    title: "QR unavailable",
    detail: "Use copy address below",
    showCheck: false,
    voidStyle: true,
  },
  loading: {
    title: "Loading QR…",
    detail: "",
    showCheck: false,
    voidStyle: true,
  },
};

/** Terminal QR panel (paid / completed / expired) — shared by orders and service bills. */
export function GatewayQrTerminal({ kind, title, detail }: Props) {
  const preset = DEFAULTS[kind];
  const head = title ?? preset.title;
  const sub = detail ?? preset.detail;

  if (kind === "loading") {
    return (
      <span className="order-detail-gateway__qr-placeholder">{head}</span>
    );
  }

  return (
    <div
      className="order-detail-gateway__qr-placeholder order-detail-gateway__qr-placeholder--terminal"
      role="status"
    >
      {preset.showCheck ? (
        <span className="order-detail-gateway__qr-check" aria-hidden>
          ✓
        </span>
      ) : null}
      <strong className={preset.voidStyle ? "order-detail-gateway__qr-void" : undefined}>
        {head}
      </strong>
      {sub ? <span>{sub}</span> : null}
    </div>
  );
}
