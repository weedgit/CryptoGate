type OrdersSkeletonProps = {
  rows?: number;
};

/** Figma 03 shimmer skeleton matching merchant orders table columns. */
export function OrdersTableSkeleton({ rows = 5 }: OrdersSkeletonProps) {
  return (
    <div className="cg-skel" aria-busy="true" aria-label="Loading orders">
      {Array.from({ length: rows }, (_, i) => (
        <div className="cg-skel__row" key={i}>
          <span className="cg-skel__bar cg-skel__bar--lg" />
          <span className="cg-skel__bar" />
          <span className="cg-skel__bar" />
          <span className="cg-skel__bar" />
          <span className="cg-skel__bar" />
          <span className="cg-skel__bar" />
          <span className="cg-skel__bar" />
          <span className="cg-skel__bar" />
        </div>
      ))}
    </div>
  );
}
