type PlatformPendingProps = {
  title: string;
  copy?: string;
  /** Compact for nested panels / detail tabs. */
  compact?: boolean;
  className?: string;
  /** Subtle indeterminate bar under copy (default on unless compact). */
  showTrack?: boolean;
};

/** Centered spinner + copy — shared pending state for platform list/detail pages. */
export function PlatformPending({
  title,
  copy,
  compact,
  className,
  showTrack,
}: PlatformPendingProps) {
  const track = showTrack ?? !compact;

  return (
    <div
      className={`cg-pending plat-pending${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="cg-pending__mark plat-pending__mark" aria-hidden>
        <span className="cg-pending__pulse" />
        <span
          className={`cg-spinner ${compact ? "cg-spinner--sm" : "cg-spinner--md"} plat-pending__spinner`}
        />
      </div>
      <p className="cg-pending__title plat-pending__title">{title}</p>
      {copy ? (
        <p className="cg-pending__copy plat-pending__copy">{copy}</p>
      ) : null}
      {track ? (
        <div className="cg-pending__track" aria-hidden>
          <span className="cg-pending__track-fill" />
        </div>
      ) : null}
    </div>
  );
}

type PagePendingProps = {
  /** Defaults to a single generic label so route + data loads feel like one state. */
  title?: string;
  copy?: string;
  /** `full` = session boot (entire viewport). `content` = portal shell pane. */
  viewport?: "full" | "content";
};

/** Viewport-centered page load — use for lazy routes and first paint while data fetches. */
export function PagePending({
  title = "Loading",
  copy,
  viewport = "content",
}: PagePendingProps) {
  return (
    <div
      className={`page-pending${viewport === "full" ? " page-pending--full" : ""}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <PlatformPending title={title} copy={copy} className="is-page" />
    </div>
  );
}

type PlatformTableSkeletonProps = {
  columns: number;
  rows?: number;
  className?: string;
};

/** Skeleton rows that match table chrome while the first fetch is in flight. */
export function PlatformTableSkeleton({
  columns,
  rows = 8,
  className,
}: PlatformTableSkeletonProps) {
  return (
    <div
      className={`plat-pending-skel${className ? ` ${className}` : ""}`}
      role="status"
      aria-busy="true"
      aria-label="Loading table"
    >
      <div className="plat-pending-skel__head" aria-hidden>
        {Array.from({ length: columns }, (_, i) => (
          <span key={`h-${i}`} className="plat-pending-skel__cell is-head" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={`r-${r}`}
          className="plat-pending-skel__row"
          style={{ animationDelay: `${Math.min(r, 10) * 50}ms` }}
          aria-hidden
        >
          {Array.from({ length: columns }, (_, c) => (
            <span
              key={`c-${c}`}
              className="plat-pending-skel__cell cg-shimmer"
              style={{
                width: `${58 + ((r * 3 + c * 11) % 28)}%`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
