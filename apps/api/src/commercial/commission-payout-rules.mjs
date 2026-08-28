/**
 * Commission payout slip persistence (Decision 1b).
 */

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: object } | { ok: false, status: number, code: string, message: string }}
 */
export function validateUpsertCommissionPayoutBody(body) {
  const payeeOrgId =
    typeof body?.payeeOrgId === "string" ? body.payeeOrgId.trim() : "";
  const payeeName =
    typeof body?.payeeName === "string" ? body.payeeName.trim() : "";
  const payer = body?.payer === "agent" ? "agent" : body?.payer === "platform" ? "platform" : "";
  const payerOrgId =
    typeof body?.payerOrgId === "string" && body.payerOrgId.trim()
      ? body.payerOrgId.trim()
      : null;
  const periodKey =
    typeof body?.periodKey === "string" ? body.periodKey.trim() : "";
  const periodLabel =
    typeof body?.periodLabel === "string" ? body.periodLabel.trim() : "";
  const commissionPercent =
    typeof body?.commissionPercent === "string"
      ? body.commissionPercent.trim()
      : "";
  const paymentLink =
    typeof body?.paymentLink === "string" ? body.paymentLink.trim() : "";

  const platformFeeCollected = Number(body?.platformFeeCollected);
  const commissionAmount = Number(body?.commissionAmount);

  if (!payeeOrgId || !payeeName || !payer || !periodKey || !periodLabel) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message:
        "payeeOrgId, payeeName, payer, periodKey, and periodLabel are required",
    };
  }
  if (!commissionPercent || !paymentLink) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "commissionPercent and paymentLink are required",
    };
  }
  if (!Number.isFinite(platformFeeCollected) || platformFeeCollected < 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "platformFeeCollected must be a non-negative number",
    };
  }
  if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "commissionAmount must be a non-negative number",
    };
  }
  if (payer === "platform" && payerOrgId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "payerOrgId must be null for platform payouts",
    };
  }
  if (payer === "agent" && !payerOrgId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "payerOrgId is required for agent → sub payouts",
    };
  }

  const payoutAddress =
    typeof body?.payoutAddress === "string" && body.payoutAddress.trim()
      ? body.payoutAddress.trim()
      : null;
  const asset =
    typeof body?.asset === "string" && body.asset.trim()
      ? body.asset.trim()
      : null;
  const network =
    typeof body?.network === "string" && body.network.trim()
      ? body.network.trim()
      : null;

  return {
    ok: true,
    parsed: {
      payeeOrgId,
      payeeName,
      payer,
      payerOrgId,
      periodKey,
      periodLabel,
      platformFeeCollected,
      commissionPercent,
      commissionAmount,
      payoutAddress,
      asset,
      network,
      paymentLink,
    },
  };
}

/**
 * @param {unknown} body
 */
export function validateMarkPaidBody(body) {
  const txRef =
    typeof body?.txRef === "string" ? body.txRef.trim() : "";
  if (!txRef) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "txRef is required",
    };
  }
  return { ok: true, parsed: { txRef } };
}

/**
 * @param {object} row
 */
export function toCommissionPayout(row) {
  return {
    id: row.id,
    payeeOrgId: row.payee_org_id,
    payeeName: row.payee_name,
    payer: row.payer,
    payerOrgId: row.payer_org_id ?? null,
    periodKey: row.period_key,
    periodLabel: row.period_label,
    platformFeeCollected: Number(row.platform_fee_collected),
    commissionPercent: row.commission_percent,
    commissionAmount: Number(row.commission_amount),
    payoutStatus: row.payout_status,
    payoutAddress: row.payout_address ?? null,
    asset: row.asset ?? null,
    network: row.network ?? null,
    paymentLink: row.payment_link,
    txRef: row.tx_ref ?? null,
    paidAt: row.paid_at
      ? new Date(row.paid_at).toISOString()
      : null,
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : undefined,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
  };
}
