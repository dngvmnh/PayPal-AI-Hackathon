import { NextResponse } from "next/server";
import { authorizePayPalOrder } from "@/lib/paypal.ts";
import { assertCanAuthorize, markAuthorized } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/** Called by the PayPal button's onApprove callback: hold the funds against the approved version. */
export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    const payment = assertCanAuthorize(order);
    const { status, authorizationId } = await authorizePayPalOrder(payment.paypalOrderId!);
    const saved = await saveOrder(markAuthorized(order, authorizationId, { eventId: "api", type: `AUTHORIZE ${status}` }));
    return NextResponse.json(saved);
  });
}
