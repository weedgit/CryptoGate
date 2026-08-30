type Props = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

/** Compact pager for Agents / Merchants / Commissions tables. */
export function OrgListPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: Props) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const multi = pageCount > 1;

  return (
    <nav className="org-pager" aria-label="Table pagination">
      <p className="org-pager__meta">
        {from}–{to} of {total}
      </p>
      <div className="org-pager__controls">
        <button
          type="button"
          className="org-pager__btn"
          disabled={!multi || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </button>
        <span className="org-pager__page">
          {page} / {Math.max(pageCount, 1)}
        </span>
        <button
          type="button"
          className="org-pager__btn"
          disabled={!multi || page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
