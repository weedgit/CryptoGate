type Props = {
  email: string;
  temporaryPassword?: string | null;
  inviteUrl?: string | null;
  invitePath?: string | null;
  emailDeliveryStatus?: string | null;
};

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    window.prompt(`Copy ${label}`, value);
  }
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
      <p className="ok-msg">
        Added {email} (existing account — no new temporary password).
      </p>
    );
  }

  const link = inviteUrl || invitePath || "";

  return (
    <div className="panel settings-panel" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Invite credentials (copy now)</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Email delivery: {emailDeliveryStatus ?? "stubbed"} (SMTP not configured —
        credentials are shown here and logged by the mail stub).
      </p>
      {temporaryPassword ? (
        <div className="settings-field" style={{ marginBottom: 12 }}>
          <span className="settings-label">Temporary password</span>
          <code style={{ wordBreak: "break-all" }}>{temporaryPassword}</code>{" "}
          <button
            type="button"
            className="btn-ghost btn-inline"
            onClick={() => void copyText("temporary password", temporaryPassword)}
          >
            Copy
          </button>
        </div>
      ) : null}
      {link ? (
        <div className="settings-field">
          <span className="settings-label">Invite link</span>
          <code style={{ wordBreak: "break-all", fontSize: 12 }}>{link}</code>{" "}
          <button
            type="button"
            className="btn-ghost btn-inline"
            onClick={() => void copyText("invite link", link)}
          >
            Copy
          </button>
        </div>
      ) : null}
    </div>
  );
}
