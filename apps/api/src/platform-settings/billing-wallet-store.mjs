import { getPool } from "../db/pool.mjs";

/**
 * @typedef {{
 *   sellerName: string,
 *   sellerEmail: string | null,
 *   payTo: string | null,
 *   updatedAt: string,
 * }} PlatformBillingWalletSettings
 */

/**
 * @param {object} row
 * @returns {PlatformBillingWalletSettings}
 */
export function toPlatformBillingWalletSettings(row) {
  return {
    sellerName: row.seller_name?.trim() || "CryptoGate",
    sellerEmail:
      row.seller_email != null && String(row.seller_email).trim()
        ? String(row.seller_email).trim()
        : null,
    payTo:
      row.pay_to != null && String(row.pay_to).trim()
        ? String(row.pay_to).trim()
        : null,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

async function ensureSingletonRow() {
  await getPool().query(
    `INSERT INTO platform_billing_settings (id, seller_name)
     VALUES (1, 'CryptoGate')
     ON CONFLICT (id) DO NOTHING`,
  );
}

/**
 * @returns {Promise<PlatformBillingWalletSettings>}
 */
export async function getPlatformBillingSettings() {
  await ensureSingletonRow();
  const { rows } = await getPool().query(
    `SELECT id, seller_name, seller_email, pay_to, updated_at
     FROM platform_billing_settings
     WHERE id = 1`,
  );
  return toPlatformBillingWalletSettings(rows[0]);
}

/**
 * Effective remittance destination: DB pay_to, else PLATFORM_BILLING_PAY_TO.
 * @returns {Promise<string | null>}
 */
export async function resolvePlatformBillingPayTo() {
  const settings = await getPlatformBillingSettings();
  if (settings.payTo) return settings.payTo;
  const env = process.env.PLATFORM_BILLING_PAY_TO?.trim();
  return env || null;
}

/**
 * @param {{
 *   sellerName: string,
 *   sellerEmail: string | null,
 *   payTo: string | null,
 * }} input
 * @returns {Promise<PlatformBillingWalletSettings>}
 */
export async function updatePlatformBillingSettings(input) {
  await ensureSingletonRow();
  const { rows } = await getPool().query(
    `UPDATE platform_billing_settings
     SET seller_name = $1,
         seller_email = $2,
         pay_to = $3,
         updated_at = now()
     WHERE id = 1
     RETURNING id, seller_name, seller_email, pay_to, updated_at`,
    [input.sellerName, input.sellerEmail, input.payTo],
  );
  return toPlatformBillingWalletSettings(rows[0]);
}
