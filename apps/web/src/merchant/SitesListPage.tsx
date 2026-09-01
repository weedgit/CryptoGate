import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { StatusBadge } from "../shared/StatusBadge";
import {
  ApiError,
  getOrg,
  listOrgMemberEmails,
  type OrgAccount,
  type Session,
} from "./api";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import {
  parentMerchantOrgId,
  sessionCanManageSites,
  structureLabel,
  truncateAddress,
} from "./org";

type Props = { session: Session };

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
  }, [parentId, hasLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
  }, []);

  const multiLocation = parent?.structure === "multi_location";
  const activeCount = useMemo(
    () => sites.filter((s) => s.status !== "paused").length,
    [sites],
  );
  const pausedCount = sites.length - activeCount;

  const soloMerchant = !loading && !multiLocation;

  return (
    <div
      className={`sites-page merchant-sites${soloMerchant ? " merchant-sites--solo" : ""}`}
    >
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {canManage && multiLocation && topbarActionsSlot
        ? createPortal(
            <Link
              className="btn-primary btn-inline"
              to={merchantRoute("sites/new")}
            >
              + Add site
            </Link>,
            topbarActionsSlot,
          )
        : null}

      {loading && !hasLoaded ? (
        <PlatformPending
          title="Loading sites"
          copy="Fetching merchant (site) accounts under this parent."
        />
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
        <>
          <div className="merchant-sites__kpis">
            <article className="merchant-sites__kpi merchant-sites__kpi--total">
              <div className="merchant-sites__kpi-top">
                <span className="merchant-sites__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                    <path
                      d="M3.5 16.5V8.5l6.5-4.5 6.5 4.5v8H3.5Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 16.5v-4.5h4v4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="merchant-sites__kpi-label">Total sites</span>
              </div>
              <p className="merchant-sites__kpi-value">{sites.length}</p>
            </article>
            <article className="merchant-sites__kpi merchant-sites__kpi--active">
              <div className="merchant-sites__kpi-top">
                <span className="merchant-sites__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                    <circle
                      cx="10"
                      cy="10"
                      r="6.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M6.8 10.2 9 12.4l4.4-5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="merchant-sites__kpi-label">Active</span>
              </div>
              <p className="merchant-sites__kpi-value">{activeCount}</p>
            </article>
            <article
              className={`merchant-sites__kpi merchant-sites__kpi--paused${
                pausedCount > 0 ? " is-alert" : ""
              }`}
            >
              <div className="merchant-sites__kpi-top">
                <span className="merchant-sites__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                    <circle
                      cx="10"
                      cy="10"
                      r="6.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M8.2 7.5v5M11.8 7.5v5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="merchant-sites__kpi-label">Paused</span>
              </div>
              <p className="merchant-sites__kpi-value">{pausedCount}</p>
            </article>
          </div>

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
                  inherit settlement and matching defaults from the parent unless
                  overridden.
                </p>
                {canManage ? (
                  <Link
                    className="btn-primary btn-inline merchant-sites__empty-action"
                    to={merchantRoute("sites/new")}
                  >
                    Add merchant site
                  </Link>
                ) : null}
              </section>
            </div>
          ) : (
            <section className="merchant-sites__card">
              <header className="merchant-sites__card-head">
                <h2 className="merchant-sites__card-title">
                  Merchant (site) accounts
                </h2>
                <span className="merchant-sites__card-pill">
                  {sites.length} location{sites.length === 1 ? "" : "s"}
                </span>
              </header>
              <div className="merchant-sites__table" role="table">
                <div className="merchant-sites__thead" role="row">
                  <span>Site</span>
                  <span>Email</span>
                  <span>Created</span>
                  <span>Status</span>
                  <span>Org ID</span>
                  <span className="sr-only">Open</span>
                </div>
                {sites.map((site) => {
                  const paused = site.status === "paused";
                  return (
                    <Link
                      key={site.id}
                      className="merchant-sites__row"
                      role="row"
                      to={merchantRoute(`sites/${site.id}`)}
                    >
                      <span className="merchant-sites__name">{site.name}</span>
                      <span className="merchant-sites__email">
                        {siteContactEmail(site, siteEmails)}
                      </span>
                      <span className="merchant-sites__meta">
                        {site.createdAt
                          ? formatOnboardDate(site.createdAt)
                          : "—"}
                      </span>
                      <span>
                        <StatusBadge tone={paused ? "warn" : "ok"}>
                          {paused ? "Paused" : "Active"}
                        </StatusBadge>
                      </span>
                      <span className="mono merchant-sites__meta">
                        {truncateAddress(site.id, 8, 6)}
                      </span>
                      <span className="merchant-sites__go" aria-hidden>
                        View →
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
