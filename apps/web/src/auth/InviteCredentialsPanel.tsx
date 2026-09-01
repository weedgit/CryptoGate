import { useCallback, useState } from "react";
import { resolveInviteLink } from "../shared/inviteLinks";

type Props = {
  email: string;
  temporaryPassword?: string | null;
  inviteUrl?: string | null;
  invitePath?: string | null;
  emailDeliveryStatus?: string | null;
};

function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
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
      <span className="invite-creds__label">{label}</span>
      <div className="invite-creds__value-row">
        <code className="invite-creds__value">{value}</code>
        <button
          type="button"
          className={`invite-creds__copy${copied ? " is-copied" : ""}`}
          onClick={() => void onCopy()}
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied
            </>
          ) : (
            <>
              <CopyIcon />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <rect
        x="5.25"
        y="2.25"
        width="8.5"
        height="8.5"
        rx="1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="2.25"
        y="5.25"
        width="8.5"
        height="8.5"
        rx="1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SuccessMark() {
  return (
    <span className="invite-creds__mark" aria-hidden>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
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

function inviteLeadCopy(email: string, emailDeliveryStatus?: string | null): string {
  if (emailDeliveryStatus === "sent") {
    return `Sign-in instructions were emailed to ${email}. You can also copy the details below.`;
  }
  return `Share these one-time sign-in details with ${email} through your usual secure channel.`;
}

/** Shown once after inviting a newly provisioned user. */
export function InviteCredentialsPanel({
  email,
  temporaryPassword,
  inviteUrl,
  invitePath,
  emailDeliveryStatus,
}: Props) {
  if (!temporaryPassword && !inviteUrl && !invitePath) {
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

  const link = resolveInviteLink(inviteUrl, invitePath);

  return (
    <div className="invite-creds">
      <div className="invite-creds__banner">
        <SuccessMark />
        <div className="invite-creds__body">
          <h4 className="invite-creds__title">Invite ready</h4>
          <p className="invite-creds__lead">
            {inviteLeadCopy(email, emailDeliveryStatus)}
          </p>
        </div>
      </div>

      <div className="invite-creds__fields">
        {temporaryPassword ? (
          <CopyField label="Temporary password" value={temporaryPassword} />
        ) : null}
        {link ? <CopyField label="Invite link" value={link} /> : null}
      </div>

      <p className="invite-creds__footnote">
        Shown once — copy before closing. Ask them to update their password after
        the first sign-in.
      </p>
    </div>
  );
}
