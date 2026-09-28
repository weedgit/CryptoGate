import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { sessionLiveActionsUnlocked } from "../auth/contactVerification";
import { looksLikeEmailQuery } from "../shared/registeredEmails";
import type { OnboardNavigateState } from "../shared/onboardInviteState";
import { useAutoSelectOrgListRow } from "../shared/useAutoSelectOrgListRow";
import {
  getServiceBillOrgStatus,
  peekServiceBillOrgStatus,
  type ServiceBillOrgStatus,
} from "../shared/serviceBillsServer";
import { tierLabel } from "../commercialLabels";
import { FundAmount } from "../platform/FundAmount";
import { merchantsInAgentSubtree } from "./agentSubtree";
import { scrollOrgSplitPaneIntoView } from "../shared/scrollOrgSplitPane";
import {
  AGENT_ORGS_UPDATED_EVENT,
  getAgentOrgs,
  invalidateAgentOrgList,
  peekAgentOrgs,
  refreshAgentOrgList,
  removeAgentOrgFromList,
} from "./agentOrgList";
import {
  getOrderSummary,
  listMerchantCommercialSummaries,
  listOrgMemberEmails,
  type MerchantCommercialSettings,
  type OrgAccount,
  type Session,
} from "./api";
import { MerchantDetailCard } from "./MerchantDetailCard";
import {
  primaryAgentOrgId,
  sessionCanManageDirectChild,
  sessionCanOnboardMerchant,
} from "./org";
import { useOrgDeleteModal } from "../shared/orgList/useOrgDeleteModal";
import { SortHeaderCell } from "../platform/ui/TableArrange";
import { useOrgListToast } from "../shared/orgList/useOrgListToast";
import { useStickyTopOffset } from "../shared/orgList/useOrgListLayout";
import { useOrgEmailIndex } from "../shared/orgList/useOrgEmailIndex";
import { useOrgStatusActions } from "../shared/orgList/useOrgStatusActions";
import {
  billSortRank,
  orgListEmptyVariant,
  orgListErrorText,
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

type SortKey = "name" | "tier" | "fee" | "volume" | "bill" | "status";

const PAGE_SIZE = 15;

const EMPTY_COPY: Omit<OrgListEmptyCopy, "onboard"> = {
  noun: "merchants",
  singular: "merchant",
  loadingCopy: "Fetching merchant accounts in your subtree.",
  searchingCopy: "Looking up team contact emails across merchant orgs.",
  noneCopy: "Add a merchant to start collecting under your channel.",
};

/** Agent merchants — platform split list + side detail card. */
export function MerchantsListPage({ session }: Props) {
  const { id: selectedId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const onboardState = (location.state ?? {}) as OnboardNavigateState;
  const [searchParams] = useSearchParams();
  const detailTab = searchParams.get("tab") ?? undefined;
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canOnboard = useMemo(
    () =>
      sessionCanOnboardMerchant(session) &&
      sessionLiveActionsUnlocked(session),
    [session],
  );

  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekAgentOrgs() ?? []);
  const [billStatus, setBillStatus] = useState<Map<string, ServiceBillOrgStatus>>(
    () => peekServiceBillOrgStatus() ?? new Map(),
  );
  const [volumeByOrg, setVolumeByOrg] = useState<
    { orgId: string; volume: string }[]
  >([]);
  const [commercialById, setCommercialById] = useState<
    Map<string, MerchantCommercialSettings>
  >(() => new Map());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>("all");
  const { sort, onSort } = useOrgListSort<SortKey>("name");
  const [loading, setLoading] = useState(() => peekAgentOrgs() == null);
  const toast = useOrgListToast();
  const { error, setError, showOk, showErr, dismissToast } = toast;

  const pageRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const prevPathRef = useRef(location.pathname);
  useStickyTopOffset(pageRef, ".agent-shell", loading);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const hasCachedOrgs = !opts?.force && peekAgentOrgs() != null;
    if (!hasCachedOrgs) setLoading(true);
    setError(null);
    try {
      const [orgRows, statusRows, summary] = await Promise.all([
        getAgentOrgs(opts),
        getServiceBillOrgStatus().catch(() => null),
        getOrderSummary(
          new Date(Date.now() - 90 * 86400000).toISOString(),
          new Date().toISOString(),
        ).catch(() => null),
      ]);
      setOrgs(orgRows);
      if (statusRows) setBillStatus(statusRows);
      setVolumeByOrg(summary?.volumeByOrg ?? []);
    } catch (err) {
      setError(orgListErrorText(err, "Failed to load merchants"));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOrgsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<OrgAccount[]>).detail;
      if (Array.isArray(detail)) {
        setOrgs(detail);
        return;
      }
      void load({ force: true });
    };
    window.addEventListener(AGENT_ORGS_UPDATED_EVENT, onOrgsUpdated);
    return () => {
      window.removeEventListener(AGENT_ORGS_UPDATED_EVENT, onOrgsUpdated);
    };
  }, [load]);

  useEffect(() => {
    const prev = prevPathRef.current;
    if (prev === location.pathname) return;
    prevPathRef.current = location.pathname;
    if (location.pathname.endsWith("/merchants/new")) return;
    const leftOnboard = prev.endsWith("/merchants/new");
    void load({
      force: leftOnboard,
    });
  }, [location.pathname, load]);

  const merchants = useMemo(() => {
    if (!agentId) return [];
    return merchantsInAgentSubtree(agentId, orgs).filter(
      (o) => o.type === "merchant",
    );
  }, [agentId, orgs]);

  const { orgEmailsByOrgId, emailIndexLoading } = useOrgEmailIndex(
    query,
    merchants,
    listOrgMemberEmails,
  );

  useEffect(() => {
    let cancelled = false;
    if (merchants.length === 0) {
      setCommercialById(new Map());
      return;
    }
    void listMerchantCommercialSummaries(merchants.map((m) => m.id))
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, MerchantCommercialSettings>();
        for (const row of rows) map.set(row.orgId, row);
        setCommercialById(map);
      })
      .catch(() => {
        if (!cancelled) setCommercialById(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [merchants]);

  const volumeByMerchantId = useMemo(() => {
    const byIdLocal = new Map(orgs.map((o) => [o.id, o]));
    const map = new Map<string, number>();
    for (const row of volumeByOrg) {
      let merchantId = row.orgId;
      const org = byIdLocal.get(row.orgId);
      if (org?.type === "merchant_site" && org.parentId) {
        merchantId = org.parentId;
      }
      const n = Number(row.volume);
      if (!Number.isFinite(n)) continue;
      map.set(merchantId, (map.get(merchantId) ?? 0) + n);
    }
    return map;
  }, [volumeByOrg, orgs]);

  const billStatusByMerchantId = useMemo(() => {
    const map = new Map<string, MerchantBillStatus | null>();
    for (const m of merchants) {
      map.set(m.id, billStatus.get(m.id)?.billStatus ?? null);
    }
    return map;
  }, [billStatus, merchants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const emailMode = looksLikeEmailQuery(query);
    let rows = merchants;
    if (statusFilter !== "all") {
      rows = rows.filter((o) => (o.status ?? "active") === statusFilter);
    }
    if (q) {
      rows = rows.filter((o) => {
        if (o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) {
          return true;
        }
        if (!emailMode) return false;
        const emails = orgEmailsByOrgId.get(o.id) ?? [];
        return emails.some((e) => e.toLowerCase().includes(q));
      });
    }

    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      if (sort.key === "name") {
        return a.name.localeCompare(b.name) * dir;
      }
      if (sort.key === "tier") {
        const at = commercialById.get(a.id)?.tier ?? "";
        const bt = commercialById.get(b.id)?.tier ?? "";
        return at.localeCompare(bt) * dir;
      }
      if (sort.key === "fee") {
        const af = Number(commercialById.get(a.id)?.volumeFeePercent ?? NaN);
        const bf = Number(commercialById.get(b.id)?.volumeFeePercent ?? NaN);
        const an = Number.isFinite(af) ? af : -1;
        const bn = Number.isFinite(bf) ? bf : -1;
        return (an - bn) * dir;
      }
      if (sort.key === "volume") {
        return (
          ((volumeByMerchantId.get(a.id) ?? 0) -
            (volumeByMerchantId.get(b.id) ?? 0)) *
          dir
        );
      }
      if (sort.key === "bill") {
        return (
          (billSortRank(billStatusByMerchantId.get(a.id) ?? null) -
            billSortRank(billStatusByMerchantId.get(b.id) ?? null)) *
          dir
        );
      }
      const as = a.status ?? "active";
      const bs = b.status ?? "active";
      return as.localeCompare(bs) * dir;
    });
  }, [
    merchants,
    query,
    statusFilter,
    sort,
    billStatusByMerchantId,
    orgEmailsByOrgId,
    commercialById,
    volumeByMerchantId,
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
    basePath: agentRoute("merchants"),
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
    navigate(agentRoute(`merchants/${id}`));
    tableRef.current?.focus({ preventScroll: true });
    scrollOrgSplitPaneIntoView();
  };

  const canManageSelected = useMemo(
    () =>
      selected ? sessionCanManageDirectChild(session, selected, orgs) : false,
    [session, selected, orgs],
  );

  const deletion = useOrgDeleteModal({
    canManage: canManageSelected,
    onDeleted: async (deletedId) => {
      removeAgentOrgFromList(deletedId);
      setOrgs((prev) => prev.filter((o) => o.id !== deletedId));
      if (selectedId === deletedId) {
        navigate(agentRoute("merchants"));
      }
      await refreshAgentOrgList({ excludeOrgIds: [deletedId] });
    },
    showOk,
  });

  const status = useOrgStatusActions({
    canManageRow: (row) => sessionCanManageDirectChild(session, row, orgs),
    setOrgs,
    invalidate: invalidateAgentOrgList,
    showOk,
    showErr,
    clearMessages: () => setError(null),
    pausedVerb: "Paused",
  });

  const listEmptyVariant = orgListEmptyVariant({
    loading,
    emailIndexLoading,
    filteredCount: filtered.length,
    totalCount: merchants.length,
    error,
    query,
    statusFilter,
  });

  const onboardLink = canOnboard
    ? { to: agentRoute("merchants/new"), label: "Onboard merchant" }
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
                <col className="org-agents__col-tier" />
                <col className="org-agents__col-fee" />
                <col className="org-agents__col-volume" />
                <col className="org-agents__col-bill" />
                <col className="org-agents__col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th className="org-agents__th-num">#</th>
                  <SortHeaderCell label="Merchant name" sortKey="name" sort={sort} onSort={onSort} />
                  <SortHeaderCell label="Tier" sortKey="tier" sort={sort} onSort={onSort} />
                  <SortHeaderCell label="Fee %" sortKey="fee" sort={sort} onSort={onSort} />
                  <SortHeaderCell label="Volume" sortKey="volume" sort={sort} onSort={onSort} />
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
                  const commercial = commercialById.get(row.id);
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
                      <td>{commercial ? tierLabel(commercial.tier) : "—"}</td>
                      <td>{commercial ? `${commercial.volumeFeePercent}%` : "—"}</td>
                      <td>
                        <FundAmount amount={volumeByMerchantId.get(row.id) ?? 0} />
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
              canManage={canManageSelected}
              busy={status.busyId === selected.id}
              initialTab={detailTab}
              onPause={() => status.setSuspendTarget(selected)}
              onRun={() => void status.onSetStatus(selected, "active")}
              onDelete={() => deletion.openDelete(selected)}
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
              copy="Select a row to inspect fees and service bills."
              hints={[
                "Click a row to open overview",
                "↑↓ move selection · ←→ change page",
                "Search by name, org ID, or email",
              ]}
            />
          )}
        </div>
      </div>

      <OrgStatusModals
        session={session}
        status={status}
        deletion={deletion}
        requireMfa={false}
      />
    </div>
  );
}
