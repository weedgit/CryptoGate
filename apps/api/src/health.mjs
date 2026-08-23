/**
 * CLI health check for scripts/check.mjs — prints JSON and exits (no HTTP, no DB required).
 */
import { getHealthPayload } from "./health-payload.mjs";

const payload = await getHealthPayload({ checkDb: false });
console.log(JSON.stringify(payload));
process.exit(0);
