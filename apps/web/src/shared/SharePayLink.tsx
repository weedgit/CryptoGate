import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="share-pay-link__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ShareIcon = () => (
  <LineIcon>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
  </LineIcon>
);

const CopyIcon = () => (
  <LineIcon>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
  </LineIcon>
);

const CheckIcon = () => (
  <LineIcon>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </LineIcon>
);

const OpenIcon = () => (
  <LineIcon>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </LineIcon>
);

const MailIcon = () => (
  <LineIcon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </LineIcon>
);

const SmsIcon = () => (
  <LineIcon>
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z" />
    <path d="M8 10h8M8 13h5" />
  </LineIcon>
);

const WhatsAppIcon = () => (
  <svg className="share-pay-link__icon share-pay-link__icon--whatsapp" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"
    />
  </svg>
);

const TelegramIcon = () => (
  <svg className="share-pay-link__icon share-pay-link__icon--telegram" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M21.5 3.6 2.9 10.8c-1.3.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5ZM9.4 13.4l8.9-5.6c.4-.3.8-.1.5.2l-7.4 6.7-.3 3.2-1.7-4.5Z"
    />
  </svg>
);

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
    { label: "WhatsApp", icon: <WhatsAppIcon />, href: `https://wa.me/?text=${text}` },
    {
      label: "Telegram",
      icon: <TelegramIcon />,
      href: `https://t.me/share/url?url=${encodeURIComponent(props.url)}&text=${encodeURIComponent(
        payLinkLead(props),
      )}`,
    },
    { label: "Email", icon: <MailIcon />, href: `mailto:?subject=${subject}&body=${text}` },
    { label: "SMS", icon: <SmsIcon />, href: `sms:?&body=${text}` },
  ];

  return (
    <div className={`share-pay-link${className ? ` ${className}` : ""}`}>
      <p className="share-pay-link__label">Send payment link</p>
      <div className="share-pay-link__url">
        <span className="share-pay-link__url-text" title={props.url}>
          {props.url}
        </span>
        <button
          type="button"
          className={`share-pay-link__url-copy${copied ? " is-copied" : ""}`}
          onClick={() => void copy()}
          aria-label={copied ? "Link copied" : "Copy link"}
          title={copied ? "Copied" : "Copy link"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <div className="share-pay-link__main">
        {canShare ? (
          <button
            type="button"
            className="share-pay-link__btn share-pay-link__btn--primary"
            onClick={() => void share()}
          >
            <ShareIcon />
            Share link
          </button>
        ) : null}
        <a className="share-pay-link__btn" href={props.url} target="_blank" rel="noreferrer">
          <OpenIcon />
          Open link
        </a>
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
            {l.icon}
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * "Share" button that opens the Send payment link card in a pop-up
 * (keeps the cashier screen short while the QR is showing).
 */
export function SharePayLinkButton({
  buttonClassName,
  ...props
}: Props & { buttonClassName?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`share-pay-link__open${buttonClassName ? ` ${buttonClassName}` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ShareIcon />
        Share
      </button>
      {open
        ? createPortal(
            <div className="share-pay-modal" role="presentation" onClick={() => setOpen(false)}>
              <div
                className="share-pay-modal__panel"
                role="dialog"
                aria-modal="true"
                aria-label="Send payment link"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="share-pay-modal__close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
                <SharePayLink {...props} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
