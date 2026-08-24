import { PortalLoginPage } from "../auth/PortalLoginPage";

type Props = {
  onSignedIn: () => void;
};

export function LoginPage({ onSignedIn }: Props) {
  return (
    <PortalLoginPage portalLabel="Platform admin sign-in" onSignedIn={onSignedIn} />
  );
}
