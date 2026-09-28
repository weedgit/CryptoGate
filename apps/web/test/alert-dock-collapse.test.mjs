import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DOCK_COLLAPSE_AFTER_LEAVE_MS,
  DOCK_COLLAPSE_AFTER_MS,
  dockSnapshot,
  shouldReexpand,
} from "../src/shared/alertDockModel.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("alert dock re-expand rules", () => {
  it("expands on first appearance", () => {
    assert.equal(shouldReexpand(null, dockSnapshot(["a"], "info")), true);
  });
  it("stays collapsed when a poll returns the same alerts", () => {
    assert.equal(shouldReexpand(dockSnapshot(["a", "b"], "warn"), dockSnapshot(["b", "a"], "warn")), false);
  });
  it("stays collapsed when an alert clears", () => {
    assert.equal(shouldReexpand(dockSnapshot(["a", "b"], "anomaly"), dockSnapshot(["a"], "warn")), false);
  });
  it("expands for a new alert id", () => {
    assert.equal(shouldReexpand(dockSnapshot(["a"], "warn"), dockSnapshot(["a", "c"], "warn")), true);
  });
  it("expands when severity rises", () => {
    assert.equal(shouldReexpand(dockSnapshot(["a"], "info"), dockSnapshot(["a"], "anomaly")), true);
  });
  it("uses 6s after appearing and 1s after the pointer leaves", () => {
    assert.equal(DOCK_COLLAPSE_AFTER_MS, 6000);
    assert.equal(DOCK_COLLAPSE_AFTER_LEAVE_MS, 1000);
  });
});

describe("alert dock component", () => {
  const dock = read("src/shared/UnresolvedAlertsBanner.tsx");
  it("collapses, expands on hover/focus, and the bell opens alerts", () => {
    assert.match(dock, /is-collapsed/);
    assert.match(dock, /onMouseEnter=\{pin\}/);
    assert.match(dock, /onMouseLeave=\{release\}/);
    assert.match(dock, /onFocus=\{pin\}/);
    assert.match(dock, /className="unresolved-alerts-dock__mark"\s+onClick=\{onOpenAlerts\}/);
  });
  it("fades out when all alerts clear", () => {
    assert.match(dock, /is-leaving/);
    assert.match(dock, /DOCK_EXIT_MS/);
  });
  it("css: collapsed width, calm non-red pulse, reduced motion", () => {
    const css = read("src/styles/components.css");
    assert.match(css, /\.unresolved-alerts-dock__card\.is-collapsed \{\s*width: 66px;/);
    assert.match(css, /is-collapsed:not\(\.unresolved-alerts-dock__card--anomaly\)/);
    assert.match(css, /@keyframes unresolved-alerts-dock-out/);
    assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.unresolved-alerts-dock__card,\s*\.unresolved-alerts-dock__copy/);
  });
});
