import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listServiceBills,
  type ServiceBill,
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
 * Matches Service Bills list callout: draft vs payable CTA + checkout.
 */
export function ActivationPaymentBanner({ session }: Props) {
  const needsPay = sessionNeedsActivationPayment(session);
  const [activation, setActivation] = useState<ServiceBill | null>(null);

  useEffect(() => {
    if (!needsPay) {
      setActivation(null);
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
        setActivation(byKind ?? fallback ?? null);
      })
      .catch(() => {
        if (!cancelled) setActivation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsPay, session.setupOrgId]);

  if (!needsPay) return null;

  const payable =
    activation?.status === "issued" || activation?.status === "overdue";
  const href = activation
    ? merchantRoute(`service-bills/${activation.id}`)
    : merchantRoute("service-bills");

  return (
    <div className="verify-contact-banner" role="status">
      <span className="cashier-lock" aria-hidden>
        $
      </span>
      <p>
        <strong>Watch-only</strong> —{" "}
        {activation?.status === "draft"
          ? "Your activation invoice is a draft. PaymentGate must Confirm & send before you can pay (or enable auto-send)."
          : `${ACTIVATION_PAYMENT_LOCKED_HINT} Pay platform fee activation to unlock live actions.`}
      </p>
      {activation ? (
        <Link
          className="btn-primary btn-inline"
          to={href}
          state={payable ? { openCheckout: true } : undefined}
        >
          {payable ? "Pay activation" : "View activation invoice"}
        </Link>
      ) : (
        <Link className="btn-primary btn-inline" to={href}>
          View service bills
        </Link>
      )}
    </div>
  );
}
