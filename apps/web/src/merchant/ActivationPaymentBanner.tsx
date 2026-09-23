import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listServiceBills,
  type Session,
} from "./api";
import { merchantRoute } from "../shared/portalRouting";
import {
  ACTIVATION_PAYMENT_LOCKED_HINT,
  sessionNeedsActivationPayment,
} from "../auth/contactVerification";

type Props = {
  session: Session;
};

/**
 * Shown when setup is complete but activation fee is unpaid.
 * Links to the open activation service bill when found.
 */
export function ActivationPaymentBanner({ session }: Props) {
  const needsPay = sessionNeedsActivationPayment(session);
  const [billId, setBillId] = useState<string | null>(null);

  useEffect(() => {
    if (!needsPay) {
      setBillId(null);
      return;
    }
    let cancelled = false;
    void listServiceBills()
      .then((rows) => {
        if (cancelled) return;
        const byKind = rows.find(
          (b) =>
            b.billKind === "activation" &&
            !["paid", "voided", "cancelled"].includes(b.status),
        );
        const fallback = rows.find(
          (b) =>
            !["paid", "voided", "cancelled"].includes(b.status) &&
            b.periodStart === b.periodEnd &&
            Number(b.volumeFeeAmount) === 0,
        );
        setBillId((byKind ?? fallback)?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setBillId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsPay, session.setupOrgId]);

  if (!needsPay) return null;

  const href = billId
    ? merchantRoute(`service-bills/${billId}`)
    : merchantRoute("service-bills");

  return (
    <div className="verify-contact-banner" role="status">
      <span className="cashier-lock" aria-hidden>
        $
      </span>
      <p>
        {ACTIVATION_PAYMENT_LOCKED_HINT}. Live actions stay locked until platform
        fee activation is paid.
      </p>
      <Link className="btn-primary btn-inline" to={href}>
        {billId ? "Open activation invoice" : "View service bills"}
      </Link>
    </div>
  );
}
