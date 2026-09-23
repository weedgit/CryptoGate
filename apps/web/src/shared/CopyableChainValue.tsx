import { useState } from "react";
import {
  explorerAddressUrl,
  explorerName,
  explorerTxUrl,
} from "./chainExplorer";
import { CopyGlyph } from "./CopyGlyph";

type Kind = "address" | "tx";

type Props = {
  value: string | null | undefined;
  network: string;
  kind: Kind;
  /** Optional class on the outer row. */
  className?: string;
  /** Optional truncated / friendly label; clipboard still copies `value`. */
  display?: string;
};

/**
 * Mono chain value with copy control. Value links to the explorer when available.
 * Copy action is no-print.
 */
export function CopyableChainValue({
  value,
  network,
  kind,
  className,
  display,
}: Props) {
  const [copied, setCopied] = useState(false);
  const trimmed = value?.trim() || "";
  const empty = !trimmed || trimmed === "—";
  const shown = display?.trim() || trimmed;
  const href = empty
    ? null
    : kind === "tx"
      ? explorerTxUrl(network, trimmed)
      : explorerAddressUrl(network, trimmed);
  const name = explorerName(network);

  async function onCopy() {
    if (empty) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (empty) {
    return <span className={className ? `${className} mono` : "mono"}>—</span>;
  }

  return (
    <span className={`chain-value${className ? ` ${className}` : ""}`}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="chain-value__link mono"
          title={name ? `${trimmed} · Open in ${name}` : trimmed}
        >
          {shown}
        </a>
      ) : (
        <span className="mono" title={trimmed}>
          {shown}
        </span>
      )}
      <span className="chain-value__actions no-print">
        <button
          type="button"
          className={`cg-copy-btn chain-value__copy${copied ? " is-copied" : ""}`}
          onClick={() => void onCopy()}
          aria-label={copied ? "Copied" : "Copy"}
          title={copied ? "Copied" : "Copy"}
        >
          <CopyGlyph copied={copied} />
        </button>
      </span>
    </span>
  );
}
