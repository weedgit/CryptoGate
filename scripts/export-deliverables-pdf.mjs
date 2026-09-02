#!/usr/bin/env node
/**
 * Export Phase 1 Company A deliverable markdown docs to PDF in doc/export/.
 * Usage: node scripts/export-deliverables-pdf.mjs
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exportDir = join(root, "doc", "export");

/** @type {Array<{ out: string; sources: string[] }>} */
const jobs = [
  { out: "00-Deliverables-Index.pdf", sources: ["doc/export/00-Deliverables-Index.md"] },
  { out: "01-Product-Requirements-Spec.pdf", sources: ["doc/Phase1-Requirement.md"] },
  { out: "01-Project-Requirement.pdf", sources: ["doc/Project-Requirement.md"] },
  { out: "02-UI-Page-Spec.pdf", sources: ["doc/UI-Page-Spec.md"] },
  { out: "02-UI-Handoff.pdf", sources: ["doc/UI-Handoff.md"] },
  { out: "02-Business-Model.pdf", sources: ["doc/Business-Model.md"] },
  { out: "03-System-Architecture.pdf", sources: ["doc/ARCHITECTURE.md"] },
  { out: "04-Database-Schema.pdf", sources: ["doc/M4-35-Database-Schema.md"] },
  { out: "04-API-Design-Signed-Api.pdf", sources: ["doc/M3-01-Signed-Api.md"] },
  { out: "04-OpenAPI-Audit-Bills-v032.pdf", sources: ["doc/M4-36-Audit-Bills-v032.md"] },
  { out: "05-Source-Code-Deliverable.pdf", sources: ["doc/export/05-Source-Code-Deliverable.md"] },
  { out: "06-Applications-Deliverable.pdf", sources: ["doc/export/06-Applications-Deliverable.md"] },
  { out: "07-Cashier-Apk-Install.pdf", sources: ["doc/M5-08-Cashier-Apk-Install.md"] },
  { out: "07-Cashier-Apk-Dev-Reference.pdf", sources: ["doc/Cashier-Apk.md"] },
  { out: "08-Integration-Guide.pdf", sources: ["doc/M3-02-Integration-Guide.md"] },
  { out: "08-Webhook-Verification.pdf", sources: ["doc/Webhook-Verification.md"] },
  { out: "08-Webhook-Verify-Example.pdf", sources: ["doc/M3-03-Webhook-Verify-Example.md"] },
  { out: "09-Asset-Networks.pdf", sources: ["doc/M3-04-Asset-Networks.md"] },
  { out: "10-Env-Matrix.pdf", sources: ["doc/M4-05-Env-Matrix.md"] },
  { out: "10-Deploy-Runbook.pdf", sources: ["doc/M4-01-Deploy-Runbook.md"] },
  { out: "10-Company-A-Handoff.pdf", sources: ["doc/M3-T09-Company-A-Handoff.md"] },
  { out: "11-Regression-Report.pdf", sources: ["doc/M4-T01-Regression-Report.md"] },
  { out: "11-Restore-Drill-Report.pdf", sources: ["doc/M4-T04-Restore-Drill-Report.md"] },
  { out: "11-M3-Acceptance.pdf", sources: ["doc/M3-Acceptance.md"] },
  { out: "12-Deploy-Runbook.pdf", sources: ["doc/M4-01-Deploy-Runbook.md"] },
  { out: "12-Backup-Monitoring.pdf", sources: ["doc/M4-03-Backup-Monitoring.md"] },
  { out: "12-Secrets-TLS.pdf", sources: ["doc/M4-02-Secrets-TLS.md"] },
  { out: "12-Ops-Runbook-Index.pdf", sources: ["doc/M4-33-Ops-Runbook-Index.md"] },
  { out: "13-Merchant-Manual.pdf", sources: ["doc/M4-32-Merchant-Manual.md"] },
  { out: "13-Administrator-Manual.pdf", sources: ["doc/export/13-Administrator-Manual.md"] },
  { out: "13-Cashier-Apk-Install.pdf", sources: ["doc/M5-08-Cashier-Apk-Install.md"] },
  { out: "14-Third-Party-Licenses.pdf", sources: ["doc/M4-34-Third-Party-Licenses.md"] },
  { out: "15-Company-A-Handoff.pdf", sources: ["doc/M3-T09-Company-A-Handoff.md"] },
  { out: "15-Phase1-Project-Plan.pdf", sources: ["doc/Phase1-Project-Plan.md"] },
];

mkdirSync(exportDir, { recursive: true });

const pandocArgs = [
  "--pdf-engine=xelatex",
  "-V",
  "geometry:margin=18mm",
  "-V",
  "fontsize=11pt",
  "-V",
  "documentclass=article",
  "--highlight-style=tango",
];

let ok = 0;
let fail = 0;
/** @type {Map<string, string>} */
const generatedBySource = new Map();

for (const { out, sources } of jobs) {
  const missing = sources.filter((s) => !existsSync(join(root, s)));
  if (missing.length) {
    console.error(`SKIP ${out}: missing ${missing.join(", ")}`);
    fail++;
    continue;
  }

  const sourceKey = sources[0];
  const input = join(root, sourceKey);
  const dest = join(exportDir, out);

  if (generatedBySource.has(sourceKey)) {
    copyFileSync(generatedBySource.get(sourceKey), dest);
    console.log(`OK  ${out} (copy)`);
    ok++;
    continue;
  }

  const result = spawnSync("pandoc", [input, "-o", dest, ...pandocArgs], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status === 0 && existsSync(dest)) {
    generatedBySource.set(sourceKey, dest);
    console.log(`OK  ${out}`);
    ok++;
  } else {
    console.error(`FAIL ${out}`);
    if (result.stderr) console.error(result.stderr.trim());
    fail++;
  }
}

console.log(`\nDone: ${ok} PDFs written to doc/export/, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
