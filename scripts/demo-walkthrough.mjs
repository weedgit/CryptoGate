#!/usr/bin/env node
/**
 * M1-T05 — print guest pay demo URLs for prototype walkthrough.
 * Usage: node scripts/demo-walkthrough.mjs [baseOrigin]
 */
const base = (process.argv[2] || "http://localhost:5173").replace(/\/+$/, "");

const demos = [
  ["Default Tron pending", "/?network=tron&amount=245.00&state=pending"],
  ["Mode C exact payable", "/?mode=C&amount=245.01&state=pending"],
  ["Verifying", "/?state=verifying"],
  ["Completed", "/?state=completed"],
  ["Payment anomaly", "/?state=anomaly"],
  ["Expired", "/?state=expired"],
  ["USDT Ethereum (UI preview)", "/?network=ethereum&asset=USDT&state=pending"],
  ["USDT BSC (UI preview)", "/?network=bnb_smart_chain&asset=USDT&state=pending"],
  ["POS wireframe", "/pos/index.html"],
];

console.log("M1-T05 demo URLs (guest pay origin:", base, ")\n");
for (const [label, path] of demos) {
  console.log(`${label}\n  ${base}${path}\n`);
}
console.log("Full script: doc/M1-T05-Demo-Script.md");
