/**
 * Scaffold integrity for CI (no Android SDK required).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const required = [
  "settings.gradle.kts",
  "app/build.gradle.kts",
  "keystore.properties.example",
  "app/src/main/AndroidManifest.xml",
  "app/src/main/java/com/paymentgate/cashier/MainActivity.kt",
  "app/src/main/java/com/paymentgate/cashier/api/PaymentGateClient.kt",
  "app/src/main/java/com/paymentgate/cashier/api/SessionStore.kt",
  "app/src/main/java/com/paymentgate/cashier/api/AssetNetworkCatalog.kt",
  "app/src/main/java/com/paymentgate/cashier/api/CashierPosSurface.kt",
  "app/src/main/java/com/paymentgate/cashier/api/NetworkReachability.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/LoginScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/CreateOrderScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/OrderPayScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/HomeScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/qr/QrBitmaps.kt",
  "app/src/main/java/com/paymentgate/cashier/api/OrderStatusUi.kt",
  "app/src/test/java/com/paymentgate/cashier/api/JsonParsersTest.kt",
  "app/src/test/java/com/paymentgate/cashier/api/AssetNetworkCatalogTest.kt",
];

describe("@paymentgate/cashier-apk scaffold (M2–M4)", () => {
  for (const rel of required) {
    it(`has ${rel}`, () => {
      assert.equal(existsSync(join(root, rel)), true);
    });
  }

  it("defines staging and prod product flavors (M4-23)", () => {
    const gradle = readFileSync(join(root, "app/build.gradle.kts"), "utf8");
    assert.match(gradle, /productFlavors/);
    assert.match(gradle, /create\("staging"\)/);
    assert.match(gradle, /create\("prod"\)/);
    assert.match(gradle, /paymentgate\.stagingApi/);
    assert.match(gradle, /paymentgate\.prodApi/);
    assert.match(gradle, /APP_ENV/);
    assert.match(gradle, /CHAIN_ENV/);
    assert.match(gradle, /signingConfigs/);
    assert.match(gradle, /keystore\.properties/);
  });

  it("POS catalog mirrors Phase 1 registry pairs", () => {
    const catalog = readFileSync(
      join(root, "app/src/main/java/com/paymentgate/cashier/api/AssetNetworkCatalog.kt"),
      "utf8",
    );
    assert.match(catalog, /bnb_smart_chain/);
    assert.match(catalog, /tron_nile/);
    assert.match(catalog, /AssetNetworkPair\("USDC", "base"/);
    assert.match(catalog, /AssetNetworkPair\("BTC", "bitcoin"/);
  });

  it("does not commit keystore.properties", () => {
    assert.equal(existsSync(join(root, "keystore.properties")), false);
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /keystore\.properties/);
  });
});
