/**
 * OpenAPI Session. memberships stay empty until M1-13/15 org tables exist.
 * @param {{ id: string, email: string }} user
 */
export function sessionFromUser(user) {
  return {
    userId: user.id,
    email: user.email,
    memberships: [],
  };
}
