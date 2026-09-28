#!/usr/bin/env node
/**
 * Kevin Agent commission invoices for testing the agent Commissions page.
 *
 * One platform → agent invoice per UTC month in which Kevin's merchants paid
 * monthly service bills (same builder as the monthly job), then a status mix:
 *   - latest month  → issued   (owed, not sent yet)
 *   - next 2 months → paid     (sent, awaiting the agent's confirmation)
 *   - older months  → settled  (received, confirmed by the agent owner)
 * The current month is never invoiced; the page shows it as an estimate.
 *
 * Idempotent: re-running rebuilds amounts and re-applies the same statuses.
 *
 *   node scripts/seed-kevin-agent-commissions.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKER_AGENT = "Kevin Agent";
const CONFIRMER_EMAIL = "own.agent@paymentgate.io";
const SENT_COUNT = 2;

function loadEnv() {
  const files = [
    join(root, ".env"),
    "/etc/paymentgate/api.env",
    "/etc/cryptogate/api.env",
    "/etc/cryptogate/postgres.env",
  ];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const isEtc = file.startsWith("/etc/");
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if ((isEtc && key === "DATABASE_URL") || !process.env[key]) process.env[key] = val;
    }
  }
}

/** @param {string} periodKey YYYY-MM → Date at 00:00 UTC on `day` of the following month */
function nextMonthDay(periodKey, day, hour = 0) {
  const [y, m] = periodKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, day, hour));
}

function fakeTxRef(periodKey) {
  return createHash("sha256").update(`kevin-agent-commission:${periodKey}`).digest("hex");
}

async function main() {
  loadEnv();
  const { closePool, getPool } = await import("../apps/api/src/db/pool.mjs");
  const { buildInvoiceForAgent, currentCommissionPeriodKey, shouldCreateCommissionInvoice } =
    await import("../apps/api/src/commercial/commission-invoice-generate.mjs");
  const { upsertIssuedCommissionInvoiceRow } = await import(
    "../apps/api/src/commercial/commission-payout-store.mjs"
  );
  const pool = getPool();
  try {
    const { rows: agents } = await pool.query(
      `SELECT o.id, o.name, ac.commission_percent,
              apa.address, apa.asset, apa.network
       FROM org_accounts o
       LEFT JOIN agent_commission ac ON ac.org_id = o.id
       LEFT JOIN agent_payout_addresses apa ON apa.org_id = o.id
       WHERE o.name = $1 AND o.type = 'agent'
       LIMIT 1`,
      [MARKER_AGENT],
    );
    const agent = agents[0];
    if (!agent) throw new Error(`${MARKER_AGENT} not found — run scripts/seed-kevin-uat.mjs first`);
    const percent = String(agent.commission_percent ?? "18");
    const payout = agent.address
      ? { address: agent.address, asset: agent.asset, network: agent.network }
      : null;

    const { rows: confirmers } = await pool.query(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [CONFIRMER_EMAIL],
    );
    const confirmerId = confirmers[0]?.id ?? null;

    const current = currentCommissionPeriodKey();
    const { rows: months } = await pool.query(
      `WITH RECURSIVE subtree AS (
         SELECT id, type FROM org_accounts WHERE id = $1
         UNION ALL
         SELECT o.id, o.type FROM org_accounts o JOIN subtree s ON o.parent_id = s.id
       )
       SELECT DISTINCT to_char(sb.paid_at AT TIME ZONE 'UTC', 'YYYY-MM') AS period_key
       FROM service_bills sb
       JOIN subtree t ON t.id = sb.org_id AND t.type = 'merchant'
       WHERE sb.status = 'paid'
         AND COALESCE(sb.bill_kind, 'monthly') = 'monthly'
         AND sb.paid_at IS NOT NULL
       ORDER BY period_key`,
      [agent.id],
    );
    const periodKeys = months.map((r) => r.period_key).filter((k) => k < current);

    /** @type {{ id: string, periodKey: string, amount: number }[]} */
    const invoices = [];
    for (const periodKey of periodKeys) {
      const input = await buildInvoiceForAgent(agent.id, agent.name, periodKey, percent, payout);
      if (!shouldCreateCommissionInvoice(input.commissionAmount)) continue;
      await pool.query(
        `UPDATE commission_payouts
         SET payout_status = 'issued', paid_at = NULL, settled_at = NULL,
             agent_confirmed_by = NULL, tx_ref = NULL, note = NULL
         WHERE payee_org_id = $1 AND period_key = $2 AND payer = 'platform'`,
        [agent.id, periodKey],
      );
      const row = await upsertIssuedCommissionInvoiceRow(input);
      if (row) invoices.push({ id: row.id, periodKey, amount: Number(input.commissionAmount) });
    }

    invoices.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    const summary = { issued: 0, paid: 0, settled: 0 };
    for (const [index, inv] of invoices.entries()) {
      const createdAt = nextMonthDay(inv.periodKey, 1);
      if (index === 0) {
        await pool.query(
          `UPDATE commission_payouts SET created_at = $2, updated_at = $2 WHERE id = $1`,
          [inv.id, createdAt],
        );
        summary.issued += 1;
        continue;
      }
      const paidAt = nextMonthDay(inv.periodKey, 5, 14);
      const status = index <= SENT_COUNT ? "paid" : "settled";
      const settledAt = status === "settled" ? nextMonthDay(inv.periodKey, 7, 9) : null;
      await pool.query(
        `UPDATE commission_payouts
         SET payout_status = $2,
             paid_at = $3::timestamptz,
             settled_at = $4::timestamptz,
             agent_confirmed_by = $5,
             tx_ref = $6,
             note = 'USDT remittance (seed)',
             created_at = $7::timestamptz,
             updated_at = COALESCE($4::timestamptz, $3::timestamptz)
         WHERE id = $1`,
        [
          inv.id,
          status,
          paidAt,
          settledAt,
          status === "settled" ? confirmerId : null,
          fakeTxRef(inv.periodKey),
          createdAt,
        ],
      );
      summary[status] += 1;
    }

    console.log(`${MARKER_AGENT} (${percent}%): ${invoices.length} commission invoices`);
    for (const inv of invoices) {
      console.log(`  ${inv.periodKey}  $${inv.amount.toFixed(2)}`);
    }
    console.log(
      `  issued ${summary.issued} · sent (to confirm) ${summary.paid} · received ${summary.settled}`,
    );
    console.log(`  current month ${current} shows as the "Upcoming" estimate`);
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
