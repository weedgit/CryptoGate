import { UnauthenticatedPortal } from "../auth/UnauthenticatedPortal";

type Props = {
  onSignedIn: () => void;
  startOnMfa?: boolean;
};

export function LoginPage({ onSignedIn, startOnMfa = false }: Props) {
  return (
    <UnauthenticatedPortal
      portalSubtitle="Platform Administrator"
      onSignedIn={onSignedIn}
      startOnMfa={startOnMfa}
    />
  );
}
