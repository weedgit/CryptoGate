import { startTransition, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import {
  invalidatePlatformOrgList,
  listPlatformOrgMemberEmails,
  refreshPlatformOrgList,
  removePlatformOrgFromList,
  type OrgAccount,
  type Session,
} from "./api";
import { AgentDetailCard } from "./AgentDetailCard";
import { merchantCountsByAgentId, merchantOrgIdsInAgentSubtree } from "./agentSubtree";
import { scrollOrgSplitPaneIntoView } from "../shared/scrollOrgSplitPane";
import type { OnboardNavigateState } from "../shared/onboardInviteState";
import { useAutoSelectOrgListRow } from "../shared/useAutoSelectOrgListRow";
import { sessionCanManagePlatform } from "./org";
import { useOrgDeleteModal } from "../shared/orgList/useOrgDeleteModal";
import type { AgentPayoutStatus } from "./orgDetailSeeds";
import { agentPayoutFromOrgStatus } from "../shared/serviceBillsServer";
import { SortHeaderCell } from "./ui/TableArrange";
import { usePlatformOrgList } from "./usePlatformOrgList";
import { useOrgListToast } from "../shared/orgList/useOrgListToast";
import { useStickyTopOffset } from "../shared/orgList/useOrgListLayout";
import { useOrgEmailIndex } from "../shared/orgList/useOrgEmailIndex";
import { useOrgStatusActions } from "../shared/orgList/useOrgStatusActions";
import {
  orgListEmptyVariant,
  useOrgListPaging,
  useOrgListSort,
  type OrgStatusFilter,
} from "../shared/orgList/orgListState";
import { OrgListTopbar } from "../shared/orgList/OrgListTopbar";
import { OrgListEmptyPanel, type OrgListEmptyCopy } from "../shared/orgList/OrgListEmptyPanel";
import {
  OrgListRow,
  OrgListTable,
  OrgSplitEmpty,
  OrgStatusCell,
} from "../shared/orgList/OrgListTable";
import { OrgStatusModals } from "../shared/orgList/OrgStatusModals";

type Props = { session: Session };

type SortKey = "name" | "merchants" | "payout" | "status";

const PAGE_SIZE = 20;

const PAYOUT_SORT_RANK: Record<"paid" | "pending" | "scheduled", number> = {
  paid: 0,
  pending: 1,
  scheduled: 2,
};

function payoutSortRank(status: AgentPayoutStatus | null): number {
  if (!status) return 3;
  return PAYOUT_SORT_RANK[status];
}

const EMPTY_COPY: Omit<OrgListEmptyCopy, "onboard"> = {
  noun: "agents",
  singular: "agent",
  loadingCopy: "Fetching agent accounts from the platform.",
  searchingCopy:
    "Looking up team contact emails across agent orgs. Matches appear as they are found.",
  noneCopy: "Add your first agent to start building the merchant network.",
  noneHints: [
    "Agents onboard merchants under their subtree",
    "Commission is settled to the agent payout address",
  ],
  searchHints: [
    "Search by agent name, team email, or org ID",
    "Email lookup may take a few seconds",
  ],
  icon: "split",
};

const fetchAgentEmails = () => listPlatformOrgMemberEmails({ types: ["agent"] });

/** B2 — Agent accounts: half-width table + side detail card. */
export function AgentsListPage({ session }: Props) {
  const { id: selectedId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const inviteState = (location.state ?? {}) as OnboardNavigateState;
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>("all");
  const { sort, onSort } = useOrgListSort<SortKey>("name", { transition: false });
  const toast = useOrgListToast();
  const { error, setError, showOk, showErr, dismissToast } = toast;
  const { orgs, setOrgs, billStatus, loading, load } = usePlatformOrgList({
    segment: "agents",
    failMessage: "Failed to load agents",
    setError,
    showErr,
  });

  const deletion = useOrgDeleteModal({
    canManage,
    onDeleted: async (deletedId) => {
      removePlatformOrgFromList(deletedId);
      setOrgs((prev) => prev.filter((o) => o.id !== deletedId));
      if (selectedId === deletedId) {
        navigate(platformRoute("agents"));
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

  const agents = useMemo(
    () => orgs.filter((o) => o.type === "agent"),
    [orgs],
  );

  const { orgEmailsByOrgId, emailIndexLoading } = useOrgEmailIndex(
    query,
    agents,
    fetchAgentEmails,
  );

  const merchantCountByAgent = useMemo(
    () => merchantCountsByAgentId(orgs),
    [orgs],
  );

  const payoutByAgentId = useMemo(() => {
    const map = new Map<string, AgentPayoutStatus | null>();
    for (const agent of agents) {
      const merchantIds = merchantOrgIdsInAgentSubtree(agent.id, orgs);
      map.set(agent.id, agentPayoutFromOrgStatus(billStatus, merchantIds));
    }
    return map;
  }, [agents, orgs, billStatus]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = agents.filter((o) => {
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
      if (sort.key === "merchants") {
        const ca = merchantCountByAgent.get(a.id) ?? 0;
        const cb = merchantCountByAgent.get(b.id) ?? 0;
        if (ca !== cb) return dir * (ca - cb);
        return dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "payout") {
        const pa = payoutSortRank(payoutByAgentId.get(a.id) ?? null);
        const pb = payoutSortRank(payoutByAgentId.get(b.id) ?? null);
        if (pa !== pb) return dir * (pa - pb);
        return dir * a.name.localeCompare(b.name);
      }
      const sa = a.status ?? "active";
      const sb = b.status ?? "active";
      const byStatus = dir * sa.localeCompare(sb);
      return byStatus !== 0 ? byStatus : dir * a.name.localeCompare(b.name);
    });
  }, [agents, query, statusFilter, sort, merchantCountByAgent, payoutByAgentId, orgEmailsByOrgId]);

  const { page, setPage, pageCount, paged, filteredIds } = useOrgListPaging({
    rows: filtered,
    pageSize: PAGE_SIZE,
    selectedId,
    resetKey: `${query}\u0000${statusFilter}\u0000${sort.key}:${sort.dir}`,
  });

  const agentIds = useMemo(() => agents.map((row) => row.id), [agents]);

  useAutoSelectOrgListRow({
    selectedId,
    loading,
    allIds: agentIds,
    filteredIds,
    basePath: platformRoute("agents"),
    navigate,
    emailIndexLoading,
    query,
    preserveSelectionId: inviteState.onboardedOrgId,
  });

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return agents.find((a) => a.id === selectedId) ?? null;
  }, [agents, selectedId]);

  const selectAgent = (id: string) => {
    startTransition(() => {
      navigate(platformRoute(`agents/${id}`));
    });
    tableRef.current?.focus({ preventScroll: true });
    scrollOrgSplitPaneIntoView();
  };

  const listEmptyVariant = orgListEmptyVariant({
    loading,
    emailIndexLoading,
    filteredCount: filtered.length,
    totalCount: agents.length,
    error,
    query,
    statusFilter,
  });

  const onboardLink = canManage
    ? { to: platformRoute("agents/new"), label: "Onboard agent" }
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
        searchPlaceholder="Search by name, email, or ID…"
        searchLabel="Search agents"
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        actionsLabel="Agent actions"
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
              ariaLabel="Agents"
              filteredIds={filteredIds}
              selectedId={selectedId}
              page={page}
              pageCount={pageCount}
              pageSize={PAGE_SIZE}
              onSelect={selectAgent}
              onPageChange={setPage}
            >
              <colgroup>
                <col className="org-agents__col-num" />
                <col className="org-agents__col-name" />
                <col className="org-agents__col-merchants" />
                <col className="org-agents__col-payout" />
                <col className="org-agents__col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th className="org-agents__th-num">#</th>
                  <SortHeaderCell label="Agent name" sortKey="name" sort={sort} onSort={onSort} />
                  <SortHeaderCell
                    label="Merchants"
                    sortKey="merchants"
                    sort={sort}
                    onSort={onSort}
                    className="org-agents__th-merchants"
                    align="end"
                  />
                  <SortHeaderCell
                    label="Payout"
                    sortKey="payout"
                    sort={sort}
                    onSort={onSort}
                    className="org-agents__th-payout"
                  />
                  <SortHeaderCell
                    label="Status"
                    sortKey="status"
                    sort={sort}
                    onSort={onSort}
                    className="org-agents__th-status"
                  />
                </tr>
              </thead>
              <tbody>
                {paged.map((row, index) => {
                  const payout = payoutByAgentId.get(row.id) ?? null;
                  return (
                    <OrgListRow
                      key={row.id}
                      id={row.id}
                      index={index}
                      rowNum={(page - 1) * PAGE_SIZE + index + 1}
                      isSelected={selectedId === row.id}
                      onSelect={selectAgent}
                    >
                      <td>
                        <span className="org-agents__name">{row.name}</span>
                      </td>
                      <td className="org-agents__num">{merchantCountByAgent.get(row.id) ?? 0}</td>
                      <td className="org-agents__td-payout">
                        {payout ? (
                          <span
                            className={`org-agents__payout is-${payout}`}
                            title="Latest commission statement payout"
                          >
                            {payout === "paid"
                              ? "Paid"
                              : payout === "pending"
                                ? "Pending"
                                : "Scheduled"}
                          </span>
                        ) : (
                          <span className="muted" title="No commission statements yet">
                            —
                          </span>
                        )}
                      </td>
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
            <AgentDetailCard
              org={selected}
              orgs={orgs}
              session={session}
              canManage={canManage}
              busy={status.busyId === selected.id}
              invitationSent={inviteState.invitationSent === true}
              inviteCreds={
                inviteState.onboardedOrgId === selected.id
                  ? (inviteState.inviteCreds ?? null)
                  : null
              }
              onPause={() => status.setSuspendTarget(selected)}
              onRun={() => setResumeTarget(selected)}
              onDelete={() => deletion.openDelete(selected)}
              onOrgPatched={(next) => {
                setOrgs((prev) =>
                  prev.map((o) => (o.id === next.id ? { ...o, ...next } : o)),
                );
              }}
            />
          ) : (
            <OrgSplitEmpty
              label="No agent selected"
              title="Agent detail"
              copy="Select a row to inspect profile, merchants, volume, and activity."
              hints={[
                "Click a row to open overview",
                "↑↓ move selection · ←→ change page",
                "Search by name, email, or org ID",
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
