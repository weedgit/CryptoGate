import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  audienceMaySeeEvent,
  dashboardEventFromOutboxRow,
  publishDashboardEvent,
  subscribeDashboardEvents,
} from "../src/events/dashboard-events-hub.mjs";

describe("dashboardEventFromOutboxRow", () => {
  it("maps completed → order.settled / volume", () => {
    const ev = dashboardEventFromOutboxRow({
      event_type: "payment_order.completed",
      org_id: "org-1",
      order_id: "ord-1",
      order_number: "PO-1",
      created_at: new Date("2026-09-14T00:00:00.000Z"),
    });
    assert.deepEqual(ev, {
      type: "order.settled",
      slices: ["volume"],
      orgId: "org-1",
      orderId: "ord-1",
      orderNumber: "PO-1",
      at: "2026-09-14T00:00:00.000Z",
    });
  });

  it("maps payment_anomaly → order.anomaly", () => {
    const ev = dashboardEventFromOutboxRow({
      event_type: "payment_order.payment_anomaly",
      org_id: "org-2",
      order_id: "ord-2",
    });
    assert.equal(ev?.type, "order.anomaly");
    assert.deepEqual(ev?.slices, ["anomalies"]);
  });

  it("skips verifying / created", () => {
    assert.equal(
      dashboardEventFromOutboxRow({
        event_type: "payment_order.verifying",
        org_id: "o",
        order_id: "x",
      }),
      null,
    );
  });
});

describe("audienceMaySeeEvent", () => {
  const sample = {
    type: "order.settled",
    slices: ["volume"],
    orgId: "org-a",
    at: "2026-09-14T00:00:00.000Z",
  };

  it("allows all audience", () => {
    assert.equal(audienceMaySeeEvent({ kind: "all" }, sample), true);
  });

  it("filters by org set and parent / tree roots", () => {
    assert.equal(
      audienceMaySeeEvent(
        { kind: "orgs", orgIds: new Set(["org-a"]), treeRootIds: new Set() },
        sample,
      ),
      true,
    );
    assert.equal(
      audienceMaySeeEvent(
        { kind: "orgs", orgIds: new Set(["org-b"]), treeRootIds: new Set() },
        sample,
      ),
      false,
    );
    assert.equal(
      audienceMaySeeEvent(
        {
          kind: "orgs",
          orgIds: new Set(),
          treeRootIds: new Set(["agent-1"]),
        },
        {
          type: "org.created",
          slices: ["orgs"],
          orgId: "merchant-new",
          parentId: "agent-1",
          at: "2026-09-14T00:00:00.000Z",
        },
      ),
      true,
    );
  });

  it("broadcast reaches scoped audiences", () => {
    assert.equal(
      audienceMaySeeEvent(
        { kind: "orgs", orgIds: new Set(["x"]), treeRootIds: new Set() },
        {
          type: "network.maintenance",
          slices: ["networks"],
          broadcast: true,
          at: "2026-09-14T00:00:00.000Z",
        },
      ),
      true,
    );
  });
});

describe("publishDashboardEvent", () => {
  it("delivers only to matching subscribers", () => {
    /** @type {string[]} */
    const hit = [];
    /** @type {string[]} */
    const miss = [];
    const unsubHit = subscribeDashboardEvents(
      { kind: "orgs", orgIds: new Set(["org-a"]), treeRootIds: new Set() },
      (chunk) => hit.push(chunk),
    );
    const unsubMiss = subscribeDashboardEvents(
      { kind: "orgs", orgIds: new Set(["org-b"]), treeRootIds: new Set() },
      (chunk) => miss.push(chunk),
    );

    publishDashboardEvent({
      type: "order.settled",
      slices: ["volume"],
      orgId: "org-a",
      orderId: "1",
      at: "2026-09-14T00:00:00.000Z",
    });

    unsubHit();
    unsubMiss();

    assert.equal(hit.length, 1);
    assert.match(hit[0], /order\.settled/);
    assert.equal(miss.length, 0);
  });
});
