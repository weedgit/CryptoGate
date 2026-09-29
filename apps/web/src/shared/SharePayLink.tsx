import { useState } from "react";

type Props = {
  /** Guest payment page URL. */
  url: string;
  /** e.g. "25.00 USD" — what the customer is asked to pay. */
  amountLabel: string;
  merchantName?: string | null;
  expiresAt?: string | null;
  timeZone?: string | null;
  className?: string;
};

/** "Pay 25.00 USD to Kevin Coffee (valid until 17:40)" — the message without the link. */
export function payLinkLead({
  amountLabel,
  merchantName,
  expiresAt,
  timeZone,
}: Pick<Props, "amountLabel" | "merchantName" | "expiresAt" | "timeZone">): string {
  const to = merchantName?.trim() ? ` to ${merchantName.trim()}` : "";
  let until = "";
  if (expiresAt) {
    const at = new Date(expiresAt);
    if (!Number.isNaN(at.getTime())) {
      const time = at.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        ...(timeZone ? { timeZone } : {}),
      });
      until = ` (valid until ${time})`;
    }
  }
  return `Pay ${amountLabel}${to}${until}`;
}

export function payLinkMessage(
  props: Pick<Props, "url" | "amountLabel" | "merchantName" | "expiresAt" | "timeZone">,
): string {
  return `${payLinkLead(props)}: ${props.url}`;
}

/**
 * Send the guest payment page to a remote customer (phone / chat / email orders).
 * Native share sheet when available (mobile, tablet); chat links + copy everywhere.
 */
export function SharePayLink({ className, ...props }: Props) {
  const [copied, setCopied] = useState(false);
  const message = payLinkMessage(props);
  const text = encodeURIComponent(message);
  const subject = encodeURIComponent(
    `Payment request${props.merchantName?.trim() ? ` — ${props.merchantName.trim()}` : ""}`,
  );
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy the payment link", props.url);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: "Payment request", text: message });
    } catch {
      /* dismissed */
    }
  };

  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${text}` },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodeURIComponent(props.url)}&text=${encodeURIComponent(
        payLinkLead(props),
      )}`,
    },
    { label: "Email", href: `mailto:?subject=${subject}&body=${text}` },
    { label: "SMS", href: `sms:?&body=${text}` },
  ];

  return (
    <div className={`share-pay-link${className ? ` ${className}` : ""}`}>
      <p className="share-pay-link__label">Send payment link</p>
      <div className="share-pay-link__main">
        {canShare ? (
          <button
            type="button"
            className="share-pay-link__btn share-pay-link__btn--primary"
            onClick={() => void share()}
          >
            Share link
          </button>
        ) : null}
        <button type="button" className="share-pay-link__btn" onClick={() => void copy()}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <div className="share-pay-link__apps">
        {links.map((l) => (
          <a
            key={l.label}
            className="share-pay-link__app"
            href={l.href}
            target={l.href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
