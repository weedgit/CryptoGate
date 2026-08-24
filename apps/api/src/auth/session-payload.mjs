/**
 * OpenAPI Session.
 * @param {{ id: string, email: string }} user
 * @param {{ orgId: string, userId: string, role: string, orgType: string }[]} [memberships]
 */
export function sessionFromUser(user, memberships = []) {
  return {
    userId: user.id,
    email: user.email,
    memberships,
  };
}
