import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, listOrgs, type OrgAccount } from "./api";
import { STRUCTURE_LABELS, type MerchantStructure } from "./onboardMerchant";
import { orgTypeLabel } from "./org";

type LocationState = {
  invitationSent?: boolean;
  enterprisePending?: boolean;
};

export function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const [org, setOrg] = useState<OrgAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastInvite, setToastInvite] = useState(state.invitationSent === true);
  const [toastEnterprise, setToastEnterprise] = useState(
    state.enterprisePending === true,
  );

  useEffect(() => {
    if (!toastInvite && !toastEnterprise) return;
    const t = setTimeout(() => {
      setToastInvite(false);
      setToastEnterprise(false);
    }, 8000);
    return () => clearTimeout(t);
  }, [toastInvite, toastEnterprise]);

  useEffect(() => {
    if (!id) return;
    listOrgs()
      .then((orgs) => setOrg(orgs.find((o) => o.id === id) ?? null))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load merchant");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading merchant…</p>;
  }

  if (error || !org) {
    return (
      <div className="panel">
        <p className="error">{error ?? "Merchant not found"}</p>
        <Link to="/agent/merchants">Back to merchants</Link>
      </div>
    );
  }

  const structure =
    org.structure && org.structure in STRUCTURE_LABELS
      ? STRUCTURE_LABELS[org.structure as MerchantStructure]
      : org.structure ?? "—";

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{org.name}</h2>
        <Link className="btn-secondary" to="/agent/merchants">
          Back
        </Link>
      </div>
      {toastInvite ? (
        <div className="banner banner-ok" style={{ marginBottom: 12 }}>
          Invitation sent to merchant Owner.
        </div>
      ) : null}
      {toastEnterprise ? (
        <div className="banner banner-warn" style={{ marginBottom: 12 }}>
          Enterprise tier selected (stub) — would require platform approval when X-01
          ships.
        </div>
      ) : null}
      <dl className="detail-grid">
        <dt>Org ID</dt>
        <dd className="mono">{org.id}</dd>
        <dt>Type</dt>
        <dd>{orgTypeLabel(org.type)}</dd>
        <dt>Structure</dt>
        <dd>{structure}</dd>
        <dt>Parent</dt>
        <dd className="mono">{org.parentId ?? "—"}</dd>
      </dl>
      <p style={{ color: "var(--muted)", marginTop: 16 }}>
        Agent merchant detail tabs (C7) — volume, service bills — follow in a later
        task. Settlement and credentials remain merchant-managed.
      </p>
    </div>
  );
}
