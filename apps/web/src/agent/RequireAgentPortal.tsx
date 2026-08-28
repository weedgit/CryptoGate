import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { PortalAccessGate } from "../auth/PortalAccessGate";
import type { Session } from "./api";
import { sessionIsAgentStaff } from "./org";

type Props = {
  session: Session;
  children: ReactNode;
};

export function RequireAgentPortal({ session, children }: Props) {
  if (!sessionIsAgentStaff(session)) {
    return (
      <PortalAccessGate
        title="Agent access required"
        description="Your account is signed in, but it is not an agent staff membership. Agents do not create payment orders — use the merchant portal for checkout."
        roles={["Agent Owner", "Agent Administrator", "Agent Viewer"]}
        links={[
          { to: "/merchant", label: "Open merchant portal", primary: true },
          { to: "/platform", label: "Open platform portal" },
        ]}
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
    return <Navigate to="/agent" replace />;
  }
  return <>{children}</>;
}
