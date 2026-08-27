type Props = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

/** Compact pager for Agents / Merchants split lists. */
export function OrgListPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: Props) {
  if (total === 0 || pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="org-pager" aria-label="Table pagination">
      <p className="org-pager__meta">
        {from}–{to} of {total}
      </p>
      <div className="org-pager__controls">
        <button
          type="button"
          className="org-pager__btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </button>
        <span className="org-pager__page">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className="org-pager__btn"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
