#!/usr/bin/env node
/**
 * Add ~50 merchant accounts under selected Load agents for Accounts-tree scroll tests.
 *
 * Prerequisites: seed-local, seed-load-orgs, seed-load-accounts-rich
 * Idempotent: skips when "Load Bulk 001-01" already exists.
 *
 * Placement (Phase 1):
 *   Agent → Sub-Agent / Desk-A / agent root (never agent_sub → agent_sub)
 *   Every 5th bulk shop is multi_location with 1 site
 *
 * Targets: Load Agent 001, Load Agent 010 (50 merchants each after seed)
 *
 * Usage: node scripts/seed-load-accounts-bulk.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";

const PREFIX = "Load";
const TARGET_NAMES = [`${PREFIX} Agent 001`, `${PREFIX} Agent 010`];
const TARGET_MERCHANTS = 50;
const TIERS = ["small", "mid", "enterprise"];
const FEE_BY_TIER = { small: "1.8", mid: "1.2", enterprise: "0.9" };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://cryptogate:cryptogate@localhost:5432/cryptogate";
  }
}

function pad(n) {
  return String(n).padStart(3, "0");
}

function bulkName(agentNum, slot) {
  return `${PREFIX} Bulk ${pad(agentNum)}-${pad(slot)}`;
}

async function merchantCountInSubtree(pool, agentId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE tree AS (
       SELECT id, type, parent_id FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT c.id, c.type, c.parent_id
       FROM org_accounts c
       JOIN tree t ON c.parent_id = t.id
       WHERE c.type IN ('agent', 'agent_sub', 'merchant', 'merchant_site')
     )
     SELECT COUNT(*)::int AS n FROM tree WHERE type = 'merchant'`,
    [agentId],
  );
  return rows[0]?.n ?? 0;
}

async function accountNodeCountInSubtree(pool, agentId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE tree AS (
       SELECT id, type, parent_id FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT c.id, c.type, c.parent_id
       FROM org_accounts c
       JOIN tree t ON c.parent_id = t.id
       WHERE c.type IN ('agent', 'agent_sub', 'merchant', 'merchant_site')
     )
     SELECT COUNT(*)::int AS n FROM tree WHERE id <> $1`,
    [agentId],
  );
  return rows[0]?.n ?? 0;
}

async function ensureMembership(orgId, userId, role) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  if (rows.length === 0) {
    await insertMembership({ orgId, userId, role });
  }
}

async function main() {
  loadEnv();
  const pool = getPool();

  const platformOwner = await findUserByEmail("admin.platform@cryptogate.io");
  if (!platformOwner) {
    throw new Error(
      "Missing admin.platform@cryptogate.io — run seed-local first.",
    );
  }

  const { rows: marker } = await pool.query(
    `SELECT 1 FROM org_accounts WHERE name = $1 LIMIT 1`,
    [bulkName(1, 1)],
  );
  if (marker.length > 0) {
    console.log(
      `Bulk accounts seed already present (${bulkName(1, 1)} exists). Skipping.`,
    );
    return;
  }

  const { rows: agents } = await pool.query(
    `SELECT id, name FROM org_accounts
     WHERE type = 'agent' AND name = ANY($1::text[])
     ORDER BY name ASC`,
    [TARGET_NAMES],
  );
  if (agents.length === 0) {
    throw new Error(
      `No target agents (${TARGET_NAMES.join(", ")}) — run seed-load-orgs first.`,
    );
  }

  let created = 0;

  for (const agent of agents) {
    const m = /^Load Agent (\d+)$/.exec(agent.name);
    const agentNum = m ? Number(m[1]) : 0;

    const { rows: parents } = await pool.query(
      `SELECT id, name, type FROM org_accounts
       WHERE parent_id = $1 AND type = 'agent_sub'
       ORDER BY name ASC`,
      [agent.id],
    );
    const parentIds = [
      ...parents.map((p) => p.id),
      agent.id, // root merchants under agent
    ];
    if (parentIds.length === 1) {
      console.warn(`  ${agent.name}: no desks/subs — hanging all under agent`);
    }

    let have = await merchantCountInSubtree(pool, agent.id);
    console.log(`  ${agent.name}: ${have} merchants → target ${TARGET_MERCHANTS}`);

    let slot = 1;
    while (have < TARGET_MERCHANTS && slot <= 200) {
      const parentId = parentIds[(slot - 1) % parentIds.length];
      if (!parentId) break;
      const multi = slot % 5 === 0;
      const name = bulkName(agentNum, slot);
      const merchant = await insertOrgAccount({
        type: "merchant",
        name,
        parentId,
        structure: multi ? "multi_location" : "single_location",
        maxAgentDepth: null,
      });
      if (!merchant.ok) {
        if (merchant.code === "duplicate_sibling_name") {
          slot += 1;
          continue;
        }
        throw new Error(`Failed ${name}: ${merchant.code ?? "unknown"}`);
      }
      created += 1;
      have += 1;

      if (multi) {
        const site = await insertOrgAccount({
          type: "merchant_site",
          name: `${name} · Site 1`,
          parentId: merchant.row.id,
          structure: null,
          maxAgentDepth: null,
        });
        if (!site.ok && site.code !== "duplicate_sibling_name") {
          throw new Error(`site for ${name} failed`);
        }
      }

      const tier = TIERS[slot % TIERS.length];
      try {
        await bootstrapMerchantCommercial({
          orgId: merchant.row.id,
          tier,
          volumeFeePercent: FEE_BY_TIER[tier],
          actorUserId: platformOwner.id,
        });
      } catch (err) {
        if (!String(err?.message ?? err).includes("duplicate")) throw err;
      }
      await ensureMembership(merchant.row.id, platformOwner.id, "owner");
      await ensureMembership(parentId, platformOwner.id, "owner");

      slot += 1;
    }

    const merchants = await merchantCountInSubtree(pool, agent.id);
    const nodes = await accountNodeCountInSubtree(pool, agent.id);
    console.log(
      `  ${agent.name}: done — merchants=${merchants}, Accounts tree nodes≈${nodes}`,
    );
  }

  console.log(`\nBulk accounts seed ready (${created} merchants added).`);
  console.log("Open platform → Agents → Load Agent 001 / 010 → Accounts.");
  console.log("Tree scrolls inside the Accounts pane; expand desks to browse.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
