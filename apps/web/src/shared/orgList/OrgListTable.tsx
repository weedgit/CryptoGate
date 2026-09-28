import type { MutableRefObject, ReactNode } from "react";
import { OrgListPagination } from "../../platform/OrgListPagination";
import { handleOrgTableKeyDown } from "../../platform/orgTableKeyboard";
import { serviceBillStatusLabel } from "../../platform/serviceBillStatus";
import { SplitPaneIcon } from "./OrgListEmptyPanel";
import type { MerchantBillStatus } from "./orgListState";

type TableProps = {
  tableRef: MutableRefObject<HTMLDivElement | null>;
  ariaLabel: string;
  filteredIds: string[];
  selectedId: string | undefined;
  page: number;
  pageCount: number;
  pageSize: number;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
  /** `<colgroup>`, `<thead>` and `<tbody>`. */
  children: ReactNode;
};

/** Keyboard-navigable org grid with pagination under it. */
export function OrgListTable({
  tableRef,
  ariaLabel,
  filteredIds,
  selectedId,
  page,
  pageCount,
  pageSize,
  onSelect,
  onPageChange,
  children,
}: TableProps) {
  return (
    <div className="org-agents__table-panel">
      <div
        ref={tableRef}
        className="org-agents__table-wrap"
        tabIndex={0}
        role="grid"
        aria-label={ariaLabel}
        aria-activedescendant={selectedId ? `org-row-${selectedId}` : undefined}
        onKeyDown={(e) => {
          handleOrgTableKeyDown(e, {
            filteredIds,
            selectedId,
            page,
            pageSize,
            pageCount,
            onSelect,
            onPageChange,
            tableRef,
          });
        }}
      >
        <table className="org-agents__table org-agents__table--compact">{children}</table>
      </div>
      <OrgListPagination
        page={page}
        pageCount={pageCount}
        total={filteredIds.length}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </div>
  );
}

/** Selectable row; renders the index cell before `children`. */
export function OrgListRow({
  id,
  index,
  rowNum,
  isSelected,
  onSelect,
  children,
}: {
  id: string;
  index: number;
  rowNum: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <tr
      id={`org-row-${id}`}
      data-org-id={id}
      style={{ animationDelay: `${Math.min(index, 40) * 40}ms` }}
      className={`org-agents__row${isSelected ? " is-selected" : ""}`}
      onClick={() => onSelect(id)}
      aria-selected={isSelected}
    >
      <td className="org-agents__idx">{rowNum}</td>
      {children}
    </tr>
  );
}

export function OrgStatusCell({ status }: { status: string | null | undefined }) {
  const paused = (status ?? "active") === "paused";
  return (
    <td className="org-agents__td-status">
      <span className={`org-agents__status${paused ? " is-paused" : " is-active"}`}>
        {paused ? "Paused" : "Active"}
      </span>
    </td>
  );
}

export function MerchantBillCell({ status }: { status: MerchantBillStatus | null }) {
  return (
    <td className="org-agents__td-bill">
      {status ? (
        <span
          className={`org-agents__bill is-${status}${
            status === "overdue" || status === "activation" ? " is-pulse" : ""
          }`}
          title={status === "activation" ? "Open activation invoice" : "Open / latest service bill"}
        >
          {status === "activation" ? "Activation" : serviceBillStatusLabel(status)}
        </span>
      ) : (
        <span className="muted" title="No service bill issued yet">
          —
        </span>
      )}
    </td>
  );
}

/** Right-pane placeholder shown when no row is selected. */
export function OrgSplitEmpty({
  label,
  title,
  copy,
  hints,
}: {
  label: string;
  title: string;
  copy: string;
  hints: string[];
}) {
  return (
    <div className="org-split__empty b3-empty" aria-label={label}>
      <div className="b3-empty__mark" aria-hidden>
        <SplitPaneIcon />
      </div>
      <p className="b3-empty__title">{title}</p>
      <p className="b3-empty__copy">{copy}</p>
      <ul className="b3-empty__hints">
        {hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ul>
    </div>
  );
}
