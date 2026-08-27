import { SecuritySettingsPage as SharedSecuritySettingsPage } from "../auth/SecuritySettingsPage";
import type { Session } from "./api";

type Props = {
  session: Session;
  onSessionRefresh?: (session: Session) => void;
};

/** Merchant portal security settings (A5 / A10). */
export function SecuritySettingsPage({ session, onSessionRefresh }: Props) {
  return (
    <SharedSecuritySettingsPage
      session={session}
      variant="merchant"
      onSessionRefresh={onSessionRefresh}
    />
  );
}
