import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  invalidatePlatformOrgList,
  listPlatformOrgMemberEmails,
  refreshPlatformOrgList,
  removePlatformOrgFromList,
  type OrgAccount,
  type Session,
} from "./api";
import { MerchantDetailCard } from "./MerchantDetailCard";
import { scrollOrgSplitPaneIntoView } from "../shared/scrollOrgSplitPane";
import type { OnboardNavigateState } from "../shared/onboardInviteState";
import { useAutoSelectOrgListRow } from "../shared/useAutoSelectOrgListRow";
import { sessionCanManagePlatform } from "./org";
import { useOrgDeleteModal } from "../shared/orgList/useOrgDeleteModal";
import { platformRoute } from "../shared/portalRouting";
import { SortHeaderCell } from "./ui/TableArrange";
import { usePlatformOrgList } from "./usePlatformOrgList";
import { useOrgListToast } from "../shared/orgList/useOrgListToast";
import { useStickyTopOffset } from "../shared/orgList/useOrgListLayout";
import { useOrgEmailIndex } from "../shared/orgList/useOrgEmailIndex";
import { useOrgStatusActions } from "../shared/orgList/useOrgStatusActions";
import {
  billSortRank,
  orgListEmptyVariant,
  useOrgListPaging,
  useOrgListSort,
  type MerchantBillStatus,
  type OrgStatusFilter,
} from "../shared/orgList/orgListState";
import { OrgListTopbar } from "../shared/orgList/OrgListTopbar";
import { OrgListEmptyPanel, type OrgListEmptyCopy } from "../shared/orgList/OrgListEmptyPanel";
import {
  MerchantBillCell,
  OrgListRow,
  OrgListTable,
  OrgSplitEmpty,
  OrgStatusCell,
} from "../shared/orgList/OrgListTable";
import { OrgStatusModals } from "../shared/orgList/OrgStatusModals";

type Props = { session: Session };

type SortKey = "name" | "parent" | "bill" | "status";

const PAGE_SIZE = 20;

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

const EMPTY_COPY: Omit<OrgListEmptyCopy, "onboard"> = {
  noun: "merchants",
  singular: "merchant",
  loadingCopy: "Fetching merchant accounts from the platform.",
  searchingCopy: "Looking up team contact emails across merchant orgs.",
  noneCopy: "Add a merchant to start accepting crypto payment orders.",
  noneHints: [
    "Merchants receive on-chain payments to their own addresses",
    "Assign matching mode and settlement in the merchant portal",
  ],
  searchHints: [
    "Search by merchant name, org ID, or contact email (use @)",
    "Filter by Active or Paused in the top bar",
  ],
};

const fetchMerchantEmails = () => listPlatformOrgMemberEmails({ types: ["merchant"] });

/** B5 — Merchants list: half-width table + side detail card. */
export function MerchantsListPage({ session }: Props) {
  const { id: selectedId } = useParams<{ id?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const onboardState = (location.state ?? {}) as OnboardNavigateState;
  const detailTab = searchParams.get("tab") ?? undefined;
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>("all");
  const { sort, onSort } = useOrgListSort<SortKey>("name");
  const toast = useOrgListToast();
  const { error, setError, showOk, showErr, dismissToast } = toast;
  const { orgs, setOrgs, billStatus, loading, load } = usePlatformOrgList({
    segment: "merchants",
    failMessage: "Failed to load merchants",
    setError,
    showErr,
  });

  const deletion = useOrgDeleteModal({
    canManage,
    onDeleted: async (deletedId) => {
      removePlatformOrgFromList(deletedId);
      setOrgs((prev) => prev.filter((o) => o.id !== deletedId));
      if (selectedId === deletedId) {
        navigate(platformRoute("merchants"));
      }
      await refreshPlatformOrgList({ excludeOrgIds: [deletedId] });
    },
    showOk,
  });

  const status = useOrgStatusActions({
    canManageRow: () => canManage,
    setOrgs,
    invalidate: invalidatePlatformOrgList,
    showOk,
    showErr,
    clearMessages: dismissToast,
    pausedVerb: "Suspended",
  });
  const [resumeTarget, setResumeTarget] = useState<OrgAccount | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  useStickyTopOffset(pageRef, ".platform-shell", loading);

  const merchants = useMemo(
    () => orgs.filter((o) => o.type === "merchant"),
    [orgs],
  );

  const billStatusByMerchantId = useMemo(() => {
    const map = new Map<string, MerchantBillStatus | null>();
    for (const m of merchants) {
      map.set(m.id, billStatus.get(m.id)?.billStatus ?? null);
    }
    return map;
  }, [billStatus, merchants]);

  const { orgEmailsByOrgId, emailIndexLoading } = useOrgEmailIndex(
    query,
    merchants,
    fetchMerchantEmails,
  );

  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = merchants.filter((o) => {
      const status = o.status ?? "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      if (o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) {
        return true;
      }
      const emails = orgEmailsByOrgId.get(o.id) ?? [];
      return emails.some((email) => email.includes(q));
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "name") {
        return dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "parent") {
        const pa = a.parentId ? (byId.get(a.parentId)?.name ?? a.parentId) : "";
        const pb = b.parentId ? (byId.get(b.parentId)?.name ?? b.parentId) : "";
        const byParent = dir * pa.localeCompare(pb);
        return byParent !== 0 ? byParent : dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "bill") {
        const ba = billSortRank(billStatusByMerchantId.get(a.id) ?? null);
        const bb = billSortRank(billStatusByMerchantId.get(b.id) ?? null);
        if (ba !== bb) return dir * (ba - bb);
        return dir * a.name.localeCompare(b.name);
      }
      const sa = a.status ?? "active";
      const sb = b.status ?? "active";
      const byStatus = dir * sa.localeCompare(sb);
      return byStatus !== 0 ? byStatus : dir * a.name.localeCompare(b.name);
    });
  }, [
    merchants,
    query,
    statusFilter,
    sort,
    byId,
    billStatusByMerchantId,
    orgEmailsByOrgId,
  ]);

  const { page, setPage, pageCount, paged, filteredIds } = useOrgListPaging({
    rows: filtered,
    pageSize: PAGE_SIZE,
    selectedId,
    resetKey: `${query}\u0000${statusFilter}\u0000${sort.key}:${sort.dir}`,
  });

  const merchantIds = useMemo(() => merchants.map((row) => row.id), [merchants]);

  useAutoSelectOrgListRow({
    selectedId,
    loading,
    allIds: merchantIds,
    filteredIds,
    basePath: platformRoute("merchants"),
    navigate,
    emailIndexLoading,
    query,
    preserveSelectionId: onboardState.onboardedOrgId,
  });

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return merchants.find((m) => m.id === selectedId) ?? null;
  }, [merchants, selectedId]);

  const selectMerchant = (id: string) => {
    navigate(platformRoute(`merchants/${id}`));
    tableRef.current?.focus({ preventScroll: true });
    scrollOrgSplitPaneIntoView();
  };

  const listEmptyVariant = orgListEmptyVariant({
    loading,
    emailIndexLoading,
    filteredCount: filtered.length,
    totalCount: merchants.length,
    error,
    query,
    statusFilter,
  });

  const onboardLink = canManage
    ? { to: platformRoute("merchants/new"), label: "Onboard merchant" }
    : null;

  return (
    <div className="org-agents org-agents--split" ref={pageRef}>
      <AuthToast
        message={toast.toastMessage}
        tone={toast.toastTone}
        onDismiss={dismissToast}
      />

      <OrgListTopbar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search by merchant name, ID, or email…"
        searchLabel="Search merchants"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        actionsLabel="Merchant actions"
        cta={onboardLink}
      />

      <div className="org-split">
        <div className="org-split__list">
          {listEmptyVariant ? (
            <OrgListEmptyPanel
              variant={listEmptyVariant}
              copy={{ ...EMPTY_COPY, onboard: onboardLink }}
              query={query.trim()}
              statusFilter={statusFilter}
              onClearSearch={() => setQuery("")}
              onClearFilter={() => setStatusFilter("all")}
              onRetry={() => void load()}
            />
          ) : null}

          {!loading && filtered.length > 0 ? (
            <OrgListTable
              tableRef={tableRef}
              ariaLabel="Merchants"
              filteredIds={filteredIds}
              selectedId={selectedId}
              page={page}
              pageCount={pageCount}
              pageSize={PAGE_SIZE}
              onSelect={selectMerchant}
              onPageChange={setPage}
            >
              <colgroup>
                <col className="org-agents__col-num" />
                <col className="org-agents__col-name" />
                <col className="org-agents__col-parent" />
                <col className="org-agents__col-bill" />
                <col className="org-agents__col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th className="org-agents__th-num">#</th>
                  <SortHeaderCell label="Merchant name" sortKey="name" sort={sort} onSort={onSort} />
                  <SortHeaderCell
                    label="Parent"
                    sortKey="parent"
                    sort={sort}
                    onSort={onSort}
                    className="org-agents__th-parent"
                  />
                  <SortHeaderCell
                    label="Bill"
                    sortKey="bill"
                    sort={sort}
                    onSort={onSort}
                    className="org-agents__th-bill"
                  />
                  <SortHeaderCell
                    label="Status"
                    sortKey="status"
                    sort={sort}
                    onSort={onSort}
                    className="org-agents__th-status"
                    align="end"
                  />
                </tr>
              </thead>
              <tbody>
                {paged.map((row, index) => {
                  const parent = row.parentId ? byId.get(row.parentId) : null;
                  return (
                    <OrgListRow
                      key={row.id}
                      id={row.id}
                      index={index}
                      rowNum={(page - 1) * PAGE_SIZE + index + 1}
                      isSelected={selectedId === row.id}
                      onSelect={selectMerchant}
                    >
                      <td>
                        <span className="org-agents__name">{row.name}</span>
                      </td>
                      <td className="org-agents__td-parent">
                        <span
                          className="org-agents__parent"
                          title={parent?.name ?? row.parentId ?? undefined}
                        >
                          {parent?.name ?? shortId(row.parentId)}
                        </span>
                      </td>
                      <MerchantBillCell status={billStatusByMerchantId.get(row.id) ?? null} />
                      <OrgStatusCell status={row.status} />
                    </OrgListRow>
                  );
                })}
              </tbody>
            </OrgListTable>
          ) : null}
        </div>

        <div className="org-split__pane">
          {selected ? (
            <MerchantDetailCard
              org={selected}
              orgs={orgs}
              session={session}
              canManage={canManage}
              busy={status.busyId === selected.id}
              initialTab={
                detailTab === "overview" ||
                detailTab === "team" ||
                detailTab === "cashiers" ||
                detailTab === "networks"
                  ? detailTab
                  : undefined
              }
              onPause={() => status.setSuspendTarget(selected)}
              onRun={() => setResumeTarget(selected)}
              onDelete={() => deletion.openDelete(selected)}
              onOrgPatched={(next) => {
                setOrgs((prev) =>
                  prev.map((o) => (o.id === next.id ? { ...o, ...next } : o)),
                );
              }}
              inviteCreds={
                onboardState.onboardedOrgId === selected.id
                  ? (onboardState.inviteCreds ?? null)
                  : null
              }
            />
          ) : (
            <OrgSplitEmpty
              label="No merchant selected"
              title="Merchant detail"
              copy="Select a row to inspect fees, settlement, and orders."
              hints={[
                "Click a row to open overview",
                "↑↓ move selection · ←→ change page",
                "Search by name or org ID",
              ]}
            />
          )}
        </div>
      </div>

      <OrgStatusModals
        session={session}
        status={status}
        deletion={deletion}
        resumeTarget={resumeTarget}
        onCloseResume={() => setResumeTarget(null)}
      />
    </div>
  );
}
