import type { ReactNode } from "react";
import { formatViewerDateTime } from "../../shared/dateTime";
import type { AuditLogEntry } from "../api";

/** A run older than this (daily job + slack) shows as "No recent run". */
const RECENT_RUN_MS = 36 * 60 * 60 * 1000;

type Props = {
  /** When the job runs, e.g. "Daily · 00:00 UTC". */
  schedule: ReactNode;
  /** Latest auto-run audit entry; `undefined` hides the last-run rows (portals). */
  lastRun?: AuditLogEntry | null;
  /** Expected gap between runs; defaults to daily. */
  recentWithinMs?: number;
  note?: ReactNode;
};

/** Auto schedule summary pinned to the bottom of a status rail. */
export function AutoScheduleCard({
  schedule,
  lastRun,
  recentWithinMs = RECENT_RUN_MS,
  note,
}: Props) {
  const showRun = lastRun !== undefined;
  const rawCreated = lastRun?.metadata?.created;
  const created = typeof rawCreated === "number" ? rawCreated : 0;
  let tone: "ok" | "warn" | "muted" = "muted";
  let status = "Never run";
  if (lastRun) {
    const age = Date.now() - new Date(lastRun.createdAt).getTime();
    tone = age <= recentWithinMs ? "ok" : "warn";
    status = tone === "ok" ? "Running" : "No recent run";
  }

  return (
    <section className="plat-bills__schedule-card" aria-label="Auto schedule">
      <header className="plat-bills__schedule-head">
        <span className="plat-bills__schedule-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="plat-bills__schedule-title">Auto schedule</span>
        {showRun ? (
          <span className={`plat-bills__schedule-status tone-${tone}`} title={status}>
            <span className="plat-bills__schedule-dot" aria-hidden />
            {status}
          </span>
        ) : null}
      </header>
      <dl className="plat-bills__schedule-list">
        <div>
          <dt>Runs</dt>
          <dd>{schedule}</dd>
        </div>
        {showRun ? (
          <div>
            <dt>Last run</dt>
            <dd>{lastRun ? formatViewerDateTime(lastRun.createdAt) : "Never"}</dd>
          </div>
        ) : null}
        {lastRun ? (
          <div>
            <dt>Created</dt>
            <dd>{created}</dd>
          </div>
        ) : null}
      </dl>
      {note ? <p className="plat-bills__schedule-foot">{note}</p> : null}
    </section>
  );
}
