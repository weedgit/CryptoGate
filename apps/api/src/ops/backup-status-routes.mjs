import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { canReadPlatformOrgPolicy } from "../orgs/role-policy.mjs";
import { resolveBackupStatus } from "./backup-status.mjs";

/**
 * GET /v1/platform/backup-status
 * Platform O·A·V — last DB backup from deploy/backup.sh status.json.
 */
export async function handleGetBackupStatus(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadPlatformOrgPolicy(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read backup status");
    return;
  }
  try {
    const snap = await resolveBackupStatus();
    sendJson(res, 200, {
      ...snap,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    sendError(res, 500, "internal_error", "Failed to load backup status");
  }
}
