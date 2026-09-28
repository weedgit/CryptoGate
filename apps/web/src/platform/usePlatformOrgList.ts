import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getPlatformOrgs,
  peekPlatformOrgs,
  PLATFORM_ORGS_UPDATED_EVENT,
  type OrgAccount,
} from "./api";
import {
  getServiceBillOrgStatus,
  peekServiceBillOrgStatus,
  type ServiceBillOrgStatus,
} from "../shared/serviceBillsServer";
import { orgListErrorText } from "../shared/orgList/orgListState";

type Options = {
  /** Route segment of the list, e.g. "merchants"; `<segment>/new` is onboarding. */
  segment: string;
  failMessage: string;
  setError: (text: string | null) => void;
  showErr: (text: string) => void;
};

/** Platform org cache + service-bill status for the Agents / Merchants lists. */
export function usePlatformOrgList({ segment, failMessage, setError, showErr }: Options) {
  const location = useLocation();
  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekPlatformOrgs() ?? []);
  const [billStatus, setBillStatus] = useState<Map<string, ServiceBillOrgStatus>>(
    () => peekServiceBillOrgStatus() ?? new Map(),
  );
  const [loading, setLoading] = useState(() => peekPlatformOrgs() == null);
  const prevPathRef = useRef(location.pathname);

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const hasCachedOrgs = peekPlatformOrgs() != null;
      // Paint rows as soon as orgs are ready; bill status only feeds a column.
      if (!opts?.silent && !hasCachedOrgs) setLoading(true);
      setError(null);
      try {
        const orgRows = await getPlatformOrgs({ force: opts?.force });
        setOrgs(orgRows);
        if (!opts?.silent) setLoading(false);
        const statusRows = await getServiceBillOrgStatus().catch(() => null);
        if (statusRows) setBillStatus(statusRows);
      } catch (err) {
        showErr(orgListErrorText(err, failMessage));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [failMessage, setError, showErr],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOrgsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<OrgAccount[]>).detail;
      if (Array.isArray(detail)) {
        setOrgs(detail);
        return;
      }
      void load({ silent: true });
    };
    window.addEventListener(PLATFORM_ORGS_UPDATED_EVENT, onOrgsUpdated);
    return () => {
      window.removeEventListener(PLATFORM_ORGS_UPDATED_EVENT, onOrgsUpdated);
    };
  }, [load]);

  useEffect(() => {
    const prev = prevPathRef.current;
    // Mount load is handled by the dedicated effect — only re-fetch on path change.
    if (prev === location.pathname) return;
    prevPathRef.current = location.pathname;
    const onboardSuffix = `/${segment}/new`;
    if (location.pathname.endsWith(onboardSuffix)) return;
    const leftOnboard = prev.endsWith(onboardSuffix);
    void load({
      silent: !leftOnboard && peekPlatformOrgs() != null,
      force: leftOnboard,
    });
  }, [location.pathname, load, segment]);

  return { orgs, setOrgs, billStatus, loading, load };
}
