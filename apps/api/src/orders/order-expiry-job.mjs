import { expireDuePaymentOrders } from "./order-expiry.mjs";
import { activateDuePendingSettlements } from "../settlement/settlement-store.mjs";
import { activateDuePendingXpubs } from "../xpub/xpub-store.mjs";

/**
 * @param {{
 *   intervalMs?: number,
 *   enabled?: boolean,
 *   run?: () => Promise<unknown>,
 * }} [options]
 */
export function startOrderExpiryJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.ORDER_EXPIRY_ENABLED === "0" ||
      process.env.ORDER_EXPIRY_ENABLED === "false"
    );
  if (!enabled) {
    return { stop() {} };
  }

  const intervalMs =
    options.intervalMs ??
    Number(process.env.ORDER_EXPIRY_INTERVAL_MS ?? 30_000);

  const run =
    options.run ??
    (async () => {
      try {
        await expireDuePaymentOrders();
        await activateDuePendingSettlements();
        await activateDuePendingXpubs();
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("order expiry tick failed", err);
        }
      }
    });

  const handle = setInterval(() => {
    void run();
  }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30_000);
  if (typeof handle.unref === "function") handle.unref();

  void run();

  return {
    stop() {
      clearInterval(handle);
    },
  };
}
