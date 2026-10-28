import { markAuthorized, markCaptureDenied, markCaptured, markVoided } from "./orders.ts";
import type { Order } from "./types.ts";

/** The parts of a PayPal webhook event we use. */
export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    custom_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } };
  };
}

export const HANDLED_EVENTS = [
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
];

/** Our order id from custom_id ("orderId:iteration:versionHash"). */
export function orderIdFromEvent(e: PayPalWebhookEvent): string | undefined {
  return e.resource?.custom_id?.split(":")[0] || undefined;
}

/** Fallback lookup by PayPal ids when custom_id is missing. */
export function eventMatchesOrder(order: Order, e: PayPalWebhookEvent): boolean {
  const r = e.resource ?? {};
  const related = r.supplementary_data?.related_ids ?? {};
  return order.payments.some(
    (p) =>
      (p.paypalOrderId && p.paypalOrderId === related.order_id) ||
      (p.authorizationId && (p.authorizationId === r.id || p.authorizationId === related.authorization_id)),
  );
}

/**
 * Apply a verified webhook event. Idempotent: replays of the same event id change nothing, and events
 * that only confirm what our own API calls already recorded just add an entry to the payment's event list.
 */
export function applyPayPalEvent(order: Order, e: PayPalWebhookEvent): Order {
  const r = e.resource ?? {};
  const related = r.supplementary_data?.related_ids ?? {};
  const source = { eventId: e.id, type: e.event_type };
  switch (e.event_type) {
    case "PAYMENT.AUTHORIZATION.CREATED":
      return markAuthorized(order, r.id ?? "", source);
    case "PAYMENT.AUTHORIZATION.VOIDED":
      // A void we didn't start (dashboard, expiry) reopens the order so the merchant can ask for a new approval.
      return markVoided(order, { ...source, reopen: true, reason: "Authorization voided in PayPal", authorizationId: r.id });
    case "PAYMENT.CAPTURE.COMPLETED":
      return markCaptured(order, r.id ?? "", { ...source, authorizationId: related.authorization_id });
    case "PAYMENT.CAPTURE.DENIED":
      return markCaptureDenied(order, { ...source, authorizationId: related.authorization_id });
    default:
      return order;
  }
}
