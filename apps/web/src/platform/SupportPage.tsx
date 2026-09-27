import type { Session } from "./api";
import { InvoiceListPage } from "../shared/InvoiceListPage";

/** Platform Invoice — payment orders triage + history (ex-Support). */
export function SupportPage({ session }: { session: Session }) {
  return <InvoiceListPage session={session} variant="platform" />;
}

export function InvoicePage({ session }: { session: Session }) {
  return <InvoiceListPage session={session} variant="platform" />;
}
