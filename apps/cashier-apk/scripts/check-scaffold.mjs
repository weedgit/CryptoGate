/**
 * Scaffold integrity for CI (no Android SDK required).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const required = [
  "settings.gradle.kts",
  "app/build.gradle.kts",
  "app/src/main/AndroidManifest.xml",
  "app/src/main/java/com/cryptogate/cashier/MainActivity.kt",
  "app/src/main/java/com/cryptogate/cashier/api/CryptoGateClient.kt",
  "app/src/main/java/com/cryptogate/cashier/api/SessionStore.kt",
  "app/src/main/java/com/cryptogate/cashier/ui/LoginScreen.kt",
  "app/src/main/java/com/cryptogate/cashier/ui/CreateOrderScreen.kt",
  "app/src/main/java/com/cryptogate/cashier/ui/OrderPayScreen.kt",
  "app/src/main/java/com/cryptogate/cashier/qr/QrBitmaps.kt",
  "app/src/test/java/com/cryptogate/cashier/api/JsonParsersTest.kt",
];

describe("@cryptogate/cashier-apk scaffold (M2-70/71/72)", () => {
  for (const rel of required) {
    it(`has ${rel}`, () => {
      assert.equal(existsSync(join(root, rel)), true);
    });
  }
});
