import type { ReactNode } from "react";
import { AssetCode, NetworkId } from "@cryptogate/domain";

type IconProps = { className?: string; title?: string };

function IconShell({
  className,
  bg,
  children,
}: IconProps & { bg: string; children: ReactNode }) {
  return (
    <span
      className={`plat-crypto-icon${className ? ` ${className}` : ""}`}
      style={{ background: bg }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** Compact brand marks for Health / catalog rows — no external asset CDN. */
export function AssetIcon({ asset }: { asset: string }) {
  switch (asset) {
    case AssetCode.USDT:
      return (
        <IconShell bg="#26a17b" title="USDT">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M12 4.5v15M7.5 8.2h9M8.2 8.2c0 2.4 1.7 4.4 3.8 4.4s3.8-2 3.8-4.4"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </IconShell>
      );
    case AssetCode.USDC:
      return (
        <IconShell bg="#2775ca" title="USDC">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <circle cx="12" cy="12" r="7.5" stroke="#fff" strokeWidth="1.6" />
            <path
              d="M12 7.5v9M9.2 10.2c.6-1 1.6-1.5 2.8-1.5 1.7 0 3 1 3 2.4s-1.3 2.4-3 2.4c-1.2 0-2.2-.5-2.8-1.5"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </IconShell>
      );
    case AssetCode.BTC:
      return (
        <IconShell bg="#f7931a" title="BTC">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M10 6.5V17.5M13.2 6.5V17.5M8.2 9.2h6.2c1.5 0 2.6.9 2.6 2.2S15.9 13.6 14.4 13.6H8.2M8.2 13.6h6.6c1.6 0 2.8 1 2.8 2.3S16.4 18.2 14.8 18.2H8.2"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconShell>
      );
    case AssetCode.ETH:
      return (
        <IconShell bg="#627eea" title="ETH">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="#fff">
            <path d="M12 3.5 L18 12.2 L12 15.2 L6 12.2 Z" opacity="0.9" />
            <path d="M12 15.8 L18 12.6 L12 20.5 L6 12.6 Z" opacity="0.65" />
          </svg>
        </IconShell>
      );
    case AssetCode.TRX:
      return (
        <IconShell bg="#ff060a" title="TRX">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M5.5 6.5 L18.5 6.8 L12.2 18.5 Z"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </IconShell>
      );
    default:
      return (
        <IconShell bg="#64748b" title={asset}>
          <span className="plat-crypto-icon__letter">{asset.slice(0, 1)}</span>
        </IconShell>
      );
  }
}

export function NetworkIcon({ network }: { network: string }) {
  switch (network) {
    case NetworkId.Tron:
      return (
        <IconShell bg="#ff060a" title="Tron">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M5.5 6.5 L18.5 6.8 L12.2 18.5 Z"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </IconShell>
      );
    case NetworkId.Ethereum:
      return (
        <IconShell bg="#627eea" title="Ethereum">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="#fff">
            <path d="M12 3.5 L18 12.2 L12 15.2 L6 12.2 Z" opacity="0.9" />
            <path d="M12 15.8 L18 12.6 L12 20.5 L6 12.6 Z" opacity="0.65" />
          </svg>
        </IconShell>
      );
    case NetworkId.BnbSmartChain:
      return (
        <IconShell bg="#f3ba2f" title="BNB Smart Chain">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="#fff">
            <path d="M12 4.5 L15.2 7.7 L12 10 L8.8 7.7 Z" />
            <path d="M7.7 8.8 L10.9 12 L7.7 15.2 L4.5 12 Z" />
            <path d="M16.3 8.8 L19.5 12 L16.3 15.2 L13.1 12 Z" />
            <path d="M12 14 L15.2 17.2 L12 20.4 L8.8 17.2 Z" />
          </svg>
        </IconShell>
      );
    case NetworkId.Polygon:
      return (
        <IconShell bg="#8247e5" title="Polygon">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M7.5 9.2 L12 6.5 L16.5 9.2 V14.8 L12 17.5 L7.5 14.8 Z"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </IconShell>
      );
    case NetworkId.ArbitrumOne:
      return (
        <IconShell bg="#12aaff" title="Arbitrum One">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M7 17.5 L12 5.5 L17 17.5 H13.8 L12 12.8 L10.2 17.5 Z"
              fill="#fff"
            />
          </svg>
        </IconShell>
      );
    case NetworkId.Solana:
      return (
        <IconShell
          bg="linear-gradient(135deg, #9945ff 0%, #14f195 100%)"
          title="Solana"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path d="M6.5 8.2 H16.2 L17.5 10 H7.8 Z" fill="#fff" />
            <path d="M6.5 11.5 H16.2 L17.5 13.3 H7.8 Z" fill="#fff" />
            <path d="M6.5 14.8 H16.2 L17.5 16.6 H7.8 Z" fill="#fff" />
          </svg>
        </IconShell>
      );
    case NetworkId.Ton:
      return (
        <IconShell bg="#0098ea" title="TON">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M6.5 7.5 H17.5 L12 18 Z"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </IconShell>
      );
    case NetworkId.Base:
      return (
        <IconShell bg="#0052ff" title="Base">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <circle cx="12" cy="12" r="6.5" fill="#fff" />
            <circle cx="12" cy="12" r="3.2" fill="#0052ff" />
          </svg>
        </IconShell>
      );
    case NetworkId.Bitcoin:
      return (
        <IconShell bg="#f7931a" title="Bitcoin">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M10 6.5V17.5M13.2 6.5V17.5M8.2 9.2h6.2c1.5 0 2.6.9 2.6 2.2S15.9 13.6 14.4 13.6H8.2M8.2 13.6h6.6c1.6 0 2.8 1 2.8 2.3S16.4 18.2 14.8 18.2H8.2"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconShell>
      );
    default:
      return (
        <IconShell bg="#64748b" title={network}>
          <span className="plat-crypto-icon__letter">
            {network.slice(0, 1).toUpperCase()}
          </span>
        </IconShell>
      );
  }
}
