import { getPool } from "../db/pool.mjs";

/**
 * All org ids in subtree (root first, then breadth-by-depth).
 * @param {string} rootOrgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function listOrgSubtreeIds(rootOrgId, client) {
  const q = client ?? getPool();
  const { rows } = await q.query(
    `WITH RECURSIVE subtree AS (
       SELECT id, 0 AS depth FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT o.id, s.depth + 1
       FROM org_accounts o
       INNER JOIN subtree s ON o.parent_id = s.id
     )
     SELECT id, depth FROM subtree ORDER BY depth DESC, id ASC`,
    [rootOrgId],
  );
  return rows.map((r) => ({ id: r.id, depth: r.depth }));
}

/**
 * Impact summary for delete confirmation UI.
 * @param {string} rootOrgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function summarizeOrgDeleteImpact(rootOrgId, client) {
  const q = client ?? getPool();
  const { rows: orgRows } = await q.query(
    `WITH RECURSIVE subtree AS (
       SELECT id, type, name, 0 AS depth FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT o.id, o.type, o.name, s.depth + 1
       FROM org_accounts o
       INNER JOIN subtree s ON o.parent_id = s.id
     )
     SELECT id, type, name, depth FROM subtree ORDER BY depth ASC, name ASC`,
    [rootOrgId],
  );
  const orgIds = orgRows.map((r) => r.id);
  if (orgIds.length === 0) {
    return {
      rootOrgId,
      orgCount: 0,
      childOrgCount: 0,
      memberCount: 0,
      orderCount: 0,
      billCount: 0,
      orgs: [],
    };
  }

  const [members, orders, bills] = await Promise.all([
    q.query(
      `SELECT COUNT(*)::int AS n FROM org_memberships WHERE org_id = ANY($1::uuid[])`,
      [orgIds],
    ),
    q.query(
      `SELECT COUNT(*)::int AS n FROM payment_orders WHERE org_id = ANY($1::uuid[])`,
      [orgIds],
    ),
    q.query(
      `SELECT COUNT(*)::int AS n FROM service_bills WHERE org_id = ANY($1::uuid[])`,
      [orgIds],
    ),
  ]);

  return {
    rootOrgId,
    orgCount: orgRows.length,
    childOrgCount: Math.max(0, orgRows.length - 1),
    memberCount: members.rows[0]?.n ?? 0,
    orderCount: orders.rows[0]?.n ?? 0,
    billCount: bills.rows[0]?.n ?? 0,
    orgs: orgRows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      depth: r.depth,
    })),
  };
}

/**
 * Remove operational rows that block org_accounts DELETE (RESTRICT FKs).
 * @param {string} orgId
 * @param {import("pg").PoolClient} client
 */
async function purgeOrgOperationalData(orgId, client) {
  await client.query(
    `DELETE FROM commission_payouts WHERE payee_org_id = $1 OR payer_org_id = $1`,
    [orgId],
  );
  await client.query(`DELETE FROM payment_order_webhook_outbox WHERE org_id = $1`, [
    orgId,
  ]);
  await client.query(`DELETE FROM webhook_endpoints WHERE org_id = $1`, [orgId]);
  await client.query(`DELETE FROM api_keys WHERE org_id = $1`, [orgId]);
  await client.query(`DELETE FROM payment_orders WHERE org_id = $1`, [orgId]);
  await client.query(`DELETE FROM service_bills WHERE org_id = $1`, [orgId]);
}

/**
 * Cascade-delete an org subtree: deepest children first, including members (via
 * membership CASCADE) and operational data purged per org.
 * @param {string} rootOrgId
 * @returns {Promise<{ deletedOrgIds: string[], summary: Awaited<ReturnType<typeof summarizeOrgDeleteImpact>> }>}
 */
export async function deleteOrgCascade(rootOrgId) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const summary = await summarizeOrgDeleteImpact(rootOrgId, client);
    if (summary.orgCount === 0) {
      await client.query("ROLLBACK");
      return { deletedOrgIds: [], summary };
    }

    const ordered = await listOrgSubtreeIds(rootOrgId, client);
    const deletedOrgIds = [];
    for (const { id } of ordered) {
      await purgeOrgOperationalData(id, client);
      const { rowCount } = await client.query(
        `DELETE FROM org_accounts WHERE id = $1`,
        [id],
      );
      if (rowCount > 0) deletedOrgIds.push(id);
    }

    await client.query("COMMIT");
    return { deletedOrgIds, summary };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && err.code === "23503") {
      const e = new Error(
        "Account still has linked records that could not be removed automatically.",
      );
      e.code = "has_dependencies";
      throw e;
    }
    throw err;
  } finally {
    client.release();
  }
}
