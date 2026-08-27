import { UnauthenticatedPortal } from "../auth/UnauthenticatedPortal";

type Props = {
  onSignedIn: () => void;
};

export function LoginPage({ onSignedIn }: Props) {
  return (
    <UnauthenticatedPortal portalSubtitle="Agent management portal" onSignedIn={onSignedIn} />
  );
}
