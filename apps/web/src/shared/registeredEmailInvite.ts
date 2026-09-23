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
  if (type === "agent" || type === "agent_sub") return "Agent account";
  if (type === "merchant") return "Merchant account";
  if (type === "merchant_site") return "Merchant site";
  return type.replace(/_/g, " ");
}

function formatOrgRef(ref: RegisteredEmailRef): string {
  return `${orgTypeLabel(ref.type)} "${ref.name}"`;
}

function isPlatformOrAgentStaff(ref: RegisteredEmailRef): boolean {
  return (
    ref.type === "platform" ||
    ref.type === "agent" ||
    ref.type === "agent_sub"
  );
}

function isPlatformOrAgentOperator(ref: RegisteredEmailRef): boolean {
  return (
    isPlatformOrAgentStaff(ref) &&
    (ref.role === "owner" || ref.role === "administrator")
  );
}

/**
 * Owner email when onboarding a merchant/site — block Platform/Agent O/A
 * (API returns owner_invite_forbidden) and any other registered account.
 */
export function ownerOnboardEmailConflict(
  email: string,
  index: ReadonlyMap<string, RegisteredEmailRef>,
): string | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  const hit = index.get(key);
  if (!hit) return null;
  if (isPlatformOrAgentOperator(hit)) {
    return "Platform or agent Owner/Administrator emails cannot be the merchant or site Owner.";
  }
  return `This email is already registered on the platform (${formatOrgRef(hit)}).`;
}

export const REGISTERED_EMAIL_API_MESSAGE =
  "This email is already registered on the platform.";

export function orgMemberEmailExists(
  members: OrgMemberEmail[],
  email: string,
): boolean {
  const key = normalizeEmail(email);
  if (!key) return false;
  return members.some((m) => normalizeEmail(m.email ?? "") === key);
}

/**
 * Client-side invite validation for team invites.
 * Merchant/site targets may invite verified Platform/Agent O/A (API checks verify);
 * Viewers are blocked client-side. Other registered emails stay blocked.
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
  const key = normalizeEmail(trimmed);
  const hit = index.get(key);
  const sameOrg = hit && opts.targetOrgId && hit.id === opts.targetOrgId;
  if (hit && !sameOrg) {
    const merchantSiteTarget =
      opts.targetOrgType === "merchant" ||
      opts.targetOrgType === "merchant_site";
    if (merchantSiteTarget && isPlatformOrAgentStaff(hit)) {
      if (hit.role === "viewer") {
        return "Platform or agent Viewer accounts cannot join a merchant or site team.";
      }
      // Owner/Admin: allow through; API enforces email+phone verified.
    } else {
      return `This email is already registered on the platform (${formatOrgRef(hit)}).`;
    }
  }
  if (opts.members && orgMemberEmailExists(opts.members, trimmed)) {
    return "User is already a member of this org.";
  }
  return null;
}

export function inviteEmailErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "email_taken") return REGISTERED_EMAIL_API_MESSAGE;
    if (code === "owner_invite_forbidden") {
      return "Platform or agent Owner/Administrator emails cannot be the merchant or site Owner.";
    }
    if (code === "invite_role_forbidden") {
      return "Platform or agent Viewer accounts cannot join a merchant or site team.";
    }
    if (code === "invite_unverified") {
      return "That Platform or agent Owner/Administrator must verify email and phone before joining a merchant or site team.";
    }
  }
  if (err instanceof Error) return err.message;
  return "Invite failed";
}
