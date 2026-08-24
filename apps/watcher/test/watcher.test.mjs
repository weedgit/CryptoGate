import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function runWatcherOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["./src/main.mjs"], {
      cwd: root,
      env: { ...process.env, WATCHER_POLL_INTERVAL_MS: "100" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.on("error", reject);
  });
}

describe("@cryptogate/watcher m1 loop", () => {
  it("default run executes one tick and shuts down cleanly", async () => {
    const { code, stdout, stderr } = await runWatcherOnce();
    assert.equal(code, 0, stderr);
    const lines = stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines[0].event, "start");
    assert.equal(lines[1].phase, "m1-loop");
    assert.equal(lines[1].tick, 1);
    assert.equal(lines[1].chain.tron.mode, "stub");
    assert.equal(lines[1].ingest.mode, "noop");
    assert.equal(lines.at(-1).event, "shutdown");
    assert.equal(lines.at(-1).ticks, 1);
  });
});
