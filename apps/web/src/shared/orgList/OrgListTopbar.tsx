import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTopbarSlots } from "./useOrgListLayout";
import { ORG_STATUS_PILLS, type OrgStatusFilter } from "./orgListState";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  searchLabel: string;
  statusFilter: OrgStatusFilter;
  onStatusFilterChange: (value: OrgStatusFilter) => void;
  actionsLabel: string;
  /** Onboarding CTA; omitted when the viewer may not onboard. */
  cta?: { to: string; label: string } | null;
};

/** Search box + status pills + onboarding CTA, portalled into the shell top bar. */
export function OrgListTopbar({
  query,
  onQueryChange,
  searchPlaceholder,
  searchLabel,
  statusFilter,
  onStatusFilterChange,
  actionsLabel,
  cta,
}: Props) {
  const slots = useTopbarSlots();
  return (
    <>
      {slots.center
        ? createPortal(
            <label className="org-agents__search-wrap">
              <span className="org-agents__search-icon" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="M12.75 12.75 16.5 16.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                className="field-control org-agents__search"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                aria-label={searchLabel}
              />
            </label>,
            slots.center,
          )
        : null}

      {slots.actions
        ? createPortal(
            <div className="org-agents__actions" aria-label={actionsLabel}>
              <div className="org-agents__pills" role="group" aria-label="Status filter">
                {ORG_STATUS_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    className={`org-agents__pill${statusFilter === pill.id ? " is-active" : ""}`}
                    aria-pressed={statusFilter === pill.id}
                    onClick={() => onStatusFilterChange(pill.id)}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              {cta ? (
                <Link className="btn-primary org-agents__cta" to={cta.to}>
                  {cta.label}
                </Link>
              ) : null}
            </div>,
            slots.actions,
          )
        : null}
    </>
  );
}
