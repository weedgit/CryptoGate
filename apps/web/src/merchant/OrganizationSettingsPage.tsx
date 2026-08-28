import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, getOrg, type OrgAccount, type Session } from "./api";
import {
  orgTypeLabel,
  primaryMerchantOrgId,
  sessionCanEditOrgSettings,
  structureLabel,
  truncateAddress,
} from "./org";

type Props = { session: Session };

export function OrganizationSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canEdit = useMemo(() => sessionCanEditOrgSettings(session), [session]);
  const [org, setOrg] = useState<OrgAccount | null>(null);
  const [parent, setParent] = useState<OrgAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const account = await getOrg(orgId);
      setOrg(account);
      if (account.parentId) {
        try {
          setParent(await getOrg(account.parentId));
        } catch {
          setParent(null);
        }
      } else {
        setParent(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load organization");
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="plat-settings plat-settings--merchant">
      {error ? <p className="error">{error}</p> : null}

      <div className="plat-settings__grid plat-settings__grid--single">
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Organization profile</h2>
            {!canEdit ? (
              <span className="plat-settings__badge">Viewer · read-only</span>
            ) : null}
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Organization profile and structure. Billing and notifications are separate
              settings pages.
            </p>
            {loading ? (
              <p className="muted">Loading organization…</p>
            ) : org ? (
              <>
                <dl className="plat-settings__dl plat-settings__dl--rows">
                  <div>
                    <dt>Display name</dt>
                    <dd>{org.name}</dd>
                  </div>
                  <div>
                    <dt>Org ID</dt>
                    <dd className="mono">{truncateAddress(org.id, 12, 8)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{orgTypeLabel(org.type)}</dd>
                  </div>
                  <div>
                    <dt>Structure</dt>
                    <dd>{structureLabel(org.structure)}</dd>
                  </div>
                  <div>
                    <dt>Parent org</dt>
                    <dd>
                      {parent?.name ??
                        (org.parentId ? truncateAddress(org.parentId, 8, 4) : "—")}
                    </dd>
                  </div>
                  <div>
                    <dt>Billing contact</dt>
                    <dd>Not on org API yet</dd>
                  </div>
                  <div>
                    <dt>Timezone</dt>
                    <dd>Not on org API yet</dd>
                  </div>
                  <div>
                    <dt>Receipt defaults</dt>
                    <dd>Address truncation on slips (not on org API yet)</dd>
                  </div>
                </dl>
                <p className="plat-settings__card-note">
                  {canEdit
                    ? "Legal name and structure are read-only here. Billing contact, timezone, and receipt defaults unlock when org PATCH lands."
                    : "Viewer access — read only."}
                </p>
              </>
            ) : null}
            <div className="plat-settings__nav-row">
              <Link className="plat-settings__nav-link" to="/merchant/settings/billing">
                Fee & billing
              </Link>
              <Link
                className="plat-settings__nav-link"
                to="/merchant/settings/notifications"
              >
                Notifications
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
