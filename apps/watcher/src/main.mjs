/**
 * Sprint 0 watcher stub — boots, logs health, exits cleanly.
 * Bruce owns real ingest; this file is a process placeholder so CI and local
 * compose can prove API and watcher stay separate processes.
 */
const startedAt = new Date().toISOString();
console.log(
  JSON.stringify({
    service: "cryptogate-watcher",
    status: "ok",
    phase: "sprint0-stub",
    startedAt,
    message: "Watcher process boots separately from apps/api",
  }),
);
process.exit(0);
