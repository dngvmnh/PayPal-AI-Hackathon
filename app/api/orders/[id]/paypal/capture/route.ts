import { NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/paypal.ts";
import { currentPayment, markCaptured } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/** Merchant starts production: capture the held authorization. */
export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    const payment = currentPayment(order);
    if (payment?.status !== "authorized" || !payment.authorizationId) throw new Error("No authorization to capture.");
    const { captureId, status } = await captureAuthorization(payment.authorizationId);
    const saved = await saveOrder(markCaptured(order, captureId, { eventId: "api", type: `CAPTURE ${status}` }));
    return NextResponse.json(saved);
  });
}
