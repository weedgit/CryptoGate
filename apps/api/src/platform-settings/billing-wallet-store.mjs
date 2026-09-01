import { getPool } from "../db/pool.mjs";
import { findPlatformOrg } from "../orgs/org-store.mjs";
import { listMemberEmailsGroupedByOrg } from "../orgs/membership-store.mjs";

/**
 * @typedef {{
 *   sellerName: string,
 *   sellerEmail: string | null,
 *   payTo: string | null,
 *   updatedAt: string,
 * }} PlatformBillingWalletSettings
 */

/**
 * @typedef {{ name: string, email: string | null }} PlatformInvoiceSeller
 */

/**
 * @param {object} row
 * @returns {Omit<PlatformBillingWalletSettings, "sellerEmail">}
 */
export function toPlatformBillingWalletSettings(row) {
  return {
    sellerName: row.seller_name?.trim() || "CryptoGate",
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

/**
 * Platform Owner email for invoice contact (Owner, then first team member).
 * @returns {Promise<string | null>}
 */
export async function resolvePlatformOwnerContactEmail() {
  const platform = await findPlatformOrg();
  if (!platform) return null;
  const grouped = await listMemberEmailsGroupedByOrg([platform.id]);
  const row = grouped[0];
  if (!row) return null;
  const owner = row.ownerEmail?.trim();
  if (owner) return owner;
  return row.emails.find((e) => e.trim())?.trim() ?? null;
}

/**
 * Invoice seller name (billing settings) + contact email (platform Owner).
 * @returns {Promise<PlatformInvoiceSeller>}
 */
export async function resolvePlatformInvoiceSeller() {
  const settings = await getPlatformBillingSettings();
  const envEmail = process.env.PLATFORM_INVOICE_SELLER_EMAIL?.trim() || null;
  return {
    name: settings.sellerName,
    email: settings.sellerEmail ?? envEmail,
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
  const ownerEmail = await resolvePlatformOwnerContactEmail();
  return {
    ...toPlatformBillingWalletSettings(rows[0]),
    sellerEmail: ownerEmail,
  };
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
 *   payTo: string | null,
 * }} input
 * @returns {Promise<PlatformBillingWalletSettings>}
 */
export async function updatePlatformBillingSettings(input) {
  await ensureSingletonRow();
  const { rows } = await getPool().query(
    `UPDATE platform_billing_settings
     SET seller_name = $1,
         pay_to = $2,
         updated_at = now()
     WHERE id = 1
     RETURNING id, seller_name, seller_email, pay_to, updated_at`,
    [input.sellerName, input.payTo],
  );
  const ownerEmail = await resolvePlatformOwnerContactEmail();
  return {
    ...toPlatformBillingWalletSettings(rows[0]),
    sellerEmail: ownerEmail,
  };
}
