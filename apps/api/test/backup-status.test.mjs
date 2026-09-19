import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  backupHealthFields,
  resolveBackupStatus,
} from "../src/ops/backup-status.mjs";

describe("resolveBackupStatus", () => {
  const nowMs = Date.parse("2026-09-20T04:00:00.000Z");

  it("returns unknown when status file is missing", async () => {
    const snap = await resolveBackupStatus({
      statusPath: "/no/such/paymentgate-backup-status.json",
      nowMs,
      readFileFn: async () => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    });
    assert.equal(snap.status, "unknown");
    assert.match(snap.detail, /no backup/i);
  });

  it("returns ok for a recent successful dump", async () => {
    const snap = await resolveBackupStatus({
      nowMs,
      staleAfterHours: 36,
      readFileFn: async () =>
        JSON.stringify({
          ok: true,
          finishedAt: "2026-09-20T01:00:00.000Z",
          bytes: 1200,
          offsite: false,
          errors: 0,
          message: "ok",
        }),
    });
    assert.equal(snap.status, "ok");
    assert.equal(snap.ageHours, 3);
    assert.match(snap.detail, /3h ago/);
    assert.deepEqual(backupHealthFields(snap).backup, "ok");
  });

  it("returns stale when last success is older than threshold", async () => {
    const snap = await resolveBackupStatus({
      nowMs,
      staleAfterHours: 36,
      readFileFn: async () =>
        JSON.stringify({
          ok: true,
          finishedAt: "2026-09-18T01:00:00.000Z",
          bytes: 1200,
          errors: 0,
          message: "ok",
        }),
    });
    assert.equal(snap.status, "stale");
  });

  it("returns failed when last run reported errors", async () => {
    const snap = await resolveBackupStatus({
      nowMs,
      readFileFn: async () =>
        JSON.stringify({
          ok: false,
          finishedAt: "2026-09-20T03:00:00.000Z",
          errors: 1,
          message: "pg_dump failed",
        }),
    });
    assert.equal(snap.status, "failed");
    assert.match(snap.detail, /pg_dump failed/);
  });
});
