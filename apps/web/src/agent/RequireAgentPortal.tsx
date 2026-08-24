import type { ReactNode } from "react";
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
