/**
 * POS terminal binding, PIN-only unlock, PIN session scope, lock/unbind and web revoke.
 * Skipped when DATABASE_URL is unset.
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePlatformFeeNetwork } from "@paymentgate/domain";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { posPinLookup } from "../src/auth/pos-pin-hash.mjs";
import { getPool } from "../src/db/pool.mjs";
import { SESSION_COOKIE_NAME } from "../src/http/cookies.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import { resetPosBindLimits } from "../src/pos/pos-routes.mjs";
import { resetRateLimitStore } from "../src/rate-limit/rate-limit-store.mjs";
import { forceSettlementAddress } from "../src/settlement/settlement-store.mjs";
import {
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

process.env.RATE_LIMIT_LOGIN_PER_MINUTE ??= "10000";

const skip = !hasPostgres();
const PREFIX = "pos-term-";
const PASSWORD = "PosTerminalTest12!";
const TRON_MAIN = "TPosTerminalMainTronAddr00000000001";

describe("POS terminals (Postgres integration)", { skip }, () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let seq = 0;
  let merchantId = "";
  let siteId = "";
  /** @type {Record<string, { id: string }>} */
  const users = {};

  /**
   * @param {string} path
   * @param {{ method?: string, session?: string | null, terminal?: string | null, body?: object, headers?: Record<string, string> }} [opts]
   */
  async function api(path, opts = {}) {
    /** @type {Record<string, string>} */
    const headers = { Accept: "application/json", ...(opts.headers ?? {}) };
    if (opts.session) headers.Cookie = `${SESSION_COOKIE_NAME}=${opts.session}`;
    if (opts.terminal) headers.Authorization = `Terminal ${opts.terminal}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const setCookie = res.headers.get("set-cookie") ?? "";
    const cookie = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`))?.[1] ?? null;
    return {
      status: res.status,
      json: text ? JSON.parse(text) : null,
      cookie,
      retryAfter: res.headers.get("retry-after"),
    };
  }

  const code = (res) => res.json?.error?.code ?? res.json?.code;

  /**
   * @param {string} key
   * @param {string} orgId
   * @param {string} role
   * @param {{ profile?: boolean, mfa?: boolean }} [opts]
   */
  async function addUser(key, orgId, role, opts = {}) {
    const email = `${PREFIX}${key}-${Date.now()}-${seq++}@paymentgate.local`;
    const user = await createUser({ email, password: PASSWORD });
    await insertMembership({ orgId, userId: user.id, role });
    if (opts.profile !== false) {
      await getPool().query(
        `UPDATE users SET first_name = 'Pos', last_name = $2, timezone = 'UTC',
           email_verified_at = now(), phone = $3, phone_verified_at = now()
         WHERE id = $1`,
        [user.id, key, `+1555${String(1000000 + seq).slice(-7)}`],
      );
    }
    if (opts.mfa) {
      await getPool().query(
        `UPDATE users SET mfa_enrolled_at = now(), mfa_secret = 'JBSWY3DPEHPK3PXP' WHERE id = $1`,
        [user.id],
      );
    }
    users[key] = user;
    return user;
  }

  /** @param {string} key */
  async function loginToken(key) {
    return (await createSession({ userId: users[key].id, mfaVerified: true })).token;
  }

  /**
   * @param {string} actorKey
   * @param {string} orgId
   * @param {string} targetKey
   */
  async function generatePin(actorKey, orgId, targetKey) {
    const res = await api(`/v1/orgs/${orgId}/users/${users[targetKey].id}/pos-pin`, {
      method: "PUT",
      session: await loginToken(actorKey),
      body: { generate: true },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    return res.json.pin;
  }

  /** @param {string} key */
  async function bind(key) {
    const res = await api("/v1/pos/terminals", {
      method: "POST",
      session: await loginToken(key),
      body: { deviceModel: "Sunmi V2", appVersion: "2.0.0" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    return res.json;
  }

  /**
   * @param {string} terminal
   * @param {string} pin
   */
  async function unlock(terminal, pin) {
    return api("/v1/pos/unlock", { method: "POST", terminal, body: { pin } });
  }

  async function auditCount(action, terminalId) {
    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = $1 AND metadata->>'terminalId' = $2`,
      [action, terminalId],
    );
    return rows[0].n;
  }

  before(async () => {
    runMigrations();
    ({ server, base } = await startTestServer());

    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "POS Test Platform", parentId: null, maxAgentDepth: 1 })).row;
    const merchant = await insertOrgAccount({
      type: "merchant",
      name: `${PREFIX}merchant-${Date.now()}`,
      parentId: platform.id,
      maxAgentDepth: null,
    });
    assert.ok(merchant.ok);
    merchantId = merchant.row.id;
    await getPool().query(
      `UPDATE org_accounts SET billing_email = 'billing@pos-term.local', country = 'US' WHERE id = $1`,
      [merchantId],
    );
    await getPool().query(
      `INSERT INTO merchant_commercial (org_id, tier, volume_fee_percent, effective_from, billing_anchor_at)
       VALUES ($1, 'small', '0.5', now(), now())
       ON CONFLICT (org_id) DO UPDATE SET billing_anchor_at = now()`,
      [merchantId],
    );
    await forceSettlementAddress({ orgId: merchantId, asset: "USDT", network: "tron", address: TRON_MAIN });
    await forceSettlementAddress({
      orgId: merchantId,
      asset: "USDT",
      network: resolvePlatformFeeNetwork(),
      address: TRON_MAIN,
    });

    const site = await insertOrgAccount({
      type: "merchant_site",
      name: `${PREFIX}site-${Date.now()}`,
      parentId: merchantId,
      maxAgentDepth: null,
    });
    assert.ok(site.ok);
    siteId = site.row.id;

    await addUser("mOwner", merchantId, "owner", { mfa: true });
    await addUser("mAdminNoMfa", merchantId, "administrator");
    await addUser("mCashier", merchantId, "cashier");
    await addUser("mCashierNoProfile", merchantId, "cashier", { profile: false });
    await addUser("mViewer", merchantId, "viewer");
    await addUser("sOwner", siteId, "owner");
    await addUser("sCashier", siteId, "cashier");
  });

  beforeEach(() => {
    resetRateLimitStore();
    resetPosBindLimits();
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("generates PINs on the server only", async () => {
    const owner = await loginToken("mOwner");
    const path = `/v1/orgs/${merchantId}/users/${users.mCashier.id}/pos-pin`;
    const chosen = await api(path, { method: "PUT", session: owner, body: { pin: "123456" } });
    assert.equal(chosen.status, 400);
    assert.equal(code(chosen), "pos_pin_generate_only");

    const pin = await generatePin("mOwner", merchantId, "mCashier");
    assert.match(pin, /^\d{6}$/);
    const own = await generatePin("mOwner", merchantId, "mOwner");
    assert.match(own, /^\d{6}$/);

    const cashier = await loginToken("mCashier");
    const selfSet = await api("/v1/auth/pos-pin", { method: "PUT", session: cashier, body: { pin: "654321" } });
    assert.equal(selfSet.status, 403);
    assert.equal(code(selfSet), "pos_pin_admin_only");

    const byCashier = await api(`/v1/orgs/${merchantId}/users/${users.mViewer.id}/pos-pin`, {
      method: "PUT",
      session: cashier,
      body: { generate: true },
    });
    assert.equal(byCashier.status, 403);
  });

  it("keeps PIN lookups unique within an org", async () => {
    const lookup = posPinLookup(merchantId, "000001");
    const pool = getPool();
    await pool.query(`UPDATE users SET pos_pin_lookup = $2 WHERE id = $1`, [users.mViewer.id, lookup]);
    await assert.rejects(
      pool.query(`UPDATE users SET pos_pin_lookup = $2 WHERE id = $1`, [users.mAdminNoMfa.id, lookup]),
      { code: "23505" },
    );
    await pool.query(`UPDATE users SET pos_pin_lookup = NULL WHERE id = $1`, [users.mViewer.id]);
  });

  it("binds only for Owners/Admins, needs an authenticator for merchant managers, and ends the login", async () => {
    const cashier = await api("/v1/pos/terminals", {
      method: "POST",
      session: await loginToken("mCashier"),
      body: {},
    });
    assert.equal(cashier.status, 403);

    const noMfa = await api("/v1/pos/terminals", {
      method: "POST",
      session: await loginToken("mAdminNoMfa"),
      body: {},
    });
    assert.equal(noMfa.status, 403);
    assert.equal(code(noMfa), "mfa_enrollment_required");

    const login = await loginToken("mOwner");
    const bound = await api("/v1/pos/terminals", {
      method: "POST",
      session: login,
      body: { deviceModel: "Sunmi V2" },
    });
    assert.equal(bound.status, 201, JSON.stringify(bound.json));
    assert.match(bound.json.terminalToken, /^pgt_/);
    assert.equal(bound.json.org.id, merchantId);
    const after = await api("/v1/auth/session", { session: login });
    assert.equal(after.status, 401);

    const siteBound = await bind("sOwner");
    assert.equal(siteBound.org.id, siteId);

    const info = await api("/v1/pos/terminal", { terminal: bound.json.terminalToken });
    assert.equal(info.status, 200);
    assert.equal(info.json.org.id, merchantId);
    assert.equal((await api("/v1/pos/terminal", { terminal: "pgt_nope" })).status, 401);
  });

  it("unlocks by PIN only and reports whether live actions are open", async () => {
    const { terminalToken, terminal } = await bind("mOwner");
    const pin = await generatePin("mOwner", merchantId, "mCashier");
    const ok = await unlock(terminalToken, pin);
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.operator.role, "cashier");
    assert.equal(ok.json.liveActionsUnlocked, true);
    assert.ok(ok.cookie);
    assert.equal(await auditCount("pos_unlock_success", terminal.id), 1);

    const noProfilePin = await generatePin("mOwner", merchantId, "mCashierNoProfile");
    const blocked = await unlock(terminalToken, noProfilePin);
    assert.equal(blocked.status, 200);
    assert.equal(blocked.json.liveActionsUnlocked, false);
    assert.equal(blocked.json.liveActionsBlockedReason, "org_setup_incomplete");

    const oldSession = await api("/v1/auth/session", { session: ok.cookie });
    assert.equal(oldSession.status, 401, "one active PIN session per terminal");

    const sitePin = await generatePin("sOwner", siteId, "sCashier");
    const wrongOrg = await unlock(terminalToken, sitePin);
    assert.equal(wrongOrg.status, 401);
    assert.equal(code(wrongOrg), "invalid_pos_pin");

    const viewerPin = await generatePin("mOwner", merchantId, "mViewer");
    assert.equal((await unlock(terminalToken, viewerPin)).status, 401);
  });

  it("locks the terminal after 5 wrong PINs and resets on a correct one", async () => {
    const { terminalToken, terminal } = await bind("mOwner");
    const pin = await generatePin("mOwner", merchantId, "mCashier");
    const wrong = pin === "999999" ? "999998" : "999999";
    for (let i = 0; i < 4; i++) {
      const res = await unlock(terminalToken, wrong);
      assert.equal(res.status, 401);
    }
    const fifth = await unlock(terminalToken, wrong);
    assert.equal(fifth.status, 423);
    assert.equal(code(fifth), "pos_unlock_locked");
    assert.ok(Number(fifth.retryAfter) >= 29 && Number(fifth.retryAfter) <= 30, fifth.retryAfter);

    const whileLocked = await unlock(terminalToken, pin);
    assert.equal(whileLocked.status, 423, "even the right PIN waits");

    await getPool().query(`UPDATE pos_terminals SET locked_until = now() - interval '1 second' WHERE id = $1`, [terminal.id]);
    for (let i = 0; i < 4; i++) await unlock(terminalToken, wrong);
    const second = await unlock(terminalToken, wrong);
    assert.equal(second.status, 423);
    assert.ok(Number(second.retryAfter) >= 59 && Number(second.retryAfter) <= 60, second.retryAfter);

    await getPool().query(`UPDATE pos_terminals SET locked_until = now() - interval '1 second' WHERE id = $1`, [terminal.id]);
    assert.equal((await unlock(terminalToken, pin)).status, 200);
    const { rows } = await getPool().query(
      `SELECT failed_unlocks, lockout_level, locked_until FROM pos_terminals WHERE id = $1`,
      [terminal.id],
    );
    assert.deepEqual(rows[0], { failed_unlocks: 0, lockout_level: 0, locked_until: null });
  });

  it("alerts once when the org reaches 20 wrong PINs in an hour, without locking the org", async () => {
    const site = await insertOrgAccount({
      type: "merchant_site",
      name: `${PREFIX}alert-site-${Date.now()}`,
      parentId: merchantId,
      maxAgentDepth: null,
    });
    assert.ok(site.ok);
    const orgId = site.row.id;
    await addUser("alertOwner", orgId, "owner");
    await addUser("alertCashier", orgId, "cashier");
    const terminals = [];
    for (let i = 0; i < 5; i++) terminals.push(await bind("alertOwner"));
    for (const t of terminals) {
      for (let i = 0; i < 4; i++) await unlock(t.terminalToken, "000000");
    }
    const alerts = async () =>
      (
        await getPool().query(
          `SELECT count(*)::int AS n FROM audit_log WHERE org_id = $1 AND action = 'pos_unlock_alert'`,
          [orgId],
        )
      ).rows[0].n;
    assert.equal(await alerts(), 1);
    await unlock(terminals[0].terminalToken, "000000");
    assert.equal(await alerts(), 1, "one alert per crossing");

    const fresh = await bind("alertOwner");
    const pin = await generatePin("alertOwner", orgId, "alertCashier");
    assert.equal((await unlock(fresh.terminalToken, pin)).status, 200);
  });

  it("limits a PIN session to the POS routes and its own org", async () => {
    const { terminalToken } = await bind("mOwner");
    const pin = await generatePin("mOwner", merchantId, "mOwner");
    const { cookie } = await unlock(terminalToken, pin);
    const as = (path, opts = {}) => api(path, { ...opts, session: cookie });

    assert.equal((await as("/v1/auth/session")).status, 200);
    assert.equal((await as(`/v1/orgs/${merchantId}/pos-settings`)).status, 200);
    const users = await as(`/v1/orgs/${merchantId}/users`);
    assert.equal(users.status, 403, "Owners too");
    assert.equal(code(users), "pos_session_scope");
    assert.equal(code(await as("/v1/orgs")), "pos_session_scope");
    assert.equal(code(await as("/v1/orders/summary")), "pos_session_scope");

    const order = await as("/v1/orders", {
      method: "POST",
      headers: { "Idempotency-Key": `${PREFIX}${Date.now()}` },
      body: { orgId: merchantId, asset: "USDT", network: "tron", amountUsd: "12.50", validitySeconds: 1800 },
    });
    assert.equal(order.status, 201, JSON.stringify(order.json));
    const { rows } = await getPool().query(
      `SELECT created_via, terminal_id FROM payment_orders WHERE id = $1`,
      [order.json.id],
    );
    assert.equal(rows[0].created_via, "pos");
    assert.ok(rows[0].terminal_id);
    assert.equal((await as(`/v1/orders/${order.json.id}`)).status, 200);

    const otherOrg = await as("/v1/orders", {
      method: "POST",
      headers: { "Idempotency-Key": `${PREFIX}${Date.now()}-site` },
      body: { orgId: siteId, asset: "USDT", network: "tron", amountUsd: "5", validitySeconds: 1800 },
    });
    assert.equal(otherOrg.status, 403);
  });

  it("ends a PIN session as soon as the terminal is revoked", async () => {
    const { terminalToken, terminal } = await bind("mOwner");
    const pin = await generatePin("mOwner", merchantId, "mCashier");
    const { cookie } = await unlock(terminalToken, pin);
    assert.equal((await api("/v1/auth/session", { session: cookie })).status, 200);

    await getPool().query(`UPDATE pos_terminals SET status = 'revoked' WHERE id = $1`, [terminal.id]);
    const revoked = await api("/v1/auth/session", { session: cookie });
    assert.equal(revoked.status, 401);
    assert.equal(code(revoked), "terminal_revoked");
  });

  it("locks and unbinds from the terminal", async () => {
    const { terminalToken, terminal } = await bind("mOwner");
    const cashierPin = await generatePin("mOwner", merchantId, "mCashier");
    const ownerPin = await generatePin("mOwner", merchantId, "mOwner");

    const first = await unlock(terminalToken, cashierPin);
    const locked = await api("/v1/pos/lock", { method: "POST", terminal: terminalToken, session: first.cookie });
    assert.equal(locked.status, 204);
    assert.equal((await api("/v1/auth/session", { session: first.cookie })).status, 401);
    assert.equal((await api("/v1/pos/terminal", { terminal: terminalToken })).status, 200);

    const cashier = await unlock(terminalToken, cashierPin);
    const cashierUnbind = await api("/v1/pos/unbind", {
      method: "POST",
      terminal: terminalToken,
      session: cashier.cookie,
    });
    assert.equal(cashierUnbind.status, 403);

    const owner = await unlock(terminalToken, ownerPin);
    const unbound = await api("/v1/pos/unbind", {
      method: "POST",
      terminal: terminalToken,
      session: owner.cookie,
    });
    assert.equal(unbound.status, 204);
    assert.equal((await api("/v1/pos/terminal", { terminal: terminalToken })).status, 401);
    assert.equal(await auditCount("pos_terminal_unbound", terminal.id), 1);
  });

  it("lets web Owners list and revoke terminals, including a merchant for its sites", async () => {
    const siteTerminal = await bind("sOwner");
    const sitePin = await generatePin("sOwner", siteId, "sCashier");
    const { cookie } = await unlock(siteTerminal.terminalToken, sitePin);

    const merchantOwner = await loginToken("mOwner");
    const list = await api(`/v1/orgs/${siteId}/pos-terminals`, { session: merchantOwner });
    assert.equal(list.status, 200);
    const listed = list.json.items.find((t) => t.id === siteTerminal.terminal.id);
    assert.ok(listed);
    assert.equal(listed.boundByName, "Pos sOwner");
    assert.match(listed.boundByEmail, /^pos-term-sowner-/);

    const cashierList = await api(`/v1/orgs/${siteId}/pos-terminals`, { session: await loginToken("sCashier") });
    assert.equal(cashierList.status, 403);

    const revoked = await api(`/v1/orgs/${siteId}/pos-terminals/${siteTerminal.terminal.id}/revoke`, {
      method: "POST",
      session: merchantOwner,
      body: { reason: "lost device" },
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.json));
    assert.equal(revoked.json.status, "revoked");
    assert.equal(revoked.json.revokeReason, "lost device");
    assert.equal((await api("/v1/pos/terminal", { terminal: siteTerminal.terminalToken })).status, 401);
    assert.equal((await api("/v1/auth/session", { session: cookie })).status, 401);
  });

  it("rate-limits binding to 10 per user per hour", async () => {
    for (let i = 0; i < 10; i++) await bind("sOwner");
    resetRateLimitStore();
    const eleventh = await api("/v1/pos/terminals", {
      method: "POST",
      session: await loginToken("sOwner"),
      body: {},
    });
    assert.equal(eleventh.status, 429);
    assert.ok(Number(eleventh.retryAfter) > 0);
  });
});
