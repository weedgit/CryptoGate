import type { ReactNode } from "react";
import { AssetCode, NetworkId } from "@paymentgate/domain";

type IconProps = { className?: string; title?: string };

/** Glyph paths aligned with cryptocurrency-icons / exchange badges (white on brand disk).
 *  viewBox is cropped — source icons include padding for a full-bleed circle mark. */
function Glyph({
  children,
  size = 17,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      viewBox="4 4 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

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

/** Official-style Tether “T” mark (USDT). */
function UsdtGlyph({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path
        fill="#fff"
        d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"
      />
    </Glyph>
  );
}

/** Faceted TRON triangle (network + TRX asset). */
function TronGlyph({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path
        fill="#fff"
        d="M21.932 9.913 7.5 7.257l7.595 19.112 10.583-12.894-3.746-3.562zm-.232 1.17 2.208 2.099-6.038 1.093 3.83-3.192zm-5.142 2.973-6.364-5.278 10.402 1.914-4.038 3.364zm-.453.934-1.038 8.58L9.472 9.487l6.633 5.502zm.96.455 6.687-1.21-7.67 9.343.983-8.133z"
      />
    </Glyph>
  );
}

/** Classic Ethereum diamond with layered facets. */
function EthGlyph({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <g fill="#fff" fillRule="nonzero">
        <path fillOpacity=".602" d="M16.498 4v8.87l7.497 3.35z" />
        <path d="M16.498 4 9 16.22l7.498-3.35z" />
        <path fillOpacity=".602" d="M16.498 21.968v6.027L24 17.616z" />
        <path d="M16.498 27.995v-6.028L9 17.616z" />
        <path fillOpacity=".2" d="m16.498 20.573 7.497-4.353-7.497-3.348z" />
        <path fillOpacity=".602" d="m9 16.22 7.498 4.353v-7.701z" />
      </g>
    </Glyph>
  );
}

/** Circle USDC mark (C + orbit arcs). */
function UsdcGlyph({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <g fill="#fff">
        <path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578 0-.85.61-1.396 1.828-1.396 1.097 0 1.707.364 2.011 1.275a.458.458 0 0 0 .427.303h.975a.416.416 0 0 0 .427-.425v-.06a3.04 3.04 0 0 0-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.242-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.668 2.255 1.639 0 .97-.853 1.638-2.011 1.638-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 0 0-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z" />
        <path d="M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.365-.303.365-.607v-.85c0-.242-.121-.424-.365-.485-.061 0-.183 0-.244.06a10.895 10.895 0 0 0-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.182-.424-.365-.546zm6.46-18.936c-.244-.122-.488 0-.548.242-.061.061-.061.122-.061.243v.85c0 .243.182.485.365.607 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.365.303-.365.607v.85c0 .242.121.424.365.485.061 0 .183 0 .244-.06a10.895 10.895 0 0 0 7.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162z" />
      </g>
    </Glyph>
  );
}

/** Solana slanted bars. */
function SolGlyph({ size }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path
        fill="#fff"
        d="M9.925 19.687a.59.59 0 0 1 .415-.17h14.366a.29.29 0 0 1 .207.497l-2.838 2.815a.59.59 0 0 1-.415.171H7.294a.291.291 0 0 1-.207-.498l2.838-2.815zm0-10.517A.59.59 0 0 1 10.34 9h14.366c.261 0 .392.314.207.498l-2.838 2.815a.59.59 0 0 1-.415.17H7.294a.291.291 0 0 1-.207-.497L9.925 9.17zm12.15 5.225a.59.59 0 0 0-.415-.17H7.294a.291.291 0 0 0-.207.498l2.838 2.815c.11.109.26.17.415.17h14.366a.291.291 0 0 0 .207-.498l-2.838-2.815z"
      />
    </Glyph>
  );
}

/** Compact brand marks for Health / catalog rows — no external asset CDN. */
export function AssetIcon({ asset }: { asset: string }) {
  switch (asset) {
    case AssetCode.USDT:
      return (
        <IconShell bg="#26a17b" title="USDT">
          <UsdtGlyph />
        </IconShell>
      );
    case AssetCode.USDC:
      return (
        <IconShell bg="#2775ca" title="USDC">
          <UsdcGlyph />
        </IconShell>
      );
    case AssetCode.ETH:
      return (
        <IconShell bg="#627eea" title="ETH">
          <EthGlyph />
        </IconShell>
      );
    case AssetCode.TRX:
      return (
        <IconShell bg="#ef0027" title="TRX">
          <TronGlyph />
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
    case NetworkId.TronNile:
      return (
        <IconShell
          bg="#ef0027"
          title={network === NetworkId.TronNile ? "Tron Nile" : "Tron"}
        >
          <TronGlyph />
        </IconShell>
      );
    case NetworkId.Ethereum:
      return (
        <IconShell bg="#627eea" title="Ethereum">
          <EthGlyph />
        </IconShell>
      );
    case NetworkId.Solana:
      return (
        <IconShell
          bg="linear-gradient(135deg, #9945ff 0%, #14f195 100%)"
          title="Solana"
        >
          <SolGlyph />
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

/** Squircle brand tile for QR center overlay (use with ecc=H). */
export function QrCenterNetworkMark({ network }: { network: string }) {
  if (network === NetworkId.Tron || network === NetworkId.TronNile) {
    return (
      <span
        className="qr-center-mark"
        style={{ background: "#ef0027" }}
        title={network === NetworkId.TronNile ? "Tron Nile" : "Tron"}
        aria-hidden
      >
        <TronGlyph size={34} />
      </span>
    );
  }

  if (network === NetworkId.Ethereum) {
    return (
      <span className="qr-center-mark" style={{ background: "#627eea" }} title="Ethereum" aria-hidden>
        <EthGlyph size={34} />
      </span>
    );
  }

  return (
    <span className="qr-center-mark qr-center-mark--icon" aria-hidden>
      <NetworkIcon network={network} />
    </span>
  );
}
