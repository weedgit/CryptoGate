import { useMemo, useRef, useState } from "react";
import type { OrgAccount } from "./api";
import { orgTypeLabel } from "./org";
import { OrgListPagination } from "./OrgListPagination";
import { handleOrgTableKeyDown } from "./orgTableKeyboard";

const PAGE_SIZE = 20;

type Props = {
  mode: "agents" | "merchants";
  orgs: OrgAccount[];
  selectedId: string | null;
  query: string;
  statusFilter: "all" | "active" | "paused";
  onSelect: (id: string) => void;
};

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/** Compact org table for Accounts → Agents / Merchants. */
export function AccountsTablePane({
  mode,
  orgs,
  selectedId,
  query,
  statusFilter,
  onSelect,
}: Props) {
  const [page, setPage] = useState(0);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => {
    const typeOk =
      mode === "agents"
        ? (t: string) => t === "agent" || t === "agent_sub"
        : (t: string) => t === "merchant";
    const q = query.trim().toLowerCase();
    const parentName = (id: string | null) =>
      id ? (orgs.find((o) => o.id === id)?.name ?? "—") : "—";

    return orgs
      .filter((o) => typeOk(o.type))
      .filter((o) => {
        if (statusFilter === "all") return true;
        const st = o.status === "paused" ? "paused" : "active";
        return st === statusFilter;
      })
      .filter((o) => {
        if (!q) return true;
        return (
          o.name.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.legalName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((o) => ({
        ...o,
        parentLabel: parentName(o.parentId),
      }));
  }, [mode, orgs, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const filteredIds = rows.map((r) => r.id);

  if (rows.length === 0) {
    return (
      <div className="org-architecture__empty">
        <p className="org-architecture__empty-title">
          No {mode === "agents" ? "agents" : "merchants"}
        </p>
        <p>
          {query.trim() || statusFilter !== "all"
            ? "Try clearing search or status filters."
            : mode === "agents"
              ? "Onboard an agent to get started."
              : "Onboard a merchant under an agent."}
        </p>
      </div>
    );
  }

  return (
    <div className="org-agents__table-panel accounts-table-pane">
      <div
        ref={tableRef}
        className="org-agents__table-wrap"
        tabIndex={0}
        role="grid"
        aria-label={mode === "agents" ? "Agents" : "Merchants"}
        aria-activedescendant={
          selectedId ? `accounts-row-${selectedId}` : undefined
        }
        onKeyDown={(e) => {
          handleOrgTableKeyDown(e, {
            filteredIds,
            selectedId,
            page: safePage,
            pageSize: PAGE_SIZE,
            pageCount,
            onSelect,
            onPageChange: setPage,
            tableRef,
          });
        }}
      >
        <table className="org-agents__table org-agents__table--compact">
          <thead>
            <tr>
              <th className="org-agents__th-num">#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Parent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const status = row.status === "paused" ? "paused" : "active";
              const selected = selectedId === row.id;
              return (
                <tr
                  key={row.id}
                  id={`accounts-row-${row.id}`}
                  className={selected ? "is-selected" : undefined}
                  aria-selected={selected}
                  onClick={() => onSelect(row.id)}
                >
                  <td className="org-agents__td-num">
                    {safePage * PAGE_SIZE + i + 1}
                  </td>
                  <td>
                    <div className="org-agents__name-cell">
                      <strong>{row.name}</strong>
                      <span className="muted">{shortId(row.id)}</span>
                    </div>
                  </td>
                  <td>{orgTypeLabel(row.type)}</td>
                  <td>{row.parentLabel}</td>
                  <td className="org-agents__td-status">
                    <span
                      className={`org-agents__status${
                        status === "paused" ? " is-paused" : " is-active"
                      }`}
                    >
                      {status === "paused" ? "Paused" : "Active"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <OrgListPagination
        page={safePage}
        pageCount={pageCount}
        total={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
