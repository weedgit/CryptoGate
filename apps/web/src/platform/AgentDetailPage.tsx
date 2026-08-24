import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, listOrgs, type OrgAccount } from "./api";
import { orgTypeLabel } from "./org";

type LocationState = {
  invitationSent?: boolean;
  displayName?: string;
};

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const [org, setOrg] = useState<OrgAccount | null>(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(state.invitationSent === true);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!id) return;
    listOrgs()
      .then((orgs) => {
        const row = orgs.find((o) => o.id === id) ?? null;
        setOrg(row);
        setParentName(
          row?.parentId
            ? (orgs.find((o) => o.id === row.parentId)?.name ?? row.parentId)
            : null,
        );
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load agent");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading agent…</p>;
  }

  if (error || !org) {
    return (
      <div className="panel">
        <p className="error">{error ?? "Agent not found"}</p>
        <Link to="/platform/agents">Back to agents</Link>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{state.displayName ?? org.name}</h2>
        <Link className="btn-secondary" to="/platform/agents">
          Back
        </Link>
      </div>
      {toast ? (
        <div className="banner banner-ok" style={{ marginBottom: 16 }}>
          Invitation sent to the new Owner.
        </div>
      ) : null}
      <dl className="detail-grid">
        <dt>Org ID</dt>
        <dd className="mono">{org.id}</dd>
        <dt>Type</dt>
        <dd>{orgTypeLabel(org.type)}</dd>
        <dt>API name</dt>
        <dd>{org.name}</dd>
        <dt>Parent</dt>
        <dd>{parentName ?? "—"}</dd>
      </dl>
      <p style={{ color: "var(--muted)", marginTop: 16 }}>
        Full agent detail tabs (B3) — volume, merchants, commission — follow in a later
        platform task.
      </p>
    </div>
  );
}
