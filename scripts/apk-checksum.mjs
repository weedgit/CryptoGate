#!/usr/bin/env node
/**
 * M5-08 — SHA-256 checksums for Cashier release APKs.
 * Usage: node scripts/apk-checksum.mjs path/to/app.apk [more.apk …]
 * Output: sha256sum-compatible lines for `sha256sum -c`.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve);
  });
  return hash.digest("hex");
}

const paths = process.argv.slice(2).filter((p) => p && !p.startsWith("-"));
if (paths.length === 0) {
  console.error("Usage: node scripts/apk-checksum.mjs <apk> [apk …]");
  process.exit(1);
}

for (const filePath of paths) {
  const digest = await sha256File(filePath);
  console.log(`${digest}  ${basename(filePath)}`);
}
