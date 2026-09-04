/**
 * Watcher-side anomaly classification (M3-43 / M3-44).
 * Pure helpers — matching still owns amount/memo collisions.
 */
import { isTransferEligibleForOrder } from "@paymentgate/matching";

/**
 * Open orders at the same receive address but wrong asset or network.
 * @param {{
 *   toAddress: string,
 *   asset: string,
 *   network: string,
 *   blockTimestampMs?: number,
 * }} transfer
 * @param {Array<{
 *   orderId: string,
 *   receiveAddress: string,
 *   asset: string,
 *   network: string,
 *   status?: string,
 *   createdAt?: string,
 * }>} openOrders
 * @returns {{ orderIds: string[], reason: string } | null}
 */
export function classifyWrongNetworkOrAsset(transfer, openOrders) {
  const to = transfer.toAddress.trim();
  if (!to) return null;

  const sameAddress = openOrders.filter(
    (o) =>
      o.receiveAddress.trim() === to &&
      isTransferEligibleForOrder(transfer.blockTimestampMs, o.createdAt),
  );
  if (sameAddress.length === 0) return null;

  const wrong = sameAddress.filter(
    (o) => o.asset !== transfer.asset || o.network !== transfer.network,
  );
  if (wrong.length === 0) return null;

  // Prefer open (non-terminal) rows; fall back to all same-address mismatches.
  const live = wrong.filter(
    (o) =>
      !o.status ||
      ["pending_payment", "verifying", "confirmed", "payment_anomaly", "expired"].includes(
        o.status,
      ),
  );
  const targets = live.length > 0 ? live : wrong;

  const reason =
    targets.some((o) => o.network !== transfer.network) &&
    targets.every((o) => o.asset === transfer.asset)
      ? "wrong_network"
      : targets.some((o) => o.asset !== transfer.asset) &&
          targets.every((o) => o.network === transfer.network)
        ? "wrong_asset"
        : "wrong_network_or_asset";

  return {
    orderIds: targets.map((o) => o.orderId),
    reason,
  };
}

/**
 * @param {string} txHash
 * @param {Set<string>} knownTxHashes
 */
export function isDuplicateTxHash(txHash, knownTxHashes) {
  const h = txHash?.trim();
  if (!h) return false;
  return knownTxHashes.has(h);
}
