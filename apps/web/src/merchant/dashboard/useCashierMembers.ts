import { useEffect, useState } from "react";
import type { OrgMember } from "../api";
import { getOrgUsers, peekOrgUsers } from "../../shared/orgUsersCache";

function peekAll(orgIds: ReadonlyArray<string>): OrgMember[] | null {
  const cached = orgIds.map((id) => peekOrgUsers(id));
  if (cached.some((rows) => rows == null)) return null;
  return cached.flatMap((rows) => rows ?? []);
}

/** Members of the given orgs (cached); orgs the caller may not list are skipped. */
export function useCashierMembers(orgIds: ReadonlyArray<string>): OrgMember[] | null {
  const key = orgIds.join(",");
  const [members, setMembers] = useState<OrgMember[] | null>(() => peekAll(orgIds));

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setMembers(null);
      return;
    }
    setMembers(peekAll(ids));
    let cancelled = false;
    void Promise.all(ids.map((id) => getOrgUsers(id).catch(() => [] as OrgMember[]))).then(
      (lists) => {
        if (!cancelled) setMembers(lists.flat());
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return members;
}
