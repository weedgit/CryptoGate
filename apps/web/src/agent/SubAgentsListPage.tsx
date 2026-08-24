import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, listOrgs, type OrgAccount } from "./api";
import { orgTypeLabel } from "./org";

export function SubAgentsListPage() {
  const [items, setItems] = useState<OrgAccount[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await listOrgs();
      setItems(orgs.filter((o) => o.type === "agent_sub"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load sub-agents");
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
        <h2>Sub-agent accounts</h2>
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
        <p style={{ color: "var(--muted)" }}>No sub-agent accounts in subtree.</p>
      ) : null}
      {!loading && filtered.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Parent</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{orgTypeLabel(row.type)}</td>
                <td className="mono">{row.parentId ?? "—"}</td>
                <td className="mono">{row.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p style={{ color: "var(--muted)", marginTop: 16 }}>
        Onboard sub-agent wizard (C4) is a planned follow-up.
      </p>
    </div>
  );
}
