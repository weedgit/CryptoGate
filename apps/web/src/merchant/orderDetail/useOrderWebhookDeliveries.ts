import { useEffect, useState } from "react";
import {
  ApiError,
  listWebhookDeliveries,
  listWebhooks,
  resendWebhookDelivery,
  type WebhookDelivery,
} from "../api";

export type OrderWebhookRow = WebhookDelivery & { webhookId: string };

/** Webhook deliveries for one order across every webhook on the org. */
export function useOrderWebhookDeliveries(
  canViewWebhooks: boolean,
  orgId: string | null,
  orderId: string | undefined,
) {
  const [webhookRows, setWebhookRows] = useState<Array<OrderWebhookRow>>([]);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewWebhooks || !orgId || !orderId) {
      setWebhookRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const hooks = await listWebhooks(orgId);
        const rows: Array<WebhookDelivery & { webhookId: string }> = [];
        for (const hook of hooks) {
          const deliveries = await listWebhookDeliveries(hook.id, orgId);
          for (const row of deliveries) {
            if (row.orderId === orderId) {
              rows.push({ ...row, webhookId: hook.id });
            }
          }
        }
        if (!cancelled) setWebhookRows(rows);
      } catch {
        if (!cancelled) setWebhookRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewWebhooks, orgId, orderId]);

  function resendDelivery(d: OrderWebhookRow) {
    if (!orgId) return;
    void (async () => {
      setWebhookBusy(true);
      setWebhookMsg(null);
      try {
        await resendWebhookDelivery(
          d.webhookId,
          d.id,
          orgId,
        );
        setWebhookMsg("Delivery queued for resend.");
        const hooks = await listWebhooks(orgId);
        const rows: Array<
          WebhookDelivery & { webhookId: string }
        > = [];
        for (const hook of hooks) {
          const deliveries = await listWebhookDeliveries(
            hook.id,
            orgId,
          );
          for (const row of deliveries) {
            if (row.orderId === orderId) {
              rows.push({ ...row, webhookId: hook.id });
            }
          }
        }
        setWebhookRows(rows);
      } catch (err) {
        setWebhookMsg(
          err instanceof ApiError
            ? err.message
            : "Resend failed",
        );
      } finally {
        setWebhookBusy(false);
      }
    })();
  }

  return { webhookRows, webhookBusy, webhookMsg, resendDelivery };
}
