import type { ReactNode } from "react";
import type { ActivityFeedItem } from "./orgDetailSeeds";

function activityWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day}-${month}-${d.getFullYear()} ${time}`;
}

function activityTone(title: string): "ok" | "info" {
  if (/created|status|sign-in/i.test(title)) return "info";
  return "ok";
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 5.2V8.2l2 1.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Recent-activity table — columns match the agent detail mock. */
export function DetailActivityTable({ rows }: { rows: ActivityFeedItem[] }) {
  return (
    <div className="b3-agent-detail__table-scroll b3-activity-table">
      <table className="data-table b3-activity-table__grid">
        <thead>
          <tr>
            <th>Event</th>
            <th>Details</th>
            <th>Date & time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = activityTone(row.title);
            return (
              <tr key={row.id}>
                <td>
                  <span className="b3-activity-table__event">
                    <span className={`b3-activity-table__dot tone-${tone}`} aria-hidden />
                    {row.title}
                  </span>
                </td>
                <td className="b3-activity-table__details">{row.description}</td>
                <td className="b3-activity-table__when">
                  <time dateTime={row.createdAt}>{activityWhen(row.createdAt)}</time>
                </td>
                <td>
                  <span className={`b3-activity-table__status tone-${tone}`}>
                    {tone === "ok" ? "Success" : "Info"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Activity card used on Overview (preview) and the Recent activity tab.
 */
export function DetailActivityCard({
  subtitle,
  rows,
  loading = false,
  empty,
  action,
}: {
  subtitle: string;
  rows: ActivityFeedItem[];
  loading?: boolean;
  empty: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="b3-card b3-card--section b3-card--flat b3-agent-detail__activity">
      <div className="b3-profile__head b3-agent-detail__activity-head">
        <span className="b3-profile__head-icon" aria-hidden>
          <ClockIcon />
        </span>
        <div className="b3-profile__head-copy">
          <h3 className="b3-card__heading">Recent activity</h3>
          <p className="b3-profile__sub">{subtitle}</p>
        </div>
        {action}
      </div>
      {loading && rows.length === 0 ? empty : rows.length === 0 ? empty : (
        <DetailActivityTable rows={rows} />
      )}
    </section>
  );
}
