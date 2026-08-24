import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getOrg, type OrgAccount } from "./api";
import { orgTypeLabel, truncateAddress } from "./org";

export function SiteDetailPage() {
  const { id = "" } = useParams();
  const [site, setSite] = useState<OrgAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setSite(await getOrg(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load site");
      setSite(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="muted">Loading site…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!site) return null;

  return (
    <div className="sites-page">
      <div className="orders-toolbar">
        <p className="muted" style={{ margin: 0 }}>
          {orgTypeLabel(site.type)} overview
        </p>
        <Link className="btn-ghost btn-inline" to="/merchant/sites">
          All sites
        </Link>
      </div>

      <div className="panel settings-panel">
        <h2>{site.name}</h2>
        <div className="settings-field">
          <span className="settings-label">Org ID</span>
          <span className="mono">{site.id}</span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Parent</span>
          <span className="mono">
            {site.parentId ? truncateAddress(site.parentId, 8, 6) : "—"}
          </span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Settlement / matching</span>
          <span>Inherit parent (override flow pending)</span>
        </div>
      </div>

      <div className="orders-actions">
        <Link className="btn-primary btn-inline" to={`/merchant/reports`}>
          Site reports
        </Link>
        <Link className="btn-ghost btn-inline" to="/merchant/orders">
          All orders
        </Link>
      </div>
    </div>
  );
}
