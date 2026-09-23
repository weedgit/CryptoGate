/**
 * Build commission invoice tree snapshots for UAT seeds (matches API generate logic).
 */

/**
 * @param {string} periodKey YYYY-MM
 */
export function periodPaidBoundsFromKey(periodKey) {
  const [yRaw, mRaw] = periodKey.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    startIso: start.toISOString(),
    endExclusiveIso: end.toISOString(),
  };
}

/** @deprecated use periodPaidBoundsFromKey */
export function periodBoundsFromKey(periodKey) {
  const [yRaw, mRaw] = periodKey.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const startIso = `${periodKey}-01`;
  const end = new Date(Date.UTC(y, m, 1));
  const endExclusiveIso = end.toISOString().slice(0, 10);
  return { startIso, endExclusiveIso };
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} rootOrgId
 * @param {string} periodKey
 */
export async function buildCommissionTreeSnapshot(pool, rootOrgId, periodKey) {
  const { startIso, endExclusiveIso } = periodPaidBoundsFromKey(periodKey);

  const { rows: merchants } = await pool.query(
    `WITH RECURSIVE subtree AS (
       SELECT id, name, type, created_at, parent_id
       FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT o.id, o.name, o.type, o.created_at, o.parent_id
       FROM org_accounts o
       INNER JOIN subtree s ON o.parent_id = s.id
     )
     SELECT id, name, type, created_at
     FROM subtree
     WHERE type = 'merchant'
     ORDER BY name ASC`,
    [rootOrgId],
  );

  const merchantIds = merchants.map((m) => m.id);
  /** @type {Map<string, import("pg").QueryResultRow[]>} */
  const billsByOrg = new Map();
  if (merchantIds.length > 0) {
    const { rows: bills } = await pool.query(
      `SELECT id, org_id, status, subscription_amount, volume_fee_amount
       FROM service_bills
       WHERE org_id = ANY($1::uuid[])
         AND status = 'paid'
         AND paid_at >= $2::timestamptz
         AND paid_at < $3::timestamptz
         AND COALESCE(bill_kind, 'monthly') = 'monthly'
       ORDER BY paid_at ASC`,
      [merchantIds, startIso, endExclusiveIso],
    );
    for (const bill of bills) {
      const list = billsByOrg.get(bill.org_id) ?? [];
      list.push(bill);
      billsByOrg.set(bill.org_id, list);
    }
  }

  const lines = merchants.map((m) => {
    const bills = billsByOrg.get(m.id) ?? [];
    let subscription = 0;
    let volumeFee = 0;
    /** @type {string | null} */
    let billId = null;
    for (const bill of bills) {
      const sub = Number(bill.subscription_amount);
      const vol = Number(bill.volume_fee_amount);
      if (Number.isFinite(sub)) subscription += sub;
      if (Number.isFinite(vol)) volumeFee += vol;
      if (!billId) billId = bill.id ?? null;
    }
    subscription = Math.round(subscription * 100) / 100;
    volumeFee = Math.round(volumeFee * 100) / 100;
    const fee = Math.round((subscription + volumeFee) * 100) / 100;
    const included = fee > 0;
    return {
      orgId: m.id,
      name: m.name,
      type: m.type,
      onboardedAt: m.created_at
        ? new Date(m.created_at).toISOString()
        : null,
      billId,
      billStatus: included ? "paid" : null,
      subscriptionAmount: subscription,
      volumeFeeAmount: volumeFee,
      includedInCommission: included,
      paidBillCount: bills.length,
    };
  });

  return {
    periodKey,
    generatedAt: new Date().toISOString(),
    merchants: lines,
  };
}

/**
 * Backfill tree_snapshot on commission payout rows (seed-safe: updates all missing).
 * @param {import("pg").Pool} pool
 * @param {{ payeeNameLike?: string }} [opts]
 */
export async function patchCommissionTreeSnapshots(pool, opts = {}) {
  const params = [];
  let where = `tree_snapshot IS NULL OR tree_snapshot = 'null'::jsonb
    OR COALESCE(jsonb_array_length(tree_snapshot->'merchants'), 0) = 0`;
  if (opts.payeeNameLike) {
    params.push(opts.payeeNameLike);
    where += ` AND payee_name LIKE $${params.length}`;
  }

  const { rows: payouts } = await pool.query(
    `SELECT id, payee_org_id, period_key, payee_name
     FROM commission_payouts
     WHERE ${where}
     ORDER BY period_key, payee_name`,
    params,
  );

  let updated = 0;
  for (const row of payouts) {
    const treeSnapshot = await buildCommissionTreeSnapshot(
      pool,
      row.payee_org_id,
      row.period_key,
    );
    if (!treeSnapshot.merchants.length) continue;
    await pool.query(
      `UPDATE commission_payouts
       SET tree_snapshot = $2::jsonb, updated_at = now()
       WHERE id = $1`,
      [row.id, JSON.stringify(treeSnapshot)],
    );
    updated += 1;
  }
  return { scanned: payouts.length, updated };
}
