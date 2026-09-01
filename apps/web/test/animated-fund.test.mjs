import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("funds count tween", () => {
  it("counts from zero then eases toward the live amount", () => {
    const tween = readFileSync(
      join(root, "src/shared/useAnimatedNumber.ts"),
      "utf8",
    );
    assert.match(tween, /easeOutCubic/);
    assert.match(tween, /pendingFirst\.current \? 0/);
    assert.match(tween, /requestAnimationFrame/);
    assert.match(tween, /useReducedMotion/);
    assert.match(tween, /Math\.min\(880/);

    const fund = readFileSync(
      join(root, "src/shared/AnimatedFundAmount.tsx"),
      "utf8",
    );
    assert.match(fund, /useAnimatedNumber/);
    assert.match(fund, /minimumFractionDigits: 2/);
  });
});
