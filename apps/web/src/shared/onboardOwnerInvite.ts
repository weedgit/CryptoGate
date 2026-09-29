import { inviteOrgUser, type InviteOrgUserResult } from "../merchant/api";
import { ApiError } from "./apiCore";
import { deleteOrg } from "./orgApi";

/**
 * Invite the Owner of an org that was just onboarded. When the email turns out to be
 * registered already, the new org is removed so it is not left without an Owner.
 */
export async function inviteOwnerOrRollback(
  orgId: string,
  email: string,
): Promise<InviteOrgUserResult> {
  try {
    return await inviteOrgUser(orgId, { email, role: "owner" });
  } catch (err) {
    if (err instanceof ApiError && err.code === "email_taken") {
      await deleteOrg(orgId, { cascade: true }).catch(() => undefined);
    }
    throw err;
  }
}
