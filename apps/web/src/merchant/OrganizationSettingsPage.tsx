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

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-field">
      <span className="settings-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

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
    <div className="settings-page">
      <div className="settings-header">
        <p className="muted" style={{ margin: 0 }}>
          Organization profile and structure. Billing and notifications are separate
          settings pages.
        </p>
        <div className="settings-links">
          <Link className="btn-ghost btn-inline" to="/merchant/settings/billing">
            Fee & billing
          </Link>
          <Link className="btn-ghost btn-inline" to="/merchant/settings/notifications">
            Notifications
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <p className="muted">Loading organization…</p>
      ) : org ? (
        <div className="panel settings-panel">
          <h2>{org.name}</h2>
          <FieldRow label="Org ID" value={truncateAddress(org.id, 12, 8)} />
          <FieldRow label="Type" value={orgTypeLabel(org.type)} />
          <FieldRow label="Structure" value={structureLabel(org.structure)} />
          <FieldRow
            label="Parent org"
            value={parent?.name ?? (org.parentId ? truncateAddress(org.parentId, 8, 4) : "—")}
          />
          <FieldRow label="Billing contact" value="Not on org API yet" />
          <FieldRow label="Timezone" value="Not on org API yet" />
          <FieldRow
            label="Receipt defaults"
            value="Address truncation on slips (not on org API yet)"
          />
          {!canEdit ? (
            <p className="muted settings-note">Viewer access — read only.</p>
          ) : (
            <p className="muted settings-note">
              Legal name and structure are read-only here. Billing contact,
              timezone, and receipt defaults unlock when org PATCH lands.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
