import { getPool } from "../db/pool.mjs";
import { merchantCommercialEffectiveFromToday } from "./merchant-commercial-rules.mjs";
import { nextBillingPeriodStart } from "../platform-settings/fee-tier-rules.mjs";

const SELECT_COLS = `org_id, tier, volume_fee_percent, pending_volume_fee_percent,
            pending_tier, effective_from, pending_effective_from,
            enterprise_approval_status,
            COALESCE(rate_mode, 'automatic') AS rate_mode,
            fee_exempt_until, skip_activation, billing_ops_note,
            COALESCE(service_bill_credit_usd, '0.00') AS service_bill_credit_usd,
            billing_anchor_at, next_invoice_on, volume_period_start,
            created_at, updated_at`;
const SELECT_COLS_LEGACY = `org_id, tier, volume_fee_percent, pending_volume_fee_percent,
            pending_tier, effective_from, pending_effective_from,
            enterprise_approval_status,
            COALESCE(rate_mode, 'automatic') AS rate_mode,
            created_at, updated_at`;
const SELECT_COLS_FLAGS = `org_id, tier, volume_fee_percent, pending_volume_fee_percent,
            pending_tier, effective_from, pending_effective_from,
            enterprise_approval_status,
            COALESCE(rate_mode, 'automatic') AS rate_mode,
            fee_exempt_until, skip_activation, billing_ops_note,
            COALESCE(service_bill_credit_usd, '0.00') AS service_bill_credit_usd,
            created_at, updated_at`;

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function queryCommercial(sql, params = []) {
  try {
    return await getPool().query(sql, params);
  } catch (err) {
    if (err && err.code === "42703") {
      if (sql.includes("billing_anchor_at") || sql.includes("next_invoice_on")) {
        const stripped = sql
          .replace(/,\s*billing_anchor_at/g, "")
          .replace(/,\s*next_invoice_on/g, "")
          .replace(/,\s*volume_period_start/g, "")
          .replace(SELECT_COLS, SELECT_COLS_FLAGS);
        try {
          return await getPool().query(stripped, params);
        } catch (inner) {
          if (!(inner && inner.code === "42703")) throw inner;
        }
      }
      if (sql.includes("fee_exempt_until")) {
        const stripped = sql
          .replace(/,\s*fee_exempt_until/g, "")
          .replace(/,\s*skip_activation/g, "")
          .replace(/,\s*billing_ops_note/g, "")
          .replace(/,\s*COALESCE\(service_bill_credit_usd, '0\.00'\) AS service_bill_credit_usd/g, "")
          .replace(SELECT_COLS, SELECT_COLS_LEGACY)
          .replace(SELECT_COLS_FLAGS, SELECT_COLS_LEGACY);
        return getPool().query(stripped, params);
      }
    }
    throw err;
  }
}

/**
 * @param {string} orgId
 */
export async function findMerchantCommercial(orgId) {
  const { rows } = await queryCommercial(
    `SELECT ${SELECT_COLS}
     FROM merchant_commercial WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * Bulk commercial lookup for list pages (avoids N+1).
 * @param {string[]} orgIds
 */
export async function listMerchantCommercialByOrgIds(orgIds) {
  if (orgIds.length === 0) return [];
  const { rows } = await queryCommercial(
    `SELECT ${SELECT_COLS}
     FROM merchant_commercial
     WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  return rows;
}

/**
 * @param {{
 *   orgId: string,
 *   tier: string,
 *   volumeFeePercent: string,
 *   rateMode?: "automatic" | "fixed",
 *   effectiveFrom?: string,
 *   enterpriseApprovalStatus?: string | null,
 * }} input
 */
export async function insertMerchantCommercial(input) {
  const effectiveFrom =
    input.effectiveFrom ?? merchantCommercialEffectiveFromToday();
  const rateMode = input.rateMode === "fixed" ? "fixed" : "automatic";
  const { rows } = await getPool().query(
    `INSERT INTO merchant_commercial (
       org_id, tier, volume_fee_percent, effective_from,
       enterprise_approval_status, rate_mode
     ) VALUES ($1, $2, $3, $4::date, $5, $6)
     RETURNING ${SELECT_COLS}`,
    [
      input.orgId,
      input.tier,
      input.volumeFeePercent,
      effectiveFrom,
      input.enterpriseApprovalStatus ?? null,
      rateMode,
    ],
  );
  return rows[0];
}

/**
 * Apply scheduled change for next billing period.
 * @param {string} orgId
 * @param {{ tier: string, volumeFeePercent: string, reason?: string }} change
 */
export async function scheduleMerchantCommercialChange(orgId, change) {
  const pendingFrom = nextBillingPeriodStart();
  const { rows } = await getPool().query(
    `UPDATE merchant_commercial
     SET pending_tier = $2,
         pending_volume_fee_percent = $3,
         pending_effective_from = $4::date,
         enterprise_approval_status = NULL,
         updated_at = now()
     WHERE org_id = $1
     RETURNING ${SELECT_COLS}`,
    [orgId, change.tier, change.volumeFeePercent, pendingFrom],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {{
 *   tier: string,
 *   volumeFeePercent: string,
 *   rateMode?: "automatic" | "fixed",
 * }} applied
 */
export async function applyMerchantCommercialImmediate(orgId, applied) {
  const effectiveFrom = merchantCommercialEffectiveFromToday();
  const rateMode = applied.rateMode === "fixed" ? "fixed" : "automatic";
  const { rows } = await getPool().query(
    `UPDATE merchant_commercial
     SET tier = $2,
         volume_fee_percent = $3,
         rate_mode = $5,
         effective_from = $4::date,
         pending_tier = NULL,
         pending_volume_fee_percent = NULL,
         pending_effective_from = NULL,
         enterprise_approval_status = NULL,
         updated_at = now()
     WHERE org_id = $1
     RETURNING ${SELECT_COLS}`,
    [orgId, applied.tier, applied.volumeFeePercent, effectiveFrom, rateMode],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 */
export async function setEnterpriseApprovalPending(orgId) {
  await getPool().query(
    `UPDATE merchant_commercial
     SET enterprise_approval_status = 'pending', updated_at = now()
     WHERE org_id = $1`,
    [orgId],
  );
}

/**
 * @param {string} orgId
 * @param {"approved" | "denied"} status
 * @param {{ tier: string, volumeFeePercent: string, rateMode?: "automatic" | "fixed" }} [applied]
 */
export async function finalizeEnterpriseApproval(orgId, status, applied) {
  if (status === "approved" && applied) {
    return applyMerchantCommercialImmediate(orgId, {
      ...applied,
      rateMode: applied.rateMode ?? "fixed",
    });
  }
  const { rows } = await getPool().query(
    `UPDATE merchant_commercial
     SET enterprise_approval_status = $2,
         pending_tier = NULL,
         pending_volume_fee_percent = NULL,
         pending_effective_from = NULL,
         updated_at = now()
     WHERE org_id = $1
     RETURNING ${SELECT_COLS}`,
    [orgId, status],
  );
  return rows[0] ?? null;
}

/**
 * Platform billing flags / next-period credit on a merchant.
 * @param {string} orgId
 * @param {{
 *   feeExemptUntil?: string | null,
 *   skipActivation?: boolean,
 *   billingOpsNote?: string | null,
 *   serviceBillCreditUsd?: string,
 * }} patch
 */
export async function updateMerchantBillingFlags(orgId, patch) {
  const current = await findMerchantCommercial(orgId);
  if (!current) return null;
  const feeExemptUntil =
    patch.feeExemptUntil !== undefined
      ? patch.feeExemptUntil
      : current.fee_exempt_until
        ? current.fee_exempt_until instanceof Date
          ? current.fee_exempt_until.toISOString().slice(0, 10)
          : String(current.fee_exempt_until).slice(0, 10)
        : null;
  const skipActivation =
    patch.skipActivation !== undefined
      ? Boolean(patch.skipActivation)
      : Boolean(current.skip_activation);
  const billingOpsNote =
    patch.billingOpsNote !== undefined
      ? patch.billingOpsNote
      : current.billing_ops_note ?? null;
  const credit =
    patch.serviceBillCreditUsd !== undefined
      ? patch.serviceBillCreditUsd
      : String(current.service_bill_credit_usd ?? "0.00");
  try {
    const { rows } = await getPool().query(
      `UPDATE merchant_commercial
       SET fee_exempt_until = $2::date,
           skip_activation = $3,
           billing_ops_note = $4,
           service_bill_credit_usd = $5,
           updated_at = now()
       WHERE org_id = $1
       RETURNING ${SELECT_COLS}`,
      [orgId, feeExemptUntil, skipActivation, billingOpsNote, credit],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "42703") return current;
    throw err;
  }
}

/**
 * @param {string} orgId
 * @param {string} addUsd
 */
export async function addMerchantServiceBillCredit(orgId, addUsd) {
  const current = await findMerchantCommercial(orgId);
  if (!current) return null;
  const { applyUsdAdjustment } = await import(
    "../service-bills/service-bill-rules.mjs"
  );
  const next = applyUsdAdjustment(
    String(current.service_bill_credit_usd ?? "0.00"),
    addUsd,
  );
  return updateMerchantBillingFlags(orgId, { serviceBillCreditUsd: next });
}

/**
 * Consume credit up to bill total.
 * @param {string} orgId
 * @param {string} totalAmount
 */
export async function consumeMerchantServiceBillCredit(orgId, totalAmount) {
  const current = await findMerchantCommercial(orgId);
  const creditRaw = String(current?.service_bill_credit_usd ?? "0.00");
  const { isUsdAmount } = await import("../service-bills/service-bill-rules.mjs");
  if (
    !current ||
    !isUsdAmount(creditRaw) ||
    creditRaw === "0" ||
    creditRaw === "0.00"
  ) {
    return {
      creditApplied: "0.00",
      remainingCredit: "0.00",
      newTotal: totalAmount,
    };
  }
  const toCents = (s) => {
    const [w, f = ""] = s.split(".");
    return BigInt(w) * 100n + BigInt((f + "00").slice(0, 2));
  };
  const toUsd = (c) => {
    const w = c / 100n;
    const f = (c % 100n).toString().padStart(2, "0");
    return `${w}.${f}`;
  };
  const totalC = toCents(totalAmount);
  const creditC = toCents(creditRaw);
  const appliedC = creditC > totalC ? totalC : creditC;
  const remainingC = creditC - appliedC;
  const newTotal = toUsd(totalC - appliedC);
  await updateMerchantBillingFlags(orgId, {
    serviceBillCreditUsd: toUsd(remainingC),
  });
  return {
    creditApplied: toUsd(appliedC),
    remainingCredit: toUsd(remainingC),
    newTotal,
  };
}

/**
 * After activation paid: set anchor and first recurring invoice date (+1 month).
 * @param {string} orgId
 * @param {Date | string} paidAt
 */
export async function setBillingAnchorFromActivationPaid(orgId, paidAt) {
  const { addOneMonthUtcDateString } = await import(
    "../service-bills/billing-anchor-rules.mjs"
  );
  const paid = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const paidYmd = paid.toISOString().slice(0, 10);
  const nextInvoiceOn = addOneMonthUtcDateString(paid);
  try {
    const { rows } = await getPool().query(
      `UPDATE merchant_commercial
       SET billing_anchor_at = $2::timestamptz,
           next_invoice_on = $3::date,
           volume_period_start = $4::date,
           updated_at = now()
       WHERE org_id = $1
       RETURNING ${SELECT_COLS}`,
      [orgId, paid.toISOString(), nextInvoiceOn, paidYmd],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "42703") return findMerchantCommercial(orgId);
    throw err;
  }
}

/**
 * After late pay while paused: new anchor E, next invoice E+1 month.
 * Keeps volume_period_start so gap volume is included on the next bill.
 * @param {string} orgId
 * @param {Date | string} paidAt
 */
export async function resetBillingAnchorAfterLatePay(orgId, paidAt) {
  const { addOneMonthUtcDateString } = await import(
    "../service-bills/billing-anchor-rules.mjs"
  );
  const paid = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const nextInvoiceOn = addOneMonthUtcDateString(paid);
  try {
    const { rows } = await getPool().query(
      `UPDATE merchant_commercial
       SET billing_anchor_at = $2::timestamptz,
           next_invoice_on = $3::date,
           updated_at = now()
       WHERE org_id = $1
       RETURNING ${SELECT_COLS}`,
      [orgId, paid.toISOString(), nextInvoiceOn],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "42703") return findMerchantCommercial(orgId);
    throw err;
  }
}

/**
 * Advance schedule after a recurring invoice was created for cycle ending on invoiceOn.
 * @param {string} orgId
 * @param {string} invoiceOn YYYY-MM-DD
 */
export async function advanceNextInvoiceOn(orgId, invoiceOn) {
  const { addOneMonthUtcDateString } = await import(
    "../service-bills/billing-anchor-rules.mjs"
  );
  const next = addOneMonthUtcDateString(`${invoiceOn}T12:00:00.000Z`);
  try {
    const { rows } = await getPool().query(
      `UPDATE merchant_commercial
       SET volume_period_start = $2::date,
           next_invoice_on = $3::date,
           updated_at = now()
       WHERE org_id = $1
       RETURNING ${SELECT_COLS}`,
      [orgId, invoiceOn, next],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "42703") return findMerchantCommercial(orgId);
    throw err;
  }
}

/**
 * Merchants due for a recurring invoice on or before today (UTC).
 * @param {string} [todayYmd]
 */
export async function listMerchantsDueForRecurringInvoice(todayYmd) {
  const day = todayYmd ?? new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await getPool().query(
      `SELECT ${SELECT_COLS}
       FROM merchant_commercial
       WHERE next_invoice_on IS NOT NULL
         AND next_invoice_on <= $1::date
         AND billing_anchor_at IS NOT NULL`,
      [day],
    );
    return rows;
  } catch (err) {
    if (err && err.code === "42703") return [];
    throw err;
  }
}

/**
 * @param {string} orgId
 */
export async function merchantHasBillingAnchor(orgId) {
  const row = await findMerchantCommercial(orgId);
  return Boolean(row?.billing_anchor_at);
}
