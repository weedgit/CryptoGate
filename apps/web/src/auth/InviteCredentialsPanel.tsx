import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CopyGlyph } from "../shared/CopyGlyph";
import { resolveInviteLink } from "../shared/inviteLinks";

type Props = {
  email: string;
  temporaryPassword?: string | null;
  inviteUrl?: string | null;
  invitePath?: string | null;
  emailDeliveryStatus?: string | null;
};

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="6"
        y="10.5"
        width="12"
        height="8.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="19" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8.2 10.8 15.7 6.5M8.2 13.2l7.5 4.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m5 8 7 5 7-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.6A8.4 8.4 0 0 0 5.1 16.2L4 20l3.9-1a8.4 8.4 0 1 0 4.1-15.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 9.4c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.4.5c-.1.1-.1.3 0 .4.4.6 1 1.2 1.7 1.6.2.1.3.1.5 0l.6-.4c.2-.1.4-.1.5 0l1.6.8c.3.1.4.3.3.6-.2.7-.9 1.2-1.6 1.1-3.2-.4-5.8-3-6.4-6.1-.1-.7.3-1.5 1-1.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TelegramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20.4 5.2 3.9 11.5c-1.1.4-1.1 1.1-.2 1.4l4.2 1.3 1.6 5c.2.6.1.8.7.8.4 0 .6-.2.9-.4l2.3-2.2 4.5 3.3c.8.5 1.4.2 1.6-.8L21.7 6c.3-1.2-.4-1.7-1.3-.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m9.8 14.1 8.3-7.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function buildInviteMessage(email: string, password: string | null, link: string | null) {
  const lines = [
    `PaymentGate sign-in for ${email}`,
    "",
    password ? `Temporary password: ${password}` : null,
    link ? `Invite link: ${link}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function CopyField({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  href?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(`Copy ${label}`, value);
    }
  }, [label, value]);

  return (
    <div className="invite-creds__row">
      <span className="invite-creds__label">
        <span className="invite-creds__label-icon" aria-hidden>
          {icon}
        </span>
        <span className="invite-creds__label-text">{label}</span>
      </span>
      <div className="invite-creds__value-row">
        {href ? (
          <a
            className="invite-creds__value invite-creds__value--link"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {value}
          </a>
        ) : (
          <code className="invite-creds__value">{value}</code>
        )}
        <button
          type="button"
          className={`invite-creds__copy${copied ? " is-copied" : ""}`}
          onClick={() => void onCopy()}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          title={copied ? "Copied" : "Copy"}
        >
          <CopyGlyph copied={copied} />
        </button>
      </div>
    </div>
  );
}

function SuccessMark() {
  return (
    <span className="invite-creds__mark" aria-hidden>
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M8 12.2 10.6 14.8 16 9.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Shown once after inviting a newly provisioned user. */
export function InviteCredentialsPanel({
  email,
  temporaryPassword,
  inviteUrl,
  invitePath,
}: Props) {
  const link = resolveInviteLink(inviteUrl, invitePath);
  const password = temporaryPassword?.trim() || null;
  const hasCreds = Boolean(password || link);
  const message = useMemo(
    () => buildInviteMessage(email, password, link),
    [email, password, link],
  );
  const shareLinks = useMemo(() => {
    const text = encodeURIComponent(message);
    const url = encodeURIComponent(link ?? "");
    const subject = encodeURIComponent("PaymentGate invite");
    return {
      email: `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${text}`,
      whatsapp: `https://wa.me/?text=${text}`,
      telegram: link
        ? `https://t.me/share/url?url=${url}&text=${encodeURIComponent(`PaymentGate sign-in for ${email}`)}`
        : `https://t.me/share/url?text=${text}`,
    };
  }, [email, link, message]);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function onNativeShare() {
    try {
      await navigator.share({
        title: "PaymentGate invite",
        text: message,
        url: link ?? undefined,
      });
    } catch {
      /* user cancelled */
    }
  }

  if (!hasCreds) {
    return (
      <div className="invite-creds invite-creds--added">
        <SuccessMark />
        <div className="invite-creds__body">
          <h4 className="invite-creds__title">Member added</h4>
          <p className="invite-creds__lead">
            <strong>{email}</strong> already has an account and was added to this
            organization. No new password was issued.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-creds">
      <div className="invite-creds__banner">
        <div className="invite-creds__banner-main">
          <SuccessMark />
          <div className="invite-creds__body">
            <h4 className="invite-creds__title">Invite ready</h4>
          </div>
        </div>
        <div className="invite-creds__share" role="group" aria-label="Share invite">
          <span className="invite-creds__share-label">Share</span>
          <div className="invite-creds__share-links">
            <a
              className="invite-creds__share-btn"
              href={shareLinks.email}
              title="Share by email"
              aria-label="Share by email"
            >
              <MailGlyph />
              <span>Email</span>
            </a>
            <a
              className="invite-creds__share-btn"
              href={shareLinks.whatsapp}
              target="_blank"
              rel="noreferrer"
              title="Share on WhatsApp"
              aria-label="Share on WhatsApp"
            >
              <WhatsAppGlyph />
              <span>WhatsApp</span>
            </a>
            <a
              className="invite-creds__share-btn"
              href={shareLinks.telegram}
              target="_blank"
              rel="noreferrer"
              title="Share on Telegram"
              aria-label="Share on Telegram"
            >
              <TelegramGlyph />
              <span>Telegram</span>
            </a>
            {canNativeShare ? (
              <button
                type="button"
                className="invite-creds__share-btn"
                onClick={() => void onNativeShare()}
                title="Share"
                aria-label="Share invite"
              >
                <ShareGlyph />
                <span>More</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="invite-creds__fields">
        {password ? (
          <CopyField
            label="Temporary password"
            value={password}
            icon={<LockGlyph />}
          />
        ) : null}
        {link ? (
          <CopyField
            label="Invite link"
            value={link}
            icon={<LinkGlyph />}
            href={link}
          />
        ) : null}
      </div>
    </div>
  );
}
