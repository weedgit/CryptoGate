import { PlatformCommissionsPage } from "../platform/PlatformCommissionsPage";
import { CommissionsPortalContext } from "../platform/commissionsPortal";
import type { Session } from "./api";
import { useAgentCommissionsPortal } from "./useAgentCommissionsPortal";

type Props = { session: Session };

/** Agent commissions — Platform invoice list filtered to this agent as payee. */
export function CommissionsPage({ session }: Props) {
  const portal = useAgentCommissionsPortal(session);
  return (
    <CommissionsPortalContext.Provider value={portal}>
      <PlatformCommissionsPage session={session} />
    </CommissionsPortalContext.Provider>
  );
}
