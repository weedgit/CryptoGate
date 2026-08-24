import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "./api";
import { sessionIsAgentStaff } from "./org";

type Props = {
  session: Session;
  children: ReactNode;
};

export function RequireAgentPortal({ session, children }: Props) {
  if (!sessionIsAgentStaff(session)) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Agent access required</h1>
          <p style={{ color: "var(--muted)" }}>
            This portal is for agent Owner, Administrator, or Viewer accounts
            only. Agents do not create payment orders.
          </p>
          <p>
            <a href="/merchant">Go to merchant portal</a>
          </p>
        </div>
      </div>
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
