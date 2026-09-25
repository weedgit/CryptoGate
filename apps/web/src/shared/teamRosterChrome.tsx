/** Shared icons + labels for portal Teams (B15 / C11 / D16) matching Accounts detail. */

export function InviteMarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.2 18.2c.7-2.7 2.8-4.1 5.8-4.1s5.1 1.4 5.8 4.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M18.2 8.2v5.2M15.6 10.8h5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
        d="M4.5 7.5 12 13l7.5-5.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.5 18.5c.8-2.8 3-4.2 6.5-4.2s5.7 1.4 6.5 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.2 3.2 12.8 6.8 5.5 14.1 2 14.6 2.5 11.1 9.2 3.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8.2 4.2 11.8 7.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.2 4.2h9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.2 4.1V3.2h3.6v.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4.2 4.2 4.8 13h6.4l.6-8.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 6.6v4.2M9.4 6.6v4.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.2 3.4h1.8v9.2H5.2zM9 3.4h1.8v9.2H9z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.2 3.2v9.6L12.6 8 5.2 3.2Z" fill="currentColor" />
    </svg>
  );
}

/** Load-test / authz-harness noise — hide from Platform Team roster UI. */
export function isLoadSeedTeamEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.startsWith("gen-") && e.endsWith("@paymentgate.local");
}

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function memberDisplayName(member: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const name = [member.firstName, member.lastName]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || displayNameFromEmail(member.email);
}
