/**
 * Sprint 0 health stub so local `node apps/api/src/health.mjs` works.
 * Andrew replaces with real HTTP server + migration runner.
 */
console.log(
  JSON.stringify({
    service: "cryptogate-api",
    status: "ok",
    phase: "sprint0-stub",
    message: "Health placeholder — Andrew owns apps/api",
  }),
);
