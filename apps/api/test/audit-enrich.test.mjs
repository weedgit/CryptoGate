import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrichAuditLogRows } from "../src/audit/audit-enrich.mjs";

describe("audit enrich", () => {
  it("passes through rows with no user references", async () => {
    const rows = [
      {
        id: "1",
        actor_user_id: null,
        org_id: "o1",
        action: "org_create",
        metadata: { name: "Demo" },
        created_at: new Date(),
      },
    ];
    const out = await enrichAuditLogRows(rows);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].metadata, { name: "Demo" });
  });
});
