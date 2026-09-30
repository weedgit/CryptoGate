/**
 * Postgres integration — GET /v1/audit server paging (total/offset), free-text
 * search, caller scope and the streamed GET /v1/audit/export CSV.
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("audit log paging (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let prefix = "";
  const ids = /** @type {Record<string, string>} */ ({});
  const tokens = /** @type {Record<string, string>} */ ({});
  const userIds = /** @type {Record<string, string>} */ ({});

  async function user(key, orgId, role, displayName) {
    const u = await createUser({
      email: `${prefix}-${key}@audit.test`,
      password: "AuditTestPass12!",
    });
    if (displayName) {
      await getPool().query(`UPDATE users SET display_name = $2 WHERE id = $1`, [u.id, displayName]);
    }
    await insertMembership({ orgId, userId: u.id, role });
    const s = await createSession({ userId: u.id, mfaVerified: true });
    tokens[key] = s.token;
    userIds[key] = u.id;
  }

  async function event(orgId, actorId, action, metadata, minutesAgo) {
    await getPool().query(
      `INSERT INTO audit_log (actor_user_id, org_id, action, metadata, created_at)
       VALUES ($1, $2, $3, $4::jsonb, now() - make_interval(mins => $5))`,
      [actorId, orgId, action, JSON.stringify(metadata), minutesAgo],
    );
  }

  const get = (who, path) => apiFetch(base, path, { token: tokens[who] });

  /** @param {string} who @param {string} query */
  async function exportCsv(who, query) {
    const res = await fetch(`${base}/v1/audit/export${query}`, {
      headers: who ? { Cookie: `cg_session=${tokens[who]}` } : {},
    });
    return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() };
  }

  /** Minimal RFC 4180 row split (values here never contain raw newlines). */
  function csvRows(text) {
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const cells = [];
        let cur = "";
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
          const c = line[i];
          if (quoted) {
            if (c === '"' && line[i + 1] === '"') {
              cur += '"';
              i += 1;
            } else if (c === '"') quoted = false;
            else cur += c;
          } else if (c === '"') quoted = true;
          else if (c === ",") {
            cells.push(cur);
            cur = "";
          } else cur += c;
        }
        cells.push(cur);
        return cells;
      });
  }

  before(async () => {
    runMigrations();
    prefix = `aud${randomUUID().slice(0, 6)}`;
    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({ type: "platform", name: "Audit Test Platform", parentId: null, maxAgentDepth: 1 });
      platform = created.row;
    }
    const agent = await insertOrgAccount({ type: "agent", name: `${prefix}-agent`, parentId: platform.id, maxAgentDepth: null });
    const merchant = await insertOrgAccount({ type: "merchant", name: `${prefix}-shop`, parentId: agent.row.id, maxAgentDepth: null });
    const other = await insertOrgAccount({ type: "merchant", name: `${prefix}-other`, parentId: platform.id, maxAgentDepth: null });
    const bulk = await insertOrgAccount({ type: "merchant", name: `${prefix}-bulk`, parentId: platform.id, maxAgentDepth: null });
    ids.bulk = bulk.row.id;
    ids.platform = platform.id;
    ids.agent = agent.row.id;
    ids.merchant = merchant.row.id;
    ids.other = other.row.id;
    await user("platform", platform.id, "owner");
    await user("agent", ids.agent, "owner", `${prefix} Agent Person`);

    for (let i = 0; i < 12; i += 1) {
      await event(ids.merchant, userIds.agent, "api_key_create", { ref: `${prefix}-k${i}` }, i + 1);
    }
    await event(ids.other, userIds.platform, "org_update", { ref: `${prefix}-other` }, 30);
    await event(ids.other, userIds.platform, "org_update", { displayName: "=HYPERLINK(1)" }, 31);

    await getPool().query(
      `INSERT INTO audit_log (actor_user_id, org_id, action, metadata, created_at)
       SELECT $1, $2, 'org_update', jsonb_build_object('seq', g), now() - make_interval(mins => 60 + g)
       FROM generate_series(1, 2300) AS g`,
      [userIds.platform, ids.bulk],
    );

    ({ server, base } = await startTestServer());
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("returns a page with the filtered total, newest first", async () => {
    const first = await get("platform", `/v1/audit?orgId=${ids.merchant}&limit=5&offset=0`);
    assert.equal(first.status, 200);
    assert.equal(first.json.total, 12);
    assert.equal(first.json.items.length, 5);
    assert.equal(first.json.items[0].metadata.ref, `${prefix}-k0`);
    const last = await get("platform", `/v1/audit?orgId=${ids.merchant}&limit=5&offset=10`);
    assert.equal(last.json.items.length, 2);
    assert.equal(last.json.items[1].metadata.ref, `${prefix}-k11`);
  });

  it("searches org name, actor name, action words and metadata on the server", async () => {
    const byOrg = await get("platform", `/v1/audit?q=${prefix}-other`);
    assert.equal(byOrg.json.total, 2);
    const byActor = await get("platform", `/v1/audit?q=${encodeURIComponent(`${prefix} Agent Person`)}`);
    assert.equal(byActor.json.total, 12);
    const byAction = await get("platform", `/v1/audit?orgId=${ids.merchant}&q=${encodeURIComponent("api key")}`);
    assert.equal(byAction.json.total, 12);
    const byMeta = await get("platform", `/v1/audit?q=${prefix}-k7`);
    assert.equal(byMeta.json.total, 1);
    const byId = await get("platform", `/v1/audit?q=${ids.merchant}`);
    assert.equal(byId.json.total, 12);
    const byLabel = await get(
      "platform",
      `/v1/audit?orgId=${ids.merchant}&q=${encodeURIComponent("Created key")}&qActions=api_key_create`,
    );
    assert.equal(byLabel.json.total, 12);
  });

  it("scoped callers only see their subtree", async () => {
    const res = await get("agent", `/v1/audit?q=${prefix}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.total, 12);
    assert.equal((await get("agent", `/v1/audit?orgId=${ids.other}`)).status, 403);
  });

  it("validates offset, q and ids", async () => {
    assert.equal((await get("platform", `/v1/audit?offset=-1`)).status, 400);
    assert.equal((await get("platform", `/v1/audit?q=${"x".repeat(201)}`)).status, 400);
    assert.equal((await get("platform", `/v1/audit?orgId=nope`)).status, 400);
    assert.equal((await get("platform", `/v1/audit?q=x&qActions=drop_table`)).status, 400);
  });

  it("streams every matching row across keyset batches, newest first", async () => {
    const res = await exportCsv("platform", `?orgId=${ids.bulk}`);
    assert.equal(res.status, 200);
    assert.match(res.type, /^text\/csv/);
    const [header, ...rows] = csvRows(res.text);
    assert.deepEqual(header, [
      "createdAt", "action", "actorUserId", "actorEmail", "orgId",
      "orgName", "role", "ip", "resource", "metadata", "createdAtLocal (UTC)",
    ]);
    assert.equal(rows.length, 2300);
    const seqs = rows.map((r) => JSON.parse(r[9]).seq);
    assert.deepEqual(seqs, Array.from({ length: 2300 }, (_, i) => i + 1));
    assert.equal(rows[0][3], `${prefix}-platform@audit.test`);
    assert.equal(rows[0][5], `${prefix}-bulk`);
  });

  it("applies search and scope to the export and neutralizes formulas", async () => {
    const searched = csvRows((await exportCsv("platform", `?q=${prefix}-k7`)).text);
    assert.equal(searched.length, 2);
    assert.equal(JSON.parse(searched[1][9]).ref, `${prefix}-k7`);

    const scoped = csvRows((await exportCsv("agent", `?q=${prefix}`)).text);
    assert.equal(scoped.length, 13);
    assert.equal((await exportCsv("agent", `?orgId=${ids.other}`)).status, 403);

    const formula = csvRows((await exportCsv("platform", `?orgId=${ids.other}&q=HYPERLINK`)).text);
    assert.equal(formula.length, 2);
    assert.equal(formula[1][8], "'=HYPERLINK(1)");
  });

  it("rejects unauthenticated export and bad filters", async () => {
    assert.equal((await exportCsv("", "")).status, 401);
    assert.equal((await exportCsv("platform", "?orgId=nope")).status, 400);
  });
});
