/**
 * Public block-explorer URLs by PaymentGate network id.
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
  solana: {
    name: "Solscan",
    address: (a) => `https://solscan.io/account/${encodeURIComponent(a)}`,
    tx: (h) => `https://solscan.io/tx/${encodeURIComponent(h)}`,
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
