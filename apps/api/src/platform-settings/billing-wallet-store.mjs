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
  const rawName = row.seller_name?.trim() || "PaymentGate";
  return {
    sellerName:
      /^payment\s*gate(\s+platform)?$/i.test(rawName) ? "PaymentGate" : rawName,
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
 * Invoice contact email: stored invoice email, then env, then platform Owner.
 * @param {string | null | undefined} storedEmail
 * @returns {Promise<string | null>}
 */
async function resolveInvoiceSellerEmail(storedEmail) {
  const stored =
    typeof storedEmail === "string" && storedEmail.trim()
      ? storedEmail.trim().toLowerCase()
      : null;
  if (stored) return stored;
  const envEmail = process.env.PLATFORM_INVOICE_SELLER_EMAIL?.trim() || null;
  if (envEmail) return envEmail;
  return resolvePlatformOwnerContactEmail();
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
 * Invoice seller name (billing settings) + invoice email.
 * @returns {Promise<PlatformInvoiceSeller>}
 */
export async function resolvePlatformInvoiceSeller() {
  const settings = await getPlatformBillingSettings();
  return {
    name: settings.sellerName,
    email: settings.sellerEmail,
  };
}

async function ensureSingletonRow() {
  await getPool().query(
    `INSERT INTO platform_billing_settings (id, seller_name)
     VALUES (1, 'PaymentGate')
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
  const base = toPlatformBillingWalletSettings(rows[0]);
  return {
    ...base,
    sellerEmail: await resolveInvoiceSellerEmail(rows[0]?.seller_email),
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
 *   sellerEmail?: string | null,
 *   payTo: string | null,
 * }} input
 * @returns {Promise<PlatformBillingWalletSettings>}
 */
export async function updatePlatformBillingSettings(input) {
  await ensureSingletonRow();
  const sellerEmail =
    input.sellerEmail === undefined
      ? undefined
      : typeof input.sellerEmail === "string" && input.sellerEmail.trim()
        ? input.sellerEmail.trim().toLowerCase().slice(0, 254)
        : null;
  const { rows } = await getPool().query(
    `UPDATE platform_billing_settings
     SET seller_name = $1,
         pay_to = $2,
         seller_email = CASE WHEN $3::boolean THEN $4 ELSE seller_email END,
         updated_at = now()
     WHERE id = 1
     RETURNING id, seller_name, seller_email, pay_to, updated_at`,
    [
      input.sellerName,
      input.payTo,
      sellerEmail !== undefined,
      sellerEmail ?? null,
    ],
  );
  const base = toPlatformBillingWalletSettings(rows[0]);
  return {
    ...base,
    sellerEmail: await resolveInvoiceSellerEmail(rows[0]?.seller_email),
  };
}
