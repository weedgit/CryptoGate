import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, listOrgs, type OrgAccount } from "./api";
import { STRUCTURE_LABELS } from "./merchantSubtree";
import { orgTypeLabel } from "./org";

export function MerchantsListPage() {
  const [items, setItems] = useState<OrgAccount[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await listOrgs();
      setItems(orgs.filter((o) => o.type === "merchant"));
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
        <h2>Merchants (platform-wide)</h2>
        <input
          className="field-control"
          placeholder="Search name or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading ? <p style={{ color: "var(--muted)" }}>Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && filtered.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No merchant accounts visible.</p>
      ) : null}
      {!loading && filtered.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Structure</th>
              <th>Parent</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/platform/merchants/${row.id}`}>{row.name}</Link>
                </td>
                <td>
                  {row.structure
                    ? (STRUCTURE_LABELS[row.structure] ?? row.structure)
                    : "—"}
                </td>
                <td className="mono">{row.parentId ?? "—"}</td>
                <td className="mono">{row.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
