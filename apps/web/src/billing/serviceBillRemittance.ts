import {
  platformFeeAsset,
  platformFeeNetwork,
} from "../shared/platformFeePair";

/** Phase 1 service-bill remittance is USDT on Tron (or Nile in testnet). */
export const SERVICE_BILL_ASSET = platformFeeAsset();
export const SERVICE_BILL_NETWORK = platformFeeNetwork();

/**
 * Wallet URI for service-bill remittance (matches API `serviceBillQrPayload`).
 */
export function serviceBillQrPayload(
  payTo: string,
  totalAmount: string,
): string | null {
  if (!payTo.startsWith("T") || payTo.length < 30) return null;
  const q = new URLSearchParams({
    amount: totalAmount,
    asset: SERVICE_BILL_ASSET,
    network: SERVICE_BILL_NETWORK,
  });
  return `tron:${payTo}?${q.toString()}`;
}
