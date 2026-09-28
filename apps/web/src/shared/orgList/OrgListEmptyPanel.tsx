import { Link } from "react-router-dom";
import type { OrgListEmptyVariant, OrgStatusFilter } from "./orgListState";

export type OrgListEmptyCopy = {
  /** Plural noun, e.g. "merchants". */
  noun: string;
  /** Singular noun, e.g. "merchant". */
  singular: string;
  loadingCopy: string;
  searchingCopy: string;
  noneCopy: string;
  noneHints?: string[];
  searchHints?: string[];
  /** Shown when the list is empty and the viewer may onboard. */
  onboard?: { to: string; label: string } | null;
  /** Icon for the empty / no-filter states. */
  icon?: "building" | "split";
};

type Props = {
  variant: OrgListEmptyVariant;
  copy: OrgListEmptyCopy;
  query?: string;
  statusFilter?: OrgStatusFilter;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
  onRetry?: () => void;
};

export function SplitPaneIcon() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
      <rect x="6" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="28" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
      <path d="M20 24h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

function EmptyIcon({
  variant,
  icon,
}: {
  variant: OrgListEmptyVariant;
  icon?: "building" | "split";
}) {
  if (variant === "loading" || variant === "searching") {
    return <span className="cg-spinner cg-spinner--md org-agents__list-empty-spinner" />;
  }
  if (variant === "no-results") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
        <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M27 27 36 36" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M16 20h8M20 16v8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    );
  }
  if (variant === "error") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
        <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.6" />
        <path d="M24 16v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="24" cy="32" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "split") return <SplitPaneIcon />;
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
      <path
        d="M10 34V14l14-6 14 6v20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M18 34V22l6-3 6 3v12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path d="M24 8v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Left-column empty / loading / error state for org split lists. */
export function OrgListEmptyPanel({
  variant,
  copy,
  query,
  statusFilter,
  onClearSearch,
  onClearFilter,
  onRetry,
}: Props) {
  const { noun, singular } = copy;
  const title =
    variant === "loading"
      ? `Loading ${noun}`
      : variant === "searching"
        ? "Searching by email"
        : variant === "none"
          ? `No ${singular} accounts yet`
          : variant === "no-results"
            ? `No matching ${noun}`
            : variant === "no-filter"
              ? `No ${statusFilter === "paused" ? "paused" : "active"} ${noun}`
              : `Could not load ${noun}`;

  const body =
    variant === "loading"
      ? copy.loadingCopy
      : variant === "searching"
        ? copy.searchingCopy
        : variant === "none"
          ? copy.noneCopy
          : variant === "no-results"
            ? query
              ? `Nothing matched “${query}”. Try a different name, email, or org ID.`
              : "Try a different name, email, or org ID."
            : variant === "no-filter"
              ? "Change the status filter or switch back to All to see more accounts."
              : `The ${singular} list could not be loaded. Check your connection and try again.`;

  const hints =
    variant === "none"
      ? copy.noneHints
      : variant === "no-results" || variant === "searching"
        ? copy.searchHints
        : undefined;
  const busy = variant === "loading" || variant === "searching";

  return (
    <div className="org-agents__list-empty b3-empty" role="status">
      <div className={`b3-empty__mark${busy ? " is-busy" : ""}`} aria-hidden>
        <EmptyIcon variant={variant} icon={copy.icon} />
      </div>
      <p className="b3-empty__title">{title}</p>
      <p className="b3-empty__copy">{body}</p>
      {hints?.length ? (
        <ul className="b3-empty__hints">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : null}
      <div className="org-agents__list-empty-actions">
        {variant === "no-results" && onClearSearch ? (
          <button type="button" className="btn-ghost btn-inline" onClick={onClearSearch}>
            Clear search
          </button>
        ) : null}
        {variant === "no-filter" && onClearFilter ? (
          <button type="button" className="btn-ghost btn-inline" onClick={onClearFilter}>
            Show all {noun}
          </button>
        ) : null}
        {variant === "none" && copy.onboard ? (
          <Link className="btn-primary btn-inline" to={copy.onboard.to}>
            {copy.onboard.label}
          </Link>
        ) : null}
        {variant === "error" && onRetry ? (
          <button type="button" className="btn-primary btn-inline" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
