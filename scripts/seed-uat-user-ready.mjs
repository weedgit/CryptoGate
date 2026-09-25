/**
 * Mark a UAT demo user ready for gated mutations (commission confirm, etc.).
 * Sets first/last name, timezone, phone, and contact verification timestamps.
 *
 * @param {import("pg").Pool | import("pg").Client} pool
 * @param {string} userId
 * @param {{ firstName: string, lastName: string, phone?: string }} profile
 */
export async function markUatDemoUserReady(pool, userId, profile) {
  // Unique phone per user (users_phone_uidx) — derive from uuid when not provided.
  const digits = String(userId).replace(/\D/g, "").slice(-10).padStart(10, "0");
  const phone = profile.phone?.trim() || `+1555${digits}`;
  await pool.query(
    `UPDATE users
     SET first_name = $2,
         last_name = $3,
         timezone = COALESCE(NULLIF(timezone, ''), 'UTC'),
         phone = CASE
           WHEN phone IS NULL OR phone = '' THEN $4
           ELSE phone
         END,
         email_verified_at = COALESCE(email_verified_at, now()),
         phone_verified_at = COALESCE(phone_verified_at, now()),
         updated_at = now()
     WHERE id = $1`,
    [userId, profile.firstName, profile.lastName, phone],
  );
}
