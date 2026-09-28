import { startTransition, useEffect, useMemo, useState } from "react";
import { ApiError } from "../apiCore";
import { looksLikeEmailQuery } from "../registeredEmails";
import type { SortDir } from "../../platform/ui/TableArrange";

export type OrgStatusFilter = "all" | "active" | "paused";

export const ORG_STATUS_PILLS: { id: OrgStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

/** Open / latest service-bill status shown on merchant lists. */
export type MerchantBillStatus = "overdue" | "activation" | "issued" | "paid";

const BILL_SORT_RANK: Record<MerchantBillStatus, number> = {
  overdue: 0,
  activation: 1,
  issued: 2,
  paid: 3,
};

export function billSortRank(status: MerchantBillStatus | null): number {
  if (!status) return 4;
  return BILL_SORT_RANK[status];
}

export function orgListErrorText(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  return err.code === "rate_limited"
    ? "Too many requests — wait a moment and retry."
    : err.message;
}

export type OrgListSortState<K extends string> = { key: K; dir: SortDir };

export function useOrgListSort<K extends string>(
  initialKey: K,
  opts?: { transition?: boolean },
) {
  const [sort, setSort] = useState<OrgListSortState<K>>({ key: initialKey, dir: "asc" });
  const transition = opts?.transition !== false;
  const onSort = (key: K) => {
    const apply = () =>
      setSort((prev) => {
        if (prev.key !== key) return { key, dir: "asc" };
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      });
    if (transition) startTransition(apply);
    else apply();
  };
  return { sort, onSort };
}

/**
 * Page state for a filtered org list: resets to page 1 when `resetKey`
 * changes, clamps to the last page, and jumps to the page holding the
 * selected row.
 */
export function useOrgListPaging<T extends { id: string }>({
  rows,
  pageSize,
  selectedId,
  resetKey,
}: {
  rows: T[];
  pageSize: number;
  selectedId: string | undefined;
  resetKey: unknown;
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  useEffect(() => {
    if (!selectedId) return;
    const index = rows.findIndex((row) => row.id === selectedId);
    if (index === -1) return;
    const targetPage = Math.floor(index / pageSize) + 1;
    setPage((current) => (current === targetPage ? current : targetPage));
  }, [selectedId, rows, pageSize]);

  const filteredIds = useMemo(() => rows.map((row) => row.id), [rows]);

  return { page, setPage, pageCount, paged, filteredIds };
}

export type OrgListEmptyVariant =
  | "loading"
  | "searching"
  | "none"
  | "no-results"
  | "no-filter"
  | "error";

export function orgListEmptyVariant({
  loading,
  emailIndexLoading,
  filteredCount,
  totalCount,
  error,
  query,
  statusFilter,
}: {
  loading: boolean;
  emailIndexLoading: boolean;
  filteredCount: number;
  totalCount: number;
  error: string | null;
  query: string;
  statusFilter: OrgStatusFilter;
}): OrgListEmptyVariant | null {
  if (loading) return "loading";
  if (
    looksLikeEmailQuery(query) &&
    emailIndexLoading &&
    filteredCount === 0 &&
    totalCount > 0
  ) {
    return "searching";
  }
  if (filteredCount > 0) return null;
  if (error && totalCount === 0) return "error";
  if (totalCount === 0) return "none";
  if (query.trim()) return "no-results";
  if (statusFilter !== "all") return "no-filter";
  return null;
}
