import { createContext, useContext } from "react";
import type { OrgAccount } from "./api";

/**
 * Non-platform scope for the Platform service bill pages (Agent portal):
 * read-only — no issue / backfill / status updates, no platform-only lookups.
 */
export type ServiceBillsPortal = {
  kind: "agent";
  route: (path?: string) => string;
  peekOrgs: () => OrgAccount[] | null;
  getOrgs: () => Promise<OrgAccount[]>;
};

export const ServiceBillsPortalContext = createContext<ServiceBillsPortal | null>(
  null,
);

export function useServiceBillsPortal(): ServiceBillsPortal | null {
  return useContext(ServiceBillsPortalContext);
}
