import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getHealthPayload } from "../src/health-payload.mjs";

describe("health-payload", () => {
  let prevBackupPath;
  before(() => {
    prevBackupPath = process.env.PAYMENTGATE_BACKUP_STATUS_PATH;
    process.env.PAYMENTGATE_BACKUP_STATUS_PATH = "/nonexistent/paymentgate-backup-status.json";
  });
  after(() => {
    if (prevBackupPath === undefined) delete process.env.PAYMENTGATE_BACKUP_STATUS_PATH;
    else process.env.PAYMENTGATE_BACKUP_STATUS_PATH = prevBackupPath;
  });

  it("returns ok without db check", async () => {
    const p = await getHealthPayload({ checkDb: false });
    assert.equal(p.service, "paymentgate-api");
    assert.equal(p.status, "ok");
    assert.equal(p.phase, "m1");
    assert.ok(p.timestamp);
    assert.equal(p.webhook, "unknown");
    assert.match(String(p.webhookDetail), /not started/i);
    assert.equal(p.backup, "unknown");
    assert.match(String(p.backupDetail), /no backup/i);
  });

  it("skips db when DATABASE_URL unset", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const p = await getHealthPayload({ checkDb: true });
      assert.equal(p.db, "skipped");
      assert.equal(p.status, "ok");
      assert.equal(p.webhook, "unknown");
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });
});
