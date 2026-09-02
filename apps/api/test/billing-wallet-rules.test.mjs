import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateUpdateBillingWalletBody } from "../src/platform-settings/billing-wallet-rules.mjs";
import { toServiceBillCheckout } from "../src/service-bills/service-bill-rules.mjs";

describe("billing wallet B11-lite", () => {
  it("validates seller + payTo body", () => {
    const ok = validateUpdateBillingWalletBody({
      sellerName: "PaymentGate Ops",
      payTo: "TPlatformWallet1234567890123456789012",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.sellerName, "PaymentGate Ops");
      assert.equal(ok.payTo, "TPlatformWallet1234567890123456789012");
    }

    const spend = validateUpdateBillingWalletBody({
      sellerName: "X",
      payTo: "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4fbQkV5Yxxxx",
    });
    assert.equal(spend.ok, false);

    const eth = validateUpdateBillingWalletBody({
      sellerName: "X",
      payTo: "0x0000000000000000000000000000000000000001",
    });
    assert.equal(eth.ok, false);
  });

  it("checkout prefers explicit payTo over env", () => {
    const prev = process.env.PLATFORM_BILLING_PAY_TO;
    process.env.PLATFORM_BILLING_PAY_TO = "TEnvFallbackWalletXXXXXXXXXXXXXXXXXXXX";
    try {
      const checkout = toServiceBillCheckout(
        { id: "b1", total_amount: "10.00", currency: "USD" },
        { payTo: "TDbPayToXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
      );
      assert.equal(checkout.payTo, "TDbPayToXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    } finally {
      if (prev === undefined) delete process.env.PLATFORM_BILLING_PAY_TO;
      else process.env.PLATFORM_BILLING_PAY_TO = prev;
    }
  });
});
