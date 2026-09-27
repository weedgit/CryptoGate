import { CommissionInvoiceDetailPage as PlatformCommissionInvoiceDetailPage } from "../platform/CommissionInvoiceDetailPage";
import { CommissionsPortalContext } from "../platform/commissionsPortal";
import type { Session } from "./api";
import { useAgentCommissionsPortal } from "./useAgentCommissionsPortal";

type Props = { session: Session };

/** Agent commission invoice — Platform invoice view; payee confirms receipt when paid. */
export function CommissionInvoiceDetailPage({ session }: Props) {
  const portal = useAgentCommissionsPortal(session);
  return (
    <CommissionsPortalContext.Provider value={portal}>
      <PlatformCommissionInvoiceDetailPage session={session} />
    </CommissionsPortalContext.Provider>
  );
}
