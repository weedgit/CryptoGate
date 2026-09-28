import { useEffect, useMemo, useState } from "react";

export const DASH_TABLE_PAGE_SIZE = 10;

/** Client-side paging for small dashboard tables. */
export function usePagedRows<T>(rows: readonly T[], pageSize = DASH_TABLE_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const current = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize],
  );

  return { page: current, pageCount, pageRows, setPage, pageSize, total: rows.length };
}
