import { getPool } from "../db/pool.mjs";

const CALENDAR_DEFAULTS = {
  merchantPayDayStart: 5,
  merchantPayDayEnd: 10,
  agentPayDayStart: 10,
  agentPayDayEnd: 15,
  activationFeeUsd: "49.00",
  activationPayDays: 7,
  autoSendInvoices: false,
};

/**
 * @param {object} row
 */
export function toBillingCalendarSettings(row) {
  return {
    merchantPayDayStart: Number(row.merchant_pay_day_start ?? CALENDAR_DEFAULTS.merchantPayDayStart),
    merchantPayDayEnd: Number(row.merchant_pay_day_end ?? CALENDAR_DEFAULTS.merchantPayDayEnd),
    agentPayDayStart: Number(row.agent_pay_day_start ?? CALENDAR_DEFAULTS.agentPayDayStart),
    agentPayDayEnd: Number(row.agent_pay_day_end ?? CALENDAR_DEFAULTS.agentPayDayEnd),
    activationFeeUsd: String(row.activation_fee_usd ?? CALENDAR_DEFAULTS.activationFeeUsd),
    activationPayDays: Number(row.activation_pay_days ?? CALENDAR_DEFAULTS.activationPayDays),
    autoSendInvoices: Boolean(row.auto_send_invoices ?? CALENDAR_DEFAULTS.autoSendInvoices),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? new Date().toISOString()),
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
 * @returns {Promise<ReturnType<typeof toBillingCalendarSettings>>}
 */
export async function getBillingCalendarSettings() {
  await ensureSingletonRow();
  try {
    const { rows } = await getPool().query(
      `SELECT merchant_pay_day_start, merchant_pay_day_end,
              agent_pay_day_start, agent_pay_day_end,
              activation_fee_usd, activation_pay_days, auto_send_invoices,
              updated_at
       FROM platform_billing_settings
       WHERE id = 1`,
    );
    return toBillingCalendarSettings(rows[0] ?? {});
  } catch (err) {
    if (err && err.code === "42703") {
      return { ...CALENDAR_DEFAULTS, updatedAt: new Date().toISOString() };
    }
    throw err;
  }
}

/**
 * @param {{
 *   merchantPayDayStart: number,
 *   merchantPayDayEnd: number,
 *   agentPayDayStart: number,
 *   agentPayDayEnd: number,
 *   activationFeeUsd: string,
 *   activationPayDays: number,
 *   autoSendInvoices: boolean,
 * }} input
 */
export async function updateBillingCalendarSettings(input) {
  await ensureSingletonRow();
  const { rows } = await getPool().query(
    `UPDATE platform_billing_settings
     SET merchant_pay_day_start = $1,
         merchant_pay_day_end = $2,
         agent_pay_day_start = $3,
         agent_pay_day_end = $4,
         activation_fee_usd = $5,
         activation_pay_days = $6,
         auto_send_invoices = $7,
         updated_at = now()
     WHERE id = 1
     RETURNING merchant_pay_day_start, merchant_pay_day_end,
               agent_pay_day_start, agent_pay_day_end,
               activation_fee_usd, activation_pay_days, auto_send_invoices,
               updated_at`,
    [
      input.merchantPayDayStart,
      input.merchantPayDayEnd,
      input.agentPayDayStart,
      input.agentPayDayEnd,
      input.activationFeeUsd,
      input.activationPayDays,
      input.autoSendInvoices,
    ],
  );
  return toBillingCalendarSettings(rows[0]);
}
