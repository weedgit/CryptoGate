import { createContext, useContext } from "react";
import type { OrgAccount } from "./api";

/**
 * Non-platform scope for the Platform dashboard (Agent portal).
 * Absent (null) on Platform — the page keeps its original sources and cards.
 */
export type DashboardPortal = {
  kind: "agent";
  route: (path?: string) => string;
  eyebrow: string;
  /** Hero title comes from this org's name once orgs load; `title` is the fallback. */
  titleOrgId: string | null;
  title: string;
  readOnly: boolean;
  overviewStorageKey: string;
  /** Server aggregates are narrowed to this org's subtree. */
  scopeOrgId: string | null;
  peekOrgs: () => OrgAccount[] | null;
  getOrgs: (opts?: { force?: boolean }) => Promise<OrgAccount[]>;
  getCommissionPercent: () => Promise<string | null>;
};

export const DashboardPortalContext = createContext<DashboardPortal | null>(null);

export function useDashboardPortal(): DashboardPortal | null {
  return useContext(DashboardPortalContext);
}
