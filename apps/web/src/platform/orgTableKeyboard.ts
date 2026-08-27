import type { KeyboardEvent, RefObject } from "react";

type OrgTableKeyboardOptions = {
  filteredIds: readonly string[];
  selectedId: string | undefined;
  page: number;
  pageSize: number;
  pageCount: number;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
  tableRef: RefObject<HTMLElement | null>;
};

export function scrollOrgTableRow(
  tableRef: RefObject<HTMLElement | null>,
  orgId: string,
) {
  requestAnimationFrame(() => {
    const el = tableRef.current?.querySelector(
      `[data-org-id="${CSS.escape(orgId)}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest" });
    }
  });
}

export function handleOrgTableKeyDown(
  e: KeyboardEvent<HTMLElement>,
  opts: OrgTableKeyboardOptions,
): boolean {
  const {
    filteredIds,
    selectedId,
    page,
    pageSize,
    pageCount,
    onSelect,
    onPageChange,
    tableRef,
  } = opts;

  if (filteredIds.length === 0) return false;

  const moveToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(filteredIds.length - 1, index));
    const id = filteredIds[clamped];
    if (!id) return;
    const newPage = Math.floor(clamped / pageSize) + 1;
    if (newPage !== page) onPageChange(newPage);
    onSelect(id);
    scrollOrgTableRow(tableRef, id);
  };

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const idx = selectedId ? filteredIds.indexOf(selectedId) : -1;
    moveToIndex(idx + 1);
    return true;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    const idx = selectedId ? filteredIds.indexOf(selectedId) : filteredIds.length;
    moveToIndex(idx - 1);
    return true;
  }

  if (e.key === "ArrowRight" && page < pageCount) {
    e.preventDefault();
    const newPage = page + 1;
    onPageChange(newPage);
    const index = (newPage - 1) * pageSize;
    const id = filteredIds[index];
    if (id) {
      onSelect(id);
      scrollOrgTableRow(tableRef, id);
    }
    return true;
  }

  if (e.key === "ArrowLeft" && page > 1) {
    e.preventDefault();
    const newPage = page - 1;
    onPageChange(newPage);
    const index = (newPage - 1) * pageSize;
    const id = filteredIds[index];
    if (id) {
      onSelect(id);
      scrollOrgTableRow(tableRef, id);
    }
    return true;
  }

  if (e.key === "Home") {
    e.preventDefault();
    moveToIndex(0);
    return true;
  }

  if (e.key === "End") {
    e.preventDefault();
    moveToIndex(filteredIds.length - 1);
    return true;
  }

  if (e.key === "Enter" || e.key === " ") {
    if (!selectedId) {
      e.preventDefault();
      moveToIndex(0);
      return true;
    }
  }

  return false;
}
