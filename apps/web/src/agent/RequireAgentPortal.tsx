import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { PortalAccessGate } from "../auth/PortalAccessGate";
import type { Session } from "./api";
import { sessionIsAgentStaff } from "./org";
import { agentRoute, portalHref } from "../shared/portalRouting";

type Props = {
  session: Session;
  children: ReactNode;
  onSignOut?: () => void;
};

export function RequireAgentPortal({ session, children, onSignOut }: Props) {
  if (!sessionIsAgentStaff(session)) {
    return (
      <PortalAccessGate
        title="Agent access required"
        description="This browser already has a signed-in session on the agent portal host, but the account is not an agent staff membership. Each portal subdomain keeps its own login — sign out here, then sign in with an agent account."
        roles={["Agent Owner", "Agent Administrator", "Agent Viewer"]}
        links={[
          {
            href: portalHref("merchant"),
            label: "Open merchant portal",
            primary: true,
          },
          { href: portalHref("platform"), label: "Open platform portal" },
        ]}
        onSignOut={onSignOut}
      />
    );
  }
  return <>{children}</>;
}

export function RequireAgentOperator({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const allowed = session.memberships.some(
    (m) =>
      (m.orgType === "agent" || m.orgType === "agent_sub") &&
      (m.role === "owner" || m.role === "administrator"),
  );
  if (!allowed) {
    return <Navigate to={agentRoute()} replace />;
  }
  return <>{children}</>;
}
