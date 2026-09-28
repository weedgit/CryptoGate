import { useEffect, useMemo, useRef, useState } from "react";
import { looksLikeEmailQuery, orgEmailsMapFromBulkRows } from "../registeredEmails";

type EmailRows = Parameters<typeof orgEmailsMapFromBulkRows>[0];

/** Loads team contact emails per org once the search box holds an email-like query. */
export function useOrgEmailIndex(
  query: string,
  rows: { id: string }[],
  fetchRows: () => Promise<EmailRows>,
) {
  const [orgEmailsByOrgId, setOrgEmailsByOrgId] = useState<Map<string, string[]>>(
    () => new Map(),
  );
  const [emailIndexLoading, setEmailIndexLoading] = useState(false);
  const fetchRef = useRef(fetchRows);
  fetchRef.current = fetchRows;

  const idsKey = useMemo(() => rows.map((r) => r.id).sort().join("|"), [rows]);
  const count = rows.length;

  useEffect(() => {
    if (!looksLikeEmailQuery(query)) {
      setOrgEmailsByOrgId(new Map());
      setEmailIndexLoading(false);
      return;
    }
    if (count === 0) return;

    let cancelled = false;
    setEmailIndexLoading(true);
    void fetchRef
      .current()
      .then((result) => {
        if (!cancelled) setOrgEmailsByOrgId(orgEmailsMapFromBulkRows(result));
      })
      .catch(() => {
        if (!cancelled) setOrgEmailsByOrgId(new Map());
      })
      .finally(() => {
        if (!cancelled) setEmailIndexLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, count, query]);

  return { orgEmailsByOrgId, emailIndexLoading };
}
