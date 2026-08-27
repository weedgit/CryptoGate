import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { canReadPlatformOrgPolicy } from "../orgs/role-policy.mjs";
import { listWatcherHeartbeats } from "./watcher-health-store.mjs";

/**
 * GET /v1/platform/watcher-health
 * Platform O·A·V — latest per-network watcher heartbeats (+ lag-adjusted score).
 */
export async function handleGetWatcherHealth(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadPlatformOrgPolicy(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read watcher health");
    return;
  }
  try {
    const items = await listWatcherHeartbeats();
    sendJson(res, 200, {
      items,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Migration not applied yet — soft empty rather than 500 for local UI.
    if (/watcher_heartbeats|does not exist/i.test(message)) {
      sendJson(res, 200, {
        items: [],
        checkedAt: new Date().toISOString(),
        note: "watcher_heartbeats table missing — run migrations",
      });
      return;
    }
    sendError(res, 500, "internal_error", "Failed to load watcher health");
  }
}
