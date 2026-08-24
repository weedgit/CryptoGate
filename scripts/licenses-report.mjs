#!/usr/bin/env node
/**
 * Regenerate doc/M4-34-Third-Party-Licenses.md from pnpm lockfile.
 * Requires: npx pnpm@9.15.0 install
 *
 * Usage: node scripts/licenses-report.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "doc/M4-34-Third-Party-Licenses.md");

const pnpm = spawnSync("npx", ["pnpm@9.15.0", "licenses", "list", "--json"], {
  cwd: root,
  encoding: "utf8",
});

if (pnpm.status !== 0) {
  console.error(pnpm.stderr || "pnpm licenses list failed");
  process.exit(pnpm.status ?? 1);
}

/** @type {Record<string, Array<{ name: string, license: string, versions: string[], homepage?: string }>>} */
const byLicense = JSON.parse(pnpm.stdout);

/** @type {Array<{ name: string, license: string, version: string, homepage: string }>} */
const rows = [];

for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    rows.push({
      name: pkg.name,
      license: pkg.license || license,
      version: (pkg.versions && pkg.versions[0]) || "",
      homepage: pkg.homepage || "",
    });
  }
}

rows.sort((a, b) => a.name.localeCompare(b.name, "en"));

const licenseCounts = {};
for (const row of rows) {
  licenseCounts[row.license] = (licenseCounts[row.license] || 0) + 1;
}

const generated = new Date().toISOString().slice(0, 10);

const md = `# M4-34 — Third-party & open-source licenses

**Owner:** Kevin (infra). **Implements:** Milestone M4-34.  
**Regenerate:** \`node scripts/licenses-report.mjs\` after \`pnpm install\` (from repo root).

Phase 1 npm dependencies for the monorepo (API, watcher, web, payment-page, packages).  
**Cashier APK** (Gradle) and **managed cloud services** are listed separately — not generated from this script.

**Generated:** ${generated} · **Packages:** ${rows.length}

---

## 1. License summary (npm)

| License | Package count |
| --- | --- |
${Object.entries(licenseCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([lic, n]) => `| ${lic} | ${n} |`)
  .join("\n")}

All listed npm packages are permissive (MIT, ISC, Apache-2.0, BSD-3-Clause) except **caniuse-lite** (CC-BY-4.0, dev/build tooling only). Review any **copyleft** license before adding new dependencies (Phase 1 policy: avoid GPL in production bundles).

---

## 2. External services (not npm)

| Service | Role | License / terms |
| --- | --- | --- |
| PostgreSQL 16 | Database (Docker local; managed in prod) | [PostgreSQL License](https://www.postgresql.org/about/licence/) |
| TronGrid / Tron RPC | Chain ingest (watcher) | Provider ToS — Company A account |
| Node.js ≥ 20 | Runtime | MIT |
| pnpm 9.15 | Package manager | MIT |

Company A cloud (Postgres host, TLS, secrets manager, bastion) follows provider agreements — see [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md).

---

## 3. Cashier APK (Android)

Gradle dependencies for \`apps/cashier-apk\` are **not** included in the table below until the release build.gradle is locked (Bruce — M4-23). Before pilot, run the Android Gradle license report and append to this doc or \`doc/Cashier-Apk.md\`.

---

## 4. Full npm dependency list

| Package | Version | License | Homepage |
| --- | --- | --- | --- |
${rows.map((r) => `| ${r.name} | ${r.version} | ${r.license} | ${r.homepage ? `[link](${r.homepage})` : "—"} |`).join("\n")}

---

## Related

- CVE / dependency review: Milestone **M4-T04** — run \`pnpm audit\` (or Company A scanner) before prod release  
- Deploy ops: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md)
`;

writeFileSync(outPath, md);
console.log(`Wrote ${outPath} (${rows.length} packages)`);
