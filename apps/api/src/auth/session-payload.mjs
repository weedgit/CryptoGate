/**
 * OpenAPI Session.
 * @param {{ id: string, email: string, mustChangePassword?: boolean, mfaEnrolled?: boolean }} user
 * @param {{ orgId: string, userId: string, role: string, orgType: string }[]} [memberships]
 */
export function sessionFromUser(user, memberships = []) {
  return {
    userId: user.id,
    email: user.email,
    mustChangePassword: user.mustChangePassword === true,
    mfaEnrolled: user.mfaEnrolled === true,
    memberships,
  };
}
