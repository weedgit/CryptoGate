type PlatformPendingProps = {
  title: string;
  copy?: string;
  /** Compact for nested panels / detail tabs. */
  compact?: boolean;
  className?: string;
};

/** Centered spinner + copy — shared pending state for platform list/detail pages. */
export function PlatformPending({
  title,
  copy,
  compact,
  className,
}: PlatformPendingProps) {
  return (
    <div
      className={`plat-pending${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="plat-pending__mark" aria-hidden>
        <span className="plat-pending__spinner" />
      </div>
      <p className="plat-pending__title">{title}</p>
      {copy ? <p className="plat-pending__copy">{copy}</p> : null}
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
          style={{ animationDelay: `${Math.min(r, 10) * 45}ms` }}
          aria-hidden
        >
          {Array.from({ length: columns }, (_, c) => (
            <span
              key={`c-${c}`}
              className="plat-pending-skel__cell"
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
