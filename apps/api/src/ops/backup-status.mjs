import { readFile } from "node:fs/promises";

const DEFAULT_STATUS_PATH = "/var/backups/paymentgate/status.json";
const DEFAULT_STALE_HOURS = 36;

/**
 * @typedef {{
 *   status: "ok" | "failed" | "stale" | "unknown",
 *   detail: string,
 *   lastAt: string | null,
 *   ageHours: number | null,
 *   staleAfterHours: number,
 *   bytes: number | null,
 *   offsite: boolean | null,
 *   errors: number | null,
 *   message: string | null,
 * }} BackupStatusSnapshot
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, finishedAt: string | null, bytes: number | null, offsite: boolean | null, errors: number, message: string | null } | null}
 */
function normalizeStatusFile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const finishedAt =
    typeof row.finishedAt === "string" && row.finishedAt.trim()
      ? row.finishedAt.trim()
      : typeof row.stamp === "string" && /^\d{8}T\d{6}Z$/.test(row.stamp)
        ? `${row.stamp.slice(0, 4)}-${row.stamp.slice(4, 6)}-${row.stamp.slice(6, 8)}T${row.stamp.slice(9, 11)}:${row.stamp.slice(11, 13)}:${row.stamp.slice(13, 15)}.000Z`
        : null;
  const ok = row.ok === true || row.ok === "true" || row.ok === 1;
  const errors =
    typeof row.errors === "number" && Number.isFinite(row.errors)
      ? Math.max(0, Math.trunc(row.errors))
      : ok
        ? 0
        : 1;
  return {
    ok: Boolean(ok) && errors === 0,
    finishedAt,
    bytes:
      typeof row.bytes === "number" && Number.isFinite(row.bytes)
        ? Math.max(0, Math.trunc(row.bytes))
        : null,
    offsite: typeof row.offsite === "boolean" ? row.offsite : null,
    errors,
    message: typeof row.message === "string" ? row.message : null,
  };
}

/**
 * @param {number} hours
 */
function formatAge(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "unknown age";
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins}m ago`;
  }
  if (hours < 48) {
    const h = Math.round(hours * 10) / 10;
    return `${h}h ago`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d ago`;
}

/**
 * Resolve DB backup health from status.json written by deploy/backup.sh.
 * @param {{
 *   statusPath?: string,
 *   staleAfterHours?: number,
 *   nowMs?: number,
 *   readFileFn?: (path: string, enc: string) => Promise<string>,
 * }} [opts]
 * @returns {Promise<BackupStatusSnapshot>}
 */
export async function resolveBackupStatus(opts = {}) {
  const statusPath =
    opts.statusPath ??
    process.env.PAYMENTGATE_BACKUP_STATUS_PATH ??
    DEFAULT_STATUS_PATH;
  const staleAfterHours = Math.max(
    1,
    Number(
      opts.staleAfterHours ??
        process.env.PAYMENTGATE_BACKUP_STALE_HOURS ??
        DEFAULT_STALE_HOURS,
    ) || DEFAULT_STALE_HOURS,
  );
  const nowMs = opts.nowMs ?? Date.now();
  const readFileFn = opts.readFileFn ?? readFile;

  /** @type {BackupStatusSnapshot} */
  const unknown = {
    status: "unknown",
    detail: "No backup status yet",
    lastAt: null,
    ageHours: null,
    staleAfterHours,
    bytes: null,
    offsite: null,
    errors: null,
    message: null,
  };

  let rawText;
  try {
    rawText = await readFileFn(statusPath, "utf8");
  } catch {
    return unknown;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ...unknown,
      status: "failed",
      detail: "Backup status file invalid",
      message: "invalid status.json",
    };
  }

  const file = normalizeStatusFile(parsed);
  if (!file) {
    return {
      ...unknown,
      status: "failed",
      detail: "Backup status file invalid",
      message: "invalid status.json",
    };
  }

  const lastMs = file.finishedAt ? Date.parse(file.finishedAt) : NaN;
  const ageHours = Number.isFinite(lastMs)
    ? Math.max(0, (nowMs - lastMs) / 3_600_000)
    : null;
  const lastAt = Number.isFinite(lastMs)
    ? new Date(lastMs).toISOString()
    : null;

  if (!file.ok) {
    return {
      status: "failed",
      detail: file.message?.trim() || "Last backup failed",
      lastAt,
      ageHours,
      staleAfterHours,
      bytes: file.bytes,
      offsite: file.offsite,
      errors: file.errors,
      message: file.message,
    };
  }

  if (ageHours == null) {
    return {
      status: "failed",
      detail: "Backup finishedAt missing",
      lastAt: null,
      ageHours: null,
      staleAfterHours,
      bytes: file.bytes,
      offsite: file.offsite,
      errors: file.errors,
      message: file.message,
    };
  }

  if (ageHours > staleAfterHours) {
    return {
      status: "stale",
      detail: `Last success ${formatAge(ageHours)}`,
      lastAt,
      ageHours,
      staleAfterHours,
      bytes: file.bytes,
      offsite: file.offsite,
      errors: file.errors,
      message: file.message,
    };
  }

  return {
    status: "ok",
    detail: `Last success ${formatAge(ageHours)}`,
    lastAt,
    ageHours,
    staleAfterHours,
    bytes: file.bytes,
    offsite: file.offsite,
    errors: file.errors,
    message: file.message,
  };
}

/**
 * Compact fields safe for public GET /health.
 * @param {BackupStatusSnapshot} snap
 */
export function backupHealthFields(snap) {
  return {
    backup: snap.status,
    backupDetail: snap.detail,
    backupLastAt: snap.lastAt,
    backupAgeHours:
      snap.ageHours == null ? null : Math.round(snap.ageHours * 10) / 10,
  };
}
