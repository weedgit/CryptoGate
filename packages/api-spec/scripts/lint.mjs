import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const specPath = join(root, "..", "openapi.yaml");
const raw = readFileSync(specPath, "utf8");

const required = [
  "openapi: 3.0.3",
  "version: 0.2.1",
  "/auth/login",
  "/auth/logout",
  "/auth/session",
  "/auth/mfa/enroll",
  "/auth/mfa/verify",
  "/orgs",
  "/orgs/{orgId}/matching-mode",
  "getMatchingModeSettings",
  "putMatchingModeSettings",
  "MatchingModeSettings",
  "UpdateMatchingModeRequest",
  "/orders",
  "/orders/{id}/payment",
  "createPaymentOrder",
  "getPaymentOrder",
  "getPaymentOrderPayment",
  "OrgType",
  "UserRole",
  "OrderStatus",
  "MatchingMode",
  "addressSource",
  "hdIndex",
  "memoOrTag",
  "copyAmount",
  "merchantName",
  "payExactAmountWarning",
  "Idempotency-Key",
  "security: []",
];

const missing = required.filter((needle) => !raw.includes(needle));
if (missing.length > 0) {
  console.error("OpenAPI M2 contract freeze checks failed. Missing:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

if (!raw.includes("version: 0.2.1")) {
  console.error("OpenAPI must declare version 0.2.1 for matching-mode settings");
  process.exit(1);
}

const paymentSlice =
  raw.split("/orders/{id}/payment:")[1]?.split("/webhooks:")[0] ?? "";
if (paymentSlice.includes("sessionCookie") || paymentSlice.includes("apiKey")) {
  console.error("GET /orders/{id}/payment must not require a merchant session");
  process.exit(1);
}
if (!paymentSlice.includes("security: []")) {
  console.error("GET /orders/{id}/payment must set security: []");
  process.exit(1);
}

console.log("OpenAPI M2 contract freeze v0.2.1: ok");
