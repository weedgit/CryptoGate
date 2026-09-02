import { OrderStatus, WebhookEventType } from "@paymentgate/domain";

/**
 * Map payment-order status → outbound webhook type.
 * `confirmed` and `cancelled` have no WebhookEventType in Phase 1.
 * @param {string} status
 * @returns {string | null}
 */
export function webhookEventTypeForOrderStatus(status) {
  switch (status) {
    case OrderStatus.PendingPayment:
      return WebhookEventType.PaymentOrderCreated;
    case OrderStatus.Verifying:
      return WebhookEventType.PaymentOrderVerifying;
    case OrderStatus.Completed:
      return WebhookEventType.PaymentOrderCompleted;
    case OrderStatus.Expired:
      return WebhookEventType.PaymentOrderExpired;
    case OrderStatus.PaymentAnomaly:
      return WebhookEventType.PaymentOrderPaymentAnomaly;
    case OrderStatus.Failed:
      return WebhookEventType.PaymentOrderFailed;
    default:
      return null;
  }
}

/**
 * OpenAPI WebhookEvent envelope for payment_order.*.
 * @param {{
 *   eventId: string,
 *   eventType: string,
 *   createdAt: string,
 *   orderId: string,
 *   orderNumber: string,
 *   status: string,
 * }} input
 */
export function buildPaymentOrderWebhookPayload(input) {
  return {
    id: input.eventId,
    type: input.eventType,
    createdAt: input.createdAt,
    data: {
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      status: input.status,
    },
  };
}

/**
 * @param {unknown} events
 * @param {string} eventType
 */
export function endpointSubscribesToEvent(events, eventType) {
  return Array.isArray(events) && events.includes(eventType);
}
