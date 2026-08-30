import { useState } from "react";
import {
  explorerAddressUrl,
  explorerName,
  explorerTxUrl,
} from "./chainExplorer";

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

function CopyIcon({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg className="chain-value__icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
        />
      </svg>
    );
  }
  return (
    <svg className="chain-value__icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <rect
        x="5.25"
        y="2.25"
        width="8.5"
        height="8.5"
        rx="1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="2.25"
        y="5.25"
        width="8.5"
        height="8.5"
        rx="1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

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
          className={`chain-value__copy${copied ? " is-copied" : ""}`}
          onClick={() => void onCopy()}
          aria-label={copied ? "Copied" : "Copy"}
          title={copied ? "Copied" : "Copy"}
        >
          <CopyIcon done={copied} />
        </button>
      </span>
    </span>
  );
}
