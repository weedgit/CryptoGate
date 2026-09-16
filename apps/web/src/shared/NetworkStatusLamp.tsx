import type { NetworkLamp, NetworkLampCode } from "./networkLamp";

type Props = {
  lamp: NetworkLamp;
  /** Compact = lamp + short label; default for tables/cards. */
  className?: string;
  title?: string;
};

/**
 * Orderability status pill — same visual language as top-bar API/DB/Webhook
 * indicators (dot first, mono pill chrome).
 */
export function NetworkStatusLamp({ lamp, className = "", title }: Props) {
  const code = lamp.code as NetworkLampCode;
  return (
    <span
      className={`network-status-lamp network-status-lamp--${code} ${className}`.trim()}
      title={title ?? lamp.label}
      role="status"
      aria-label={lamp.label}
    >
      <span className="network-status-lamp__dot" aria-hidden="true" />
      <span className="network-status-lamp__label">{lamp.label}</span>
    </span>
  );
}
