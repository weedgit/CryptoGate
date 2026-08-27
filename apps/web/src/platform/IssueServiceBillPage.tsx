import { Navigate } from "react-router-dom";

/** Deep link opens the issue modal on the service bills list. */
export function IssueServiceBillPage() {
  return (
    <Navigate to="/platform/service-bills?issue=1" replace />
  );
}
