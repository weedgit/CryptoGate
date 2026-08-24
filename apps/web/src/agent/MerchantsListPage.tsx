import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, listOrgs, type OrgAccount, type Session } from "./api";
import { orgTypeLabel, sessionCanOnboardMerchant } from "./org";

type Props = { session: Session };

export function MerchantsListPage({ session }: Props) {
  const canOnboard = useMemo(() => sessionCanOnboardMerchant(session), [session]);
  const [items, setItems] = useState<OrgAccount[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await listOrgs();
      setItems(
        orgs.filter((o) => o.type === "merchant" || o.type === "merchant_site"),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load merchants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Merchants (subtree)</h2>
        <div className="action-row">
          <input
            className="field-control"
            placeholder="Search name or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {canOnboard ? (
            <Link className="btn-primary" to="/agent/merchants/new">
              Onboard merchant
            </Link>
          ) : null}
        </div>
      </div>
      {loading ? <p style={{ color: "var(--muted)" }}>Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && filtered.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No merchants in your subtree yet.</p>
      ) : null}
      {!loading && filtered.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Structure</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/agent/merchants/${row.id}`}>{row.name}</Link>
                </td>
                <td>{orgTypeLabel(row.type)}</td>
                <td>{row.structure?.replace("_", " ") ?? "—"}</td>
                <td className="mono">{row.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
