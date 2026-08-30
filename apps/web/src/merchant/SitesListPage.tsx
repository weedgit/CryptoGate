import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  getOrg,
  listOrgMemberEmails,
  listOrgs,
  type OrgAccount,
  type Session,
} from "./api";
import { AuthToast } from "../auth/AuthToast";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
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
    site.billingEmail?.trim() ||
    "—"
  );
}

export function SitesListPage({ session }: Props) {
  const parentId = useMemo(() => parentMerchantOrgId(session), [session]);
  const canManage = useMemo(() => sessionCanManageSites(session), [session]);
  const [parent, setParent] = useState<OrgAccount | null>(null);
  const [sites, setSites] = useState<OrgAccount[]>([]);
  const [siteEmails, setSiteEmails] = useState<
    Map<string, { emails: string[]; ownerEmail?: string | null }>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!parentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [merchant, all, emails] = await Promise.all([
        getOrg(parentId),
        listOrgs(),
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
    }
  }, [parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const multiLocation = parent?.structure === "multi_location";

  return (
    <div className="sites-page">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      {canManage && multiLocation ? (
        <div className="orders-toolbar">
          <Link className="btn-primary btn-inline" to="/merchant/sites/new">
            + Add site
          </Link>
        </div>
      ) : null}

      {loading ? (
        <p className="muted">Loading sites…</p>
      ) : !multiLocation ? (
        <div className="panel empty-orders">
          <h2>Single-location merchant</h2>
          <p className="muted">
            Site accounts are available when your merchant structure is{" "}
            {structureLabel("multi_location")}. Structure is read-only on the{" "}
            <Link to="/merchant/settings/organization">organization</Link> page.
          </p>
        </div>
      ) : sites.length === 0 ? (
        <div className="panel empty-orders">
          <h2>No sites yet</h2>
          <p className="muted">
            Create a merchant (site) account for each location. Sites inherit
            settlement and matching defaults from the parent unless overridden.
          </p>
          {canManage ? (
            <Link className="btn-primary btn-inline" to="/merchant/sites/new">
              Add merchant site
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="orders-table sites-table" role="table">
          <div className="orders-head" role="row">
            <span>SITE</span>
            <span>EMAIL</span>
            <span>CREATED</span>
            <span>STATUS</span>
            <span>ORG ID</span>
            <span />
          </div>
          {sites.map((site) => (
            <Link
              key={site.id}
              className="orders-row sites-row"
              role="row"
              to={`/merchant/sites/${site.id}`}
            >
              <span className="order-id">{site.name}</span>
              <span className="sites-row__email">
                {siteContactEmail(site, siteEmails)}
              </span>
              <span className="muted">
                {site.createdAt ? formatOnboardDate(site.createdAt) : "—"}
              </span>
              <span className={site.status === "paused" ? "tone-warn" : "muted"}>
                {site.status === "paused" ? "Paused" : "Active"}
              </span>
              <span className="mono muted">{truncateAddress(site.id, 8, 6)}</span>
              <span className="muted">View →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
