/**
 * Build commission invoice tree snapshots for UAT seeds (matches API generate logic).
 */

/**
 * @param {string} periodKey YYYY-MM
 */
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
  const { startIso, endExclusiveIso } = periodBoundsFromKey(periodKey);

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
     WHERE type IN ('merchant', 'merchant_site')
     ORDER BY name ASC`,
    [rootOrgId],
  );

  const merchantIds = merchants.map((m) => m.id);
  /** @type {Map<string, import("pg").QueryResultRow>} */
  const billByOrg = new Map();
  if (merchantIds.length > 0) {
    const { rows: bills } = await pool.query(
      `SELECT id, org_id, status, subscription_amount, volume_fee_amount
       FROM service_bills
       WHERE org_id = ANY($1::uuid[])
         AND period_start >= $2::date
         AND period_start < $3::date
       ORDER BY period_start ASC`,
      [merchantIds, startIso, endExclusiveIso],
    );
    for (const bill of bills) {
      if (!billByOrg.has(bill.org_id)) billByOrg.set(bill.org_id, bill);
    }
  }

  const lines = merchants.map((m) => {
    const bill = billByOrg.get(m.id) ?? null;
    const volumeFee = bill ? Number(bill.volume_fee_amount) : 0;
    const subscription = bill ? Number(bill.subscription_amount) : 0;
    const status = bill?.status ?? null;
    const included =
      status === "paid" && Number.isFinite(volumeFee) && volumeFee > 0;
    return {
      orgId: m.id,
      name: m.name,
      type: m.type,
      onboardedAt: m.created_at
        ? new Date(m.created_at).toISOString()
        : null,
      billId: bill?.id ?? null,
      billStatus: status,
      subscriptionAmount: Number.isFinite(subscription) ? subscription : 0,
      volumeFeeAmount: Number.isFinite(volumeFee) ? volumeFee : 0,
      includedInCommission: included,
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
