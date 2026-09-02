#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i);
  if (!process.env[k]) process.env[k] = t.slice(i + 1);
}

const { getPool, closePool } = await import("../src/db/pool.mjs");
const { deleteOrgCascade } = await import("../src/orgs/org-delete.mjs");

const pool = getPool();
const { rows } = await pool.query(
  `SELECT id, name FROM org_accounts
   WHERE name = 'Downtown Store' AND type = 'merchant_site'
   LIMIT 1`,
);

if (!rows[0]) {
  console.log("RESULT:no_site");
  await closePool();
  process.exit(0);
}

const siteId = rows[0].id;
console.log("RESULT:site", siteId);

try {
  const result = await deleteOrgCascade(siteId);
  console.log("RESULT:ok", result.deletedOrgIds.join(","));
} catch (err) {
  console.log("RESULT:error", err.code || "none", err.message);
  if (err.detail) console.log("RESULT:detail", err.detail);
  if (err.constraint) console.log("RESULT:constraint", err.constraint);
  if (err.table) console.log("RESULT:table", err.table);
}

await closePool();
