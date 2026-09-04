import type { InviteOrgUserResult } from "../merchant/api";

/** One-time owner invite credentials returned after onboard create + invite. */
export type OnboardInviteCreds = InviteOrgUserResult & {
  invitedEmail: string;
};

export type OnboardNavigateState = {
  onboardedOrgId?: string;
  invitationSent?: boolean;
  displayName?: string;
  inviteCreds?: OnboardInviteCreds | null;
};

export function onboardInviteCreds(
  invitedEmail: string,
  invite: InviteOrgUserResult,
): OnboardInviteCreds {
  return { ...invite, invitedEmail };
}
