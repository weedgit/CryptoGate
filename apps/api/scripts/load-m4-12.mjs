#!/usr/bin/env node
/**
 * M4-12 load harness — create order / get status / webhook fan-out.
 *
 *   # CI / no DB (mapper + mocked fan-out)
 *   node apps/api/scripts/load-m4-12.mjs
 *
 *   # Live Postgres (store insert + fan-out drain)
 *   DATABASE_URL=... node apps/api/scripts/load-m4-12.mjs --db
 *
 *   # HTTP router (POST /v1/orders + GET /v1/orders/{id} + fan-out)
 *   DATABASE_URL=... node apps/api/scripts/load-m4-12.mjs --http
 *
 * Env (optional):
 *   LOAD_CREATE_N  LOAD_STATUS_N  LOAD_FANOUT_N  LOAD_CONCURRENCY
 */
import {
  assertInProcessGates,
  runInProcessLoad,
} from "../src/load/load-m4-12-inprocess.mjs";

const useHttp =
  process.argv.includes("--http") || process.env.LOAD_M4_12_HTTP === "1";
const useDb =
  !useHttp &&
  (process.argv.includes("--db") || process.env.LOAD_M4_12_DB === "1");

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function main() {
  if (useHttp || useDb) {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL required for --db / --http mode");
      process.exit(1);
    }
  }

  if (useHttp) {
    const { assertHttpGates, runHttpLoad, shutdownLoadHttp } = await import(
      "../src/load/load-m4-12-http.mjs"
    );
    try {
      const report = await runHttpLoad({
        createN: envInt("LOAD_CREATE_N", 30),
        statusN: envInt("LOAD_STATUS_N", 60),
        concurrency: envInt("LOAD_CONCURRENCY", 8),
      });
      assertHttpGates(report);
      console.log(JSON.stringify(report, null, 2));
      console.log("m4-12 load (http): ok");
    } finally {
      await shutdownLoadHttp();
    }
    return;
  }

  if (useDb) {
    const { assertDbGates, runDbLoad, shutdownLoadDb } = await import(
      "../src/load/load-m4-12-db.mjs"
    );
    try {
      const report = await runDbLoad({
        createN: envInt("LOAD_CREATE_N", 50),
        statusN: envInt("LOAD_STATUS_N", 100),
        concurrency: envInt("LOAD_CONCURRENCY", 10),
      });
      assertDbGates(report);
      console.log(JSON.stringify(report, null, 2));
      console.log("m4-12 load (db): ok");
    } finally {
      await shutdownLoadDb();
    }
    return;
  }

  const report = await runInProcessLoad({
    createN: envInt("LOAD_CREATE_N", 200),
    statusN: envInt("LOAD_STATUS_N", 500),
    fanoutN: envInt("LOAD_FANOUT_N", 200),
    concurrency: envInt("LOAD_CONCURRENCY", 20),
  });
  assertInProcessGates(report);
  console.log(JSON.stringify(report, null, 2));
  console.log("m4-12 load (inprocess): ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
