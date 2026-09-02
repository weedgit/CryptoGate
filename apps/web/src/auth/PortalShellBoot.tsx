import { PlatformPending } from "../platform/ui/PlatformPending";

type Props = {
  title?: string;
  copy?: string;
};

/** Shell-style boot — shared loading chrome (renders before portal CSS). */
export function PortalShellBoot({
  title = "Loading",
  copy,
}: Props) {
  return (
    <div
      className="portal-shell-boot"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <PlatformPending title={title} copy={copy} className="is-boot" />
    </div>
  );
}
