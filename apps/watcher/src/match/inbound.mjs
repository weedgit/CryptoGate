/**
 * Map inbound transfers → matchTransaction → DB updates (M3-41).
 * Matching stays in @cryptogate/matching; watcher never imports apps/api.
 */
import { matchTransaction } from "@cryptogate/matching";

/**
 * @typedef {{
 *   toAddress: string,
 *   amount: string,
 *   asset: string,
 *   network: string,
 *   txHash: string,
 *   memoOrTag?: string,
 * }} InboundTransfer
 */

/**
 * @typedef {{
 *   orderId: string,
 *   matchingMode: string,
 *   payableAmount: string,
 *   receiveAddress: string,
 *   asset: string,
 *   network: string,
 *   memoOrTag?: string | null,
 *   expiresAt?: string,
 * }} WatcherOrderRow
 */

/**
 * Group open orders for one transfer address, call matching per mode.
 * Pure except for matchTransaction (injectable for tests).
 *
 * @param {{
 *   transfer: InboundTransfer,
 *   openOrders: WatcherOrderRow[],
 *   matchFn?: typeof matchTransaction,
 * }} input
 */
export async function matchInboundTransfer(input) {
  const matchFn = input.matchFn ?? matchTransaction;
  const transfer = input.transfer;
  const to = transfer.toAddress.trim();

  const atAddress = input.openOrders.filter(
    (o) =>
      o.receiveAddress.trim() === to &&
      o.asset === transfer.asset &&
      o.network === transfer.network,
  );

  if (atAddress.length === 0) {
    return {
      applied: false,
      result: {
        status: "pending_payment",
        reason: "no_open_order_at_address",
      },
    };
  }

  /** @type {Map<string, WatcherOrderRow[]>} */
  const byMode = new Map();
  for (const order of atAddress) {
    const mode = order.matchingMode;
    const list = byMode.get(mode) ?? [];
    list.push(order);
    byMode.set(mode, list);
  }

  /** Prefer modes that can produce a binding; collect first non-empty outcome. */
  const modeOrder = ["B", "C", "D", "S"];
  for (const mode of modeOrder) {
    const group = byMode.get(mode);
    if (!group?.length) continue;

    const candidates = group.map((o) => ({
      orderId: o.orderId,
      payableAmount: o.payableAmount,
      receiveAddress: o.receiveAddress,
      asset: o.asset,
      network: o.network,
      memoOrTag: o.memoOrTag,
      expiresAt: o.expiresAt,
    }));

    const result = await matchFn({
      mode,
      toAddress: transfer.toAddress,
      amount: transfer.amount,
      asset: transfer.asset,
      network: transfer.network,
      memoOrTag: transfer.memoOrTag,
      txHash: transfer.txHash,
      candidates,
    });

    const hasBinding =
      Boolean(result.orderId) ||
      (result.orderIds?.length ?? 0) > 0 ||
      result.status === "payment_anomaly";

    if (hasBinding || result.reason !== "no_open_order_at_address") {
      return { applied: hasBinding, result, mode };
    }
  }

  return {
    applied: false,
    result: {
      status: "pending_payment",
      reason: "no_exact_amount_match",
    },
  };
}

/**
 * Process a batch of transfers against open orders.
 *
 * @param {{
 *   transfers: InboundTransfer[],
 *   openOrders: WatcherOrderRow[],
 *   apply: (args: { result: object, transfer: InboundTransfer }) => Promise<{ updated: number }>,
 *   matchFn?: typeof matchTransaction,
 * }} input
 */
export async function processTransferBatch(input) {
  const outcomes = [];
  for (const transfer of input.transfers) {
    const matched = await matchInboundTransfer({
      transfer,
      openOrders: input.openOrders,
      matchFn: input.matchFn,
    });
    if (!matched.applied && matched.result.status === "pending_payment") {
      outcomes.push({
        txHash: transfer.txHash,
        skipped: true,
        reason: matched.result.reason,
      });
      continue;
    }
    const applied = await input.apply({
      result: matched.result,
      transfer,
    });
    outcomes.push({
      txHash: transfer.txHash,
      mode: matched.mode,
      status: matched.result.status,
      reason: matched.result.reason,
      updated: applied.updated,
      skipped: applied.skipped === true || (applied.updated ?? 0) === 0,
      alreadyApplied: applied.alreadyApplied === true,
    });
  }
  return outcomes;
}
