import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeOrderabilityLamp } from "../src/platform-settings/network-lamp.mjs";

describe("computeOrderabilityLamp", () => {
  it("returns Off when pair/network is not enabled", () => {
    assert.deepEqual(
      computeOrderabilityLamp({
        enabled: false,
        maintenanceActive: false,
        ingestStatus: "live",
      }),
      { code: "off", label: "Off", tone: "muted" },
    );
  });

  it("returns Open when enabled, not maintenance, live ingest", () => {
    assert.deepEqual(
      computeOrderabilityLamp({
        enabled: true,
        maintenanceActive: false,
        ingestStatus: "live",
      }),
      { code: "open", label: "Open", tone: "ok" },
    );
  });

  it("returns Paused for maintenance even if ingest is live", () => {
    assert.equal(
      computeOrderabilityLamp({
        enabled: true,
        maintenanceActive: true,
        ingestStatus: "live",
      }).code,
      "paused",
    );
  });

  it("returns Paused for degraded or stub ingest", () => {
    assert.equal(
      computeOrderabilityLamp({
        enabled: true,
        maintenanceActive: false,
        ingestStatus: "degraded",
      }).code,
      "paused",
    );
    assert.equal(
      computeOrderabilityLamp({
        enabled: true,
        maintenanceActive: false,
        ingestStatus: "stub",
      }).code,
      "paused",
    );
  });

  it("returns Down for watcher down or missing heartbeat", () => {
    assert.equal(
      computeOrderabilityLamp({
        enabled: true,
        maintenanceActive: false,
        ingestStatus: "down",
      }).code,
      "down",
    );
    assert.equal(
      computeOrderabilityLamp({
        enabled: true,
        maintenanceActive: false,
        ingestStatus: "unknown",
      }).code,
      "down",
    );
    assert.equal(
      computeOrderabilityLamp({
        enabled: true,
        maintenanceActive: false,
        ingestStatus: null,
      }).code,
      "down",
    );
  });
});
