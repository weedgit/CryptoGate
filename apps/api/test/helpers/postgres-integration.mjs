import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ServiceBillStatus } from "@paymentgate/domain";
import { createSession } from "../../src/auth/sessions.mjs";
import { createUser, findUserByEmail } from "../../src/auth/users.mjs";
import { closePool, getPool } from "../../src/db/pool.mjs";
import { handleRequest } from "../../src/http/app.mjs";
import { SESSION_COOKIE_NAME } from "../../src/http/cookies.mjs";
import { insertMembership } from "../../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../../src/orgs/org-store.mjs";
import { insertServiceBill } from "../../src/service-bills/service-bill-store.mjs";

export const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function hasPostgres() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function runMigrations() {
  const result = spawnSync("node", ["scripts/migrate.mjs"], {
    cwd: apiRoot,
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `migrate failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
}

/**
 * @returns {Promise<{ server: import("node:http").Server, base: string }>}
 */
export async function startTestServer() {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
  });
  const base = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("could not bind test HTTP server"));
        return;
      }
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
  return { server, base };
}

/**
 * @param {import("node:http").Server} server
 */
export async function stopTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * @param {string} base
 * @param {string} path
 * @param {{
 *   method?: string,
 *   token?: string,
 *   body?: object,
 * }} [opts]
 */
export async function apiFetch(base, path, opts = {}) {
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (opts.token) {
    headers.Cookie = `${SESSION_COOKIE_NAME}=${opts.token}`;
  }
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  /** @type {unknown} */
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

const SEED_PREFIX = "v032-int-";
const SEED_PASSWORD = "V032TestPass12!";

/**
 * Platform operator + merchant cashier for v0.3.2 integration tests.
 * @returns {Promise<{
 *   platformUserId: string,
 *   merchantOrgId: string,
 *   platformOrgId: string,
 *   platformToken: string,
 *   cashierToken: string,
 * }>}
 */
export async function ensureV032Seed() {
  const platformEmail = `${SEED_PREFIX}platform@paymentgate.local`;
  const cashierEmail = `${SEED_PREFIX}cashier@paymentgate.local`;

  let platformUser = await findUserByEmail(platformEmail);
  if (!platformUser) {
    platformUser = await createUser({
      email: platformEmail,
      password: SEED_PASSWORD,
    });
  }

  let cashierUser = await findUserByEmail(cashierEmail);
  if (!cashierUser) {
    cashierUser = await createUser({
      email: cashierEmail,
      password: SEED_PASSWORD,
    });
  }

  let platform = await findPlatformOrg();
  if (!platform) {
    const created = await insertOrgAccount({
      type: "platform",
      name: "V032 Test Platform",
      parentId: null,
      structure: null,
      maxAgentDepth: 2,
    });
    if (!created.ok) throw new Error("could not create platform org");
    platform = created.row;
  }

  await insertMembership({
    orgId: platform.id,
    userId: platformUser.id,
    role: "owner",
  });

  const pool = getPool();
  const merchantName = `${SEED_PREFIX}merchant`;
  const { rows: merchants } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'merchant' AND name = $1 LIMIT 1`,
    [merchantName],
  );
  let merchantOrgId = merchants[0]?.id;
  if (!merchantOrgId) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: merchantName,
      parentId: platform.id,
      structure: "single_location",
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create merchant org");
    merchantOrgId = created.row.id;
  }

  await insertMembership({
    orgId: merchantOrgId,
    userId: cashierUser.id,
    role: "cashier",
  });

  const platformSession = await createSession({
    userId: platformUser.id,
    mfaVerified: true,
  });
  const cashierSession = await createSession({
    userId: cashierUser.id,
    mfaVerified: true,
  });

  return {
    platformUserId: platformUser.id,
    merchantOrgId,
    platformOrgId: platform.id,
    platformToken: platformSession.token,
    cashierToken: cashierSession.token,
  };
}

/**
 * @param {string} merchantOrgId
 */
export async function createIssuedBill(merchantOrgId) {
  return insertServiceBill({
    orgId: merchantOrgId,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    subscriptionAmount: "49.00",
    volumeFeeAmount: "12.50",
    totalAmount: "61.50",
    dueAt: new Date("2026-09-15T00:00:00.000Z").toISOString(),
    status: ServiceBillStatus.Issued,
  });
}

export async function migration018ColumnsPresent() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'service_bills'
       AND column_name = ANY($1::text[])`,
    [["paid_at", "voided_at", "last_adjustment_reason", "payment_reference"]],
  );
  return rows.map((r) => r.column_name).sort();
}

export { closePool };
