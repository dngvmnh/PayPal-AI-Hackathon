import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal.ts";
import { getOrder, listOrders, saveOrder } from "@/lib/store.ts";
import { applyPayPalEvent, eventMatchesOrder, HANDLED_EVENTS, orderIdFromEvent, type PayPalWebhookEvent } from "@/lib/webhooks.ts";

/** PayPal webhook endpoint. Register it in the developer dashboard and set PAYPAL_WEBHOOK_ID. */
export async function POST(req: Request) {
  const event = (await req.json().catch(() => null)) as PayPalWebhookEvent | null;
  if (!event?.id || !event.event_type) return NextResponse.json({ error: "Not a webhook event" }, { status: 400 });

  let verified = false;
  try {
    verified = await verifyWebhookSignature(req.headers, event);
  } catch (e) {
    console.error("Webhook verification error", e);
    return NextResponse.json({ error: "Could not verify signature" }, { status: 500 });
  }
  if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  if (!HANDLED_EVENTS.includes(event.event_type)) return NextResponse.json({ ignored: event.event_type });

  const byId = orderIdFromEvent(event);
  const order = (byId && (await getOrder(byId))) || (await listOrders()).find((o) => eventMatchesOrder(o, event));
  if (!order) return NextResponse.json({ ignored: "no matching order" });

  try {
    await saveOrder(applyPayPalEvent(order, event));
  } catch (e) {
    // Acknowledge anyway so PayPal doesn't retry an event we can't apply; the error is logged.
    console.error(`Webhook ${event.id} (${event.event_type}) not applied to ${order.id}`, e);
    return NextResponse.json({ ignored: e instanceof Error ? e.message : String(e) });
  }
  return NextResponse.json({ ok: true });
}
