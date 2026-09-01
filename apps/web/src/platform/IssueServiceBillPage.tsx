import { Navigate } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";

/** Deep link opens the issue modal on the service bills list. */
export function IssueServiceBillPage() {
  return (
    <Navigate to={`${platformRoute("service-bills")}?issue=1`} replace />
  );
}
