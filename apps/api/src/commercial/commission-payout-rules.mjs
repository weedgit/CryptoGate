/**
 * Commission payout slip persistence (Decision 1b).
 * Phase 1: platform → agent invoices only (issued → paid → settled).
 */

/**
 * @param {unknown} body
 */
export function validateMarkPaidBody(body) {
  const rawTx = typeof body?.txRef === "string" ? body.txRef.trim() : "";
  const rawNote = typeof body?.note === "string" ? body.note.trim() : "";
  if (rawTx.length > 200) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "txRef must be at most 200 characters",
    };
  }
  if (rawNote.length > 2000) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "note must be at most 2000 characters",
    };
  }
  return {
    ok: true,
    parsed: {
      txRef: rawTx || null,
      note: rawNote || null,
    },
  };
}

/**
 * @param {object} row
 */
export function toCommissionPayout(row) {
  let treeSnapshot = row.tree_snapshot ?? null;
  if (typeof treeSnapshot === "string") {
    try {
      treeSnapshot = JSON.parse(treeSnapshot);
    } catch {
      treeSnapshot = null;
    }
  }
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
    note: row.note ?? null,
    treeSnapshot,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    settledAt: row.settled_at
      ? new Date(row.settled_at).toISOString()
      : null,
    agentConfirmedBy: row.agent_confirmed_by ?? null,
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : undefined,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
  };
}

/**
 * Scope GET /commission-payouts for a non-platform agent caller.
 * Agents only see platform → self invoices (payeeOrgId in their agent orgs).
 *
 * @param {string[]} agentOrgIds
 * @param {{ payer?: string, payeeOrgId?: string, payerOrgId?: string }} query
 * @returns {{ ok: true, filter: { payer?: string, payeeOrgId?: string } } | { ok: false, status: number, code: string, message: string }}
 */
export function scopedCommissionPayoutListFilter(agentOrgIds, query) {
  const payeeOrgId = query.payeeOrgId;

  if (query.payer && query.payer !== "platform") {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Agents may only list platform commission invoices",
    };
  }
  if (query.payerOrgId) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "payerOrgId is not available for agent callers",
    };
  }

  if (payeeOrgId && !agentOrgIds.includes(payeeOrgId)) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "payeeOrgId outside your agent scope",
    };
  }

  return {
    ok: true,
    filter: {
      payer: "platform",
      payeeOrgId:
        payeeOrgId && agentOrgIds.includes(payeeOrgId)
          ? payeeOrgId
          : agentOrgIds[0],
    },
  };
}
