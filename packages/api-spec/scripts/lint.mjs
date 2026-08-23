import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const specPath = join(root, "..", "openapi.yaml");
const raw = readFileSync(specPath, "utf8");

const required = [
  "openapi: 3.0.3",
  "version: 0.1.0",
  "/auth/login",
  "/auth/logout",
  "/auth/session",
  "/auth/mfa/enroll",
  "/auth/mfa/verify",
  "/orgs",
  "/orders",
  "createPaymentOrder",
  "OrgType",
  "UserRole",
  "OrderStatus",
  "MatchingMode",
];

const missing = required.filter((needle) => !raw.includes(needle));
if (missing.length > 0) {
  console.error("OpenAPI M1 contract freeze checks failed. Missing:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log("OpenAPI M1 contract freeze v0.1: ok");
