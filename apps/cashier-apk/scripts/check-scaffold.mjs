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
  "gradlew",
  "gradle/wrapper/gradle-wrapper.jar",
  "gradle/wrapper/gradle-wrapper.properties",
  "keystore.properties.example",
  "app/src/main/AndroidManifest.xml",
  "app/src/main/java/com/paymentgate/cashier/MainActivity.kt",
  "app/src/main/java/com/paymentgate/cashier/BootCompletedReceiver.kt",
  "app/src/main/java/com/paymentgate/cashier/api/PaymentGateClient.kt",
  "app/src/main/java/com/paymentgate/cashier/api/SessionStore.kt",
  "app/src/main/java/com/paymentgate/cashier/api/AssetNetworkCatalog.kt",
  "app/src/main/java/com/paymentgate/cashier/api/CashierPosSurface.kt",
  "app/src/main/java/com/paymentgate/cashier/api/NetworkReachability.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/LoginScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/CreateOrderScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/CryptoIcons.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/PosMotion.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/OrderPayScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/HomeScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/SettingsScreen.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/AmountKeypad.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/AmountEntry.kt",
  "app/src/main/java/com/paymentgate/cashier/api/PosPreferences.kt",
  "app/src/main/java/com/paymentgate/cashier/ui/KeepScreenOn.kt",
  "app/src/main/java/com/paymentgate/cashier/qr/QrBitmaps.kt",
  "app/src/main/java/com/paymentgate/cashier/api/OrderStatusUi.kt",
  "app/src/main/java/com/paymentgate/cashier/hardware/ThermalPrinter.kt",
  "app/src/main/java/com/paymentgate/cashier/hardware/ReceiptLines.kt",
  "app/src/main/java/com/paymentgate/cashier/hardware/ThermalPrinterFactory.kt",
  "app/src/main/java/com/paymentgate/cashier/hardware/CustomerDisplay.kt",
  "app/src/main/java/com/paymentgate/cashier/hardware/CustomerPayBitmap.kt",
  "app/src/main/java/com/paymentgate/cashier/hardware/CustomerDisplayFactory.kt",
  "app/src/zcs/java/com/paymentgate/cashier/hardware/ZcsSmartPosPrinter.kt",
  "app/src/zcs/java/com/paymentgate/cashier/hardware/ZcsCustomerDisplay.kt",
  "app/src/noZcs/java/com/paymentgate/cashier/hardware/ZcsSmartPosPrinter.kt",
  "app/src/noZcs/java/com/paymentgate/cashier/hardware/ZcsCustomerDisplay.kt",
  "app/src/test/java/com/paymentgate/cashier/api/JsonParsersTest.kt",
  "app/src/test/java/com/paymentgate/cashier/api/AssetNetworkCatalogTest.kt",
  "app/src/test/java/com/paymentgate/cashier/hardware/ReceiptLinesTest.kt",
  "app/src/test/java/com/paymentgate/cashier/hardware/CustomerPayContentTest.kt",
];

describe("@paymentgate/cashier-apk scaffold (M2–M5)", () => {
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

  it("scaffolds M5-02/M5-03 SmartPos hardware dual source sets", () => {
    const gradle = readFileSync(join(root, "app/build.gradle.kts"), "utf8");
    assert.match(gradle, /HAS_SMARTPOS/);
    assert.match(gradle, /src\/zcs\/java/);
    assert.match(gradle, /src\/noZcs\/java/);
    assert.match(gradle, /SmartPos/);
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /app\/libs\/\*\.aar/);
    const main = readFileSync(
      join(root, "app/src/main/java/com/paymentgate/cashier/MainActivity.kt"),
      "utf8",
    );
    assert.match(main, /customerDisplay/);
    assert.match(main, /toCustomerPayContent/);
    assert.match(main, /KeepScreenOnWhile/);
    assert.match(main, /PosScreen\.Settings/);
    assert.match(main, /apiBaseUrl/);
    assert.match(main, /Crossfade/);
    assert.match(main, /Modifier.fillMaxSize\(\)/);
    const surface = readFileSync(
      join(root, "app/src/main/java/com/paymentgate/cashier/api/CashierPosSurface.kt"),
      "utf8",
    );
    assert.match(surface, /MFA_REQUIRED_POS/);
    assert.match(surface, /NOT_CASHIER_POS/);
    assert.match(surface, /error\.code == "mfa_required"/);
    const login = readFileSync(
      join(root, "app/src/main/java/com/paymentgate/cashier/ui/LoginScreen.kt"),
      "utf8",
    );
    assert.match(login, /TEST BUILD — staging API/);
    const create = readFileSync(
      join(root, "app/src/main/java/com/paymentgate/cashier/ui/CreateOrderScreen.kt"),
      "utf8",
    );
    assert.match(create, /AmountKeypad/);
    assert.match(create, /AssetIcon/);
    assert.match(create, /NetworkIcon/);
    assert.match(create, /leadingIcon/);
    assert.match(create, /rememberAmountPulse/);
    assert.match(create, /AnimatedVisibility/);
    const settings = readFileSync(
      join(root, "app/src/main/java/com/paymentgate/cashier/ui/SettingsScreen.kt"),
      "utf8",
    );
    assert.match(settings, /darkTheme/);
    assert.match(settings, /onDarkThemeChange/);
    const theme = readFileSync(
      join(root, "app/src/main/java/com/paymentgate/cashier/ui/theme/Theme.kt"),
      "utf8",
    );
    assert.match(theme, /darkTheme: Boolean = false/);
    assert.match(theme, /lightColorScheme/);
  });

  it("starts POS after device boot (kiosk)", () => {
    const manifest = readFileSync(join(root, "app/src/main/AndroidManifest.xml"), "utf8");
    assert.match(manifest, /RECEIVE_BOOT_COMPLETED/);
    assert.match(manifest, /BootCompletedReceiver/);
    assert.match(manifest, /BOOT_COMPLETED/);
    assert.match(manifest, /android.intent.category.HOME/);
  });

  it("does not commit keystore.properties", () => {
    assert.equal(existsSync(join(root, "keystore.properties")), false);
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /keystore\.properties/);
  });
});
