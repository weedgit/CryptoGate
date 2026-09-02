import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { handleOrgTableKeyDown } from "../platform/orgTableKeyboard";
import { useAutoSelectOrgListRow } from "../shared/useAutoSelectOrgListRow";
import { AuthToast } from "../auth/AuthToast";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
import { PagePending } from "../platform/ui/PlatformPending";
import {
  ApiError,
  getOrg,
  listOrgMemberEmails,
  type OrgAccount,
  type Session,
} from "./api";
import { getMerchantOrgs, invalidateMerchantOrgList, peekMerchantOrgs } from "./merchantOrgList";
import {
  parentMerchantOrgId,
  sessionCanManageSites,
  structureLabel,
} from "./org";
import { SiteDetailCard } from "./SiteDetailCard";

type Props = { session: Session };

const STATUS_PILLS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
] as const;

type StatusFilter = (typeof STATUS_PILLS)[number]["id"];

function siteContactEmail(
  site: OrgAccount,
  emailByOrg: Map<string, { emails: string[]; ownerEmail?: string | null }>,
): string {
  const row = emailByOrg.get(site.id);
  return (
    row?.ownerEmail?.trim() ||
    row?.emails.find((e) => e.trim())?.trim() ||
    "—"
  );
}

export function SitesListPage({ session }: Props) {
  const navigate = useNavigate();
  const detailMatch = useMatch({
    path: `${merchantRoute("sites")}/:siteId`,
    end: true,
  });
  const selectedId = detailMatch?.params?.siteId;
  const tableRef = useRef<HTMLDivElement>(null);
  const parentId = useMemo(() => parentMerchantOrgId(session), [session]);
  const canManage = useMemo(() => sessionCanManageSites(session), [session]);
  const cachedOrgs = peekMerchantOrgs();
  const initialParent =
    parentId && cachedOrgs
      ? (cachedOrgs.find((o) => o.id === parentId) ?? null)
      : null;
  const initialSites =
    parentId && cachedOrgs
      ? cachedOrgs.filter(
          (o) => o.type === "merchant_site" && o.parentId === parentId,
        )
      : [];
  const [parent, setParent] = useState<OrgAccount | null>(initialParent);
  const [sites, setSites] = useState<OrgAccount[]>(initialSites);
  const [siteEmails, setSiteEmails] = useState<
    Map<string, { emails: string[]; ownerEmail?: string | null }>
  >(() => new Map());
  const [hasLoaded, setHasLoaded] = useState(
    () => cachedOrgs != null && initialParent != null,
  );
  const [loading, setLoading] = useState(
    () => !cachedOrgs && parentId != null,
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);

  const load = useCallback(async () => {
    if (!parentId) {
      setLoading(false);
      return;
    }
    if (!hasLoaded) setLoading(true);
    setError(null);
    try {
      const [merchant, all, emails] = await Promise.all([
        getOrg(parentId),
        getMerchantOrgs(),
        listOrgMemberEmails({ types: ["merchant_site"] }).catch(() => []),
      ]);
      setParent(merchant);
      const nextSites = all.filter(
        (o) => o.type === "merchant_site" && o.parentId === parentId,
      );
      setSites(nextSites);
      const map = new Map<
        string,
        { emails: string[]; ownerEmail?: string | null }
      >();
      for (const item of emails) {
        map.set(item.orgId, {
          emails: item.emails ?? [],
          ownerEmail: item.ownerEmail,
        });
      }
      setSiteEmails(map);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load sites");
      setSites([]);
      setSiteEmails(new Map());
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [parentId]);

  const reloadSites = useCallback(() => {
    invalidateMerchantOrgList();
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("merchant-topbar-center"));
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
  }, []);

  const multiLocation = parent?.structure === "multi_location";
  const siteIds = useMemo(() => sites.map((s) => s.id), [sites]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((site) => {
      const status = site.status ?? "active";
      if (statusFilter === "active" && status === "paused") return false;
      if (statusFilter === "paused" && status !== "paused") return false;
      if (!q) return true;
      const email = siteContactEmail(site, siteEmails).toLowerCase();
      return (
        site.name.toLowerCase().includes(q) ||
        site.id.toLowerCase().includes(q) ||
        email.includes(q)
      );
    });
  }, [sites, query, statusFilter, siteEmails]);
  const filteredIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const selected = useMemo(
    () => (selectedId ? (sites.find((s) => s.id === selectedId) ?? null) : null),
    [sites, selectedId],
  );

  function selectSite(id: string) {
    navigate(merchantRoute(`sites/${id}`));
  }

  useAutoSelectOrgListRow({
    selectedId,
    loading: loading && !hasLoaded,
    allIds: siteIds,
    filteredIds,
    basePath: merchantRoute("sites"),
    navigate,
    query,
  });

  const soloMerchant = !loading && !multiLocation;

  return (
    <div
      className={`org-agents org-agents--split${
        soloMerchant ? " merchant-sites--solo" : ""
      }`}
    >
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {multiLocation && topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap">
              <span className="org-agents__search-icon" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M12.75 12.75 16.5 16.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                className="field-control org-agents__search"
                placeholder="Search by site name, ID, or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search sites"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {multiLocation && topbarActionsSlot
        ? createPortal(
            <div className="org-agents__actions" aria-label="Site actions">
              <div
                className="org-agents__pills"
                role="group"
                aria-label="Status filter"
              >
                {STATUS_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    className={`org-agents__pill${
                      statusFilter === pill.id ? " is-active" : ""
                    }`}
                    aria-pressed={statusFilter === pill.id}
                    onClick={() => setStatusFilter(pill.id)}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              {canManage ? (
                <Link
                  className="btn-primary org-agents__cta"
                  to={merchantRoute("sites/new")}
                >
                  New site
                </Link>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

      {loading && !hasLoaded ? (
        <PagePending />
      ) : !multiLocation ? (
        <div className="merchant-sites__empty-stage">
          <section className="merchant-sites__empty merchant-sites__empty--centered">
            <span className="merchant-sites__empty-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path
                  d="M4 20V10l8-6 8 6v10H4Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 20v-6h6v6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 className="merchant-sites__empty-title">
              Single-location merchant
            </h2>
            <p className="merchant-sites__empty-copy">
              Site accounts are available when your merchant structure is{" "}
              {structureLabel("multi_location")}.
            </p>
            <p className="merchant-sites__empty-copy merchant-sites__empty-copy--sub">
              Structure is read-only on the Team page.
            </p>
            <Link
              className="btn-secondary btn-inline merchant-sites__empty-action"
              to={merchantRoute("settings/team")}
            >
              View team &amp; organization
            </Link>
          </section>
        </div>
      ) : (
        <div className="org-split">
          <div className="org-split__list">
            {sites.length === 0 ? (
              <div className="merchant-sites__empty-stage merchant-sites__empty-stage--inline">
                <section className="merchant-sites__empty merchant-sites__empty--centered">
                  <span className="merchant-sites__empty-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <h2 className="merchant-sites__empty-title">No sites yet</h2>
                  <p className="merchant-sites__empty-copy">
                    Create a merchant (site) account for each location. Sites
                    inherit wallet, matching, fulfillment, and retention from the
                    parent.
                  </p>
                  {canManage ? (
                    <Link
                      className="btn-primary btn-inline merchant-sites__empty-action"
                      to={merchantRoute("sites/new")}
                    >
                      New site
                    </Link>
                  ) : null}
                </section>
              </div>
            ) : filtered.length === 0 ? (
              <div
                className="org-split__empty b3-empty"
                aria-label="No sites match filters"
              >
                <p className="b3-empty__title">No matching sites</p>
                <p className="b3-empty__copy">
                  Try a different search or clear the status filter.
                </p>
                <button
                  type="button"
                  className="btn-secondary btn-inline"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="org-agents__table-panel">
                <div
                  ref={tableRef}
                  className="org-agents__table-wrap"
                  tabIndex={0}
                  role="grid"
                  aria-label="Merchant sites"
                  aria-activedescendant={
                    selectedId ? `site-row-${selectedId}` : undefined
                  }
                  onKeyDown={(e) => {
                    handleOrgTableKeyDown(e, {
                      filteredIds,
                      selectedId,
                      page: 0,
                      pageSize: filteredIds.length || 1,
                      pageCount: 1,
                      onSelect: selectSite,
                      onPageChange: () => {},
                      tableRef,
                    });
                  }}
                >
                  <table className="org-agents__table org-agents__table--compact">
                    <colgroup>
                      <col className="org-agents__col-num" />
                      <col className="org-agents__col-name" />
                      <col />
                      <col />
                      <col className="org-agents__col-status" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="org-agents__th-num">#</th>
                        <th>Site name</th>
                        <th>Email</th>
                        <th>Created</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((site, index) => {
                        const status = site.status ?? "active";
                        const isSelected = selectedId === site.id;
                        return (
                          <tr
                            key={site.id}
                            id={`site-row-${site.id}`}
                            data-org-id={site.id}
                            className={`org-agents__row${
                              isSelected ? " is-selected" : ""
                            }`}
                            onClick={() => selectSite(site.id)}
                            aria-selected={isSelected}
                          >
                            <td className="org-agents__idx">{index + 1}</td>
                            <td>
                              <span className="org-agents__name">{site.name}</span>
                            </td>
                            <td className="org-agents__td-email">
                              {siteContactEmail(site, siteEmails)}
                            </td>
                            <td className="muted">
                              {site.createdAt
                                ? formatOnboardDate(site.createdAt)
                                : "—"}
                            </td>
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
              </div>
            )}
          </div>

          <div className="org-split__pane">
            {selected ? (
              <SiteDetailCard
                session={session}
                site={selected}
                contactEmail={siteContactEmail(selected, siteEmails)}
                onDeleted={reloadSites}
              />
            ) : (
              <div
                className="org-split__empty b3-empty"
                aria-label="No site selected"
              >
                <div className="b3-empty__mark" aria-hidden>
                  <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                    <path
                      d="M8 38V18l16-12 16 12v20H8Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M20 38v-10h8v10"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="b3-empty__title">Site detail</p>
                <p className="b3-empty__copy">
                  Select a site to review overrides, settlement inheritance, and
                  actions.
                </p>
                <ul className="b3-empty__hints">
                  <li>Click a row to open site overview</li>
                  <li>↑↓ move selection</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
