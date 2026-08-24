import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@cryptogate/web merchant M2-60", () => {
  it("has create-order route and matching labels", () => {
    const labels = readFileSync(
      join(root, "src/merchant/matchingLabels.ts"),
      "utf8",
    );
    assert.match(labels, /Standard/);
    assert.match(labels, /Amount fingerprint/);
    assert.match(labels, /Smart address/);
    const page = readFileSync(
      join(root, "src/merchant/CreateOrderPage.tsx"),
      "utf8",
    );
    assert.match(page, /GENERATE INVOICE/);
    assert.match(page, /createOrder/);
    assert.doesNotMatch(page, /Mark paid/i);
  });

  it("ignores pink animation sticky from Figma", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.doesNotMatch(app, /Input focus glow/);
    assert.doesNotMatch(app, /ff5a6a.*sparkles/i);
  });
});

describe("@cryptogate/web merchant M2-61/62/63 settlement", () => {
  it("wires settlement route and org APIs", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /\/merchant\/settings\/settlement/);
    assert.match(app, /SettlementPage/);
    const page = readFileSync(
      join(root, "src/merchant/SettlementPage.tsx"),
      "utf8",
    );
    assert.match(page, /new orders only/i);
    assert.match(page, /putMatchingMode/);
    assert.match(page, /putSettlement/);
    assert.match(page, /putXpub/);
    assert.match(page, /listHdPool/);
    assert.match(page, /mfaCode|MFA/);
    assert.doesNotMatch(page, /private key|mnemonic/i);
  });

  it("exposes product matching labels on mode cards", () => {
    const labels = readFileSync(
      join(root, "src/merchant/matchingLabels.ts"),
      "utf8",
    );
    assert.match(labels, /MATCHING_MODE_CARDS/);
    assert.match(labels, /Memo tag/);
  });
});
