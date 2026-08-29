/**
 * Public block-explorer URLs by CryptoGate network id.
 * Used for invoice/order “open in explorer” links (watch-only — no RPC).
 */

const EXPLORERS: Record<
  string,
  { name: string; address: (a: string) => string; tx: (h: string) => string }
> = {
  tron: {
    name: "Tronscan",
    address: (a) => `https://tronscan.org/#/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://tronscan.org/#/transaction/${encodeURIComponent(h)}`,
  },
  tron_nile: {
    name: "Tronscan Nile",
    address: (a) =>
      `https://nile.tronscan.org/#/address/${encodeURIComponent(a)}`,
    tx: (h) =>
      `https://nile.tronscan.org/#/transaction/${encodeURIComponent(h)}`,
  },
  ethereum: {
    name: "Etherscan",
    address: (a) => `https://etherscan.io/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://etherscan.io/tx/${encodeURIComponent(h)}`,
  },
  bnb_smart_chain: {
    name: "BscScan",
    address: (a) => `https://bscscan.com/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://bscscan.com/tx/${encodeURIComponent(h)}`,
  },
  polygon: {
    name: "Polygonscan",
    address: (a) => `https://polygonscan.com/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://polygonscan.com/tx/${encodeURIComponent(h)}`,
  },
  arbitrum_one: {
    name: "Arbiscan",
    address: (a) => `https://arbiscan.io/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://arbiscan.io/tx/${encodeURIComponent(h)}`,
  },
  base: {
    name: "Basescan",
    address: (a) => `https://basescan.org/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://basescan.org/tx/${encodeURIComponent(h)}`,
  },
  solana: {
    name: "Solscan",
    address: (a) => `https://solscan.io/account/${encodeURIComponent(a)}`,
    tx: (h) => `https://solscan.io/tx/${encodeURIComponent(h)}`,
  },
  ton: {
    name: "TON Viewer",
    address: (a) => `https://tonviewer.com/${encodeURIComponent(a)}`,
    tx: (h) => `https://tonviewer.com/transaction/${encodeURIComponent(h)}`,
  },
  bitcoin: {
    name: "Mempool",
    address: (a) => `https://mempool.space/address/${encodeURIComponent(a)}`,
    tx: (h) => `https://mempool.space/tx/${encodeURIComponent(h)}`,
  },
};

export function explorerName(network: string | null | undefined): string | null {
  const key = network?.trim().toLowerCase();
  if (!key) return null;
  return EXPLORERS[key]?.name ?? null;
}

export function explorerAddressUrl(
  network: string | null | undefined,
  address: string | null | undefined,
): string | null {
  const key = network?.trim().toLowerCase();
  const value = address?.trim();
  if (!key || !value || value === "—") return null;
  return EXPLORERS[key]?.address(value) ?? null;
}

export function explorerTxUrl(
  network: string | null | undefined,
  txHash: string | null | undefined,
): string | null {
  const key = network?.trim().toLowerCase();
  const value = txHash?.trim();
  if (!key || !value || value === "—") return null;
  return EXPLORERS[key]?.tx(value) ?? null;
}
