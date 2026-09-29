/**
 * Pure client-side invite / onboard email checks (no API deps).
 */

export type OrgRef = {
  id: string;
  type: string;
  name: string;
};

export type RegisteredEmailRef = OrgRef & {
  role: string;
};

export type OrgMemberEmail = {
  email?: string | null;
  role?: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function orgTypeLabel(type: string): string {
  if (type === "platform") return "Platform";
  if (type === "agent") return "Agent account";
  if (type === "merchant") return "Merchant account";
  if (type === "merchant_site") return "Merchant site";
  return type.replace(/_/g, " ");
}

function formatOrgRef(ref: RegisteredEmailRef): string {
  return `${orgTypeLabel(ref.type)} "${ref.name}"`;
}

/** One email = one account in one org; any registered email is blocked. */
export function ownerOnboardEmailConflict(
  email: string,
  index: ReadonlyMap<string, RegisteredEmailRef>,
): string | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  const hit = index.get(key);
  if (!hit) return null;
  return `This email is already registered (${formatOrgRef(hit)}). Each email can belong to only one account.`;
}

export const REGISTERED_EMAIL_API_MESSAGE =
  "This email is already registered. Each email can belong to only one account.";

export function orgMemberEmailExists(
  members: OrgMemberEmail[],
  email: string,
): boolean {
  const key = normalizeEmail(email);
  if (!key) return false;
  return members.some((m) => normalizeEmail(m.email ?? "") === key);
}

/**
 * Client-side team invite validation: any registered email is blocked
 * (one email = one account in one org with one role).
 */
export function validatePlatformInviteEmail(
  email: string,
  index: ReadonlyMap<string, RegisteredEmailRef>,
  opts: {
    targetOrgId: string;
    targetOrgType?: string;
    members?: OrgMemberEmail[];
  },
): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required.";
  if (opts.members && orgMemberEmailExists(opts.members, trimmed)) {
    return "User is already a member of this org.";
  }
  const hit = index.get(normalizeEmail(trimmed));
  if (hit) {
    if (opts.targetOrgId && hit.id === opts.targetOrgId) {
      return "User is already a member of this org.";
    }
    return ownerOnboardEmailConflict(trimmed, index);
  }
  return null;
}

export function inviteEmailErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "email_taken") return REGISTERED_EMAIL_API_MESSAGE;
  }
  if (err instanceof Error) return err.message;
  return "Invite failed";
}
