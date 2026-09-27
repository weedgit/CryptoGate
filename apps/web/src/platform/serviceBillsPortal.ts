import { createContext, useContext, type ReactNode } from "react";
import type { OrgAccount } from "./api";

export type ServiceBillsPortalCheckout = {
  payTo?: string | null;
  instructions?: string | null;
  qrPayload?: string | null;
};

/**
 * Non-platform scope for the Platform service bill pages (Agent / Merchant portal):
 * no issue / backfill / status updates, no platform-only lookups.
 * Optional fields default to the Agent behaviour when omitted.
 */
export type ServiceBillsPortal = {
  kind: "agent" | "merchant";
  route: (path?: string) => string;
  peekOrgs: () => OrgAccount[] | null;
  getOrgs: () => Promise<OrgAccount[]>;
  /** Intro line under the page title. */
  subtitle?: string;
  searchPlaceholder?: string;
  /** Rendered between the page header and the KPI strip. */
  header?: ReactNode;
  /** Link for the bill's org name; null renders plain text. */
  orgHref?: (orgId: string) => string | null;
  /** Remittance checkout for payers (pay-to, instructions, QR) on the detail page. */
  loadCheckout?: (billId: string) => Promise<ServiceBillsPortalCheckout | null>;
};

export const ServiceBillsPortalContext = createContext<ServiceBillsPortal | null>(
  null,
);

export function useServiceBillsPortal(): ServiceBillsPortal | null {
  return useContext(ServiceBillsPortalContext);
}
