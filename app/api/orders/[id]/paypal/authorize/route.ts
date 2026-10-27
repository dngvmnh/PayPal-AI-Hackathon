import { NextResponse } from "next/server";
import { authorizePayPalOrder } from "@/lib/paypal.ts";
import { specHash } from "@/lib/gate.ts";
import { refreshStatus } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/** Called by the PayPal button's onApprove callback: hold the funds against the approved spec. */
export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    const paypalOrderId = order.paypal?.orderId;
    if (!paypalOrderId) throw new Error("No PayPal order to authorize.");
    if (order.approvedSpecHash !== specHash(order)) {
      throw new Error("The spec changed after checkout started. Reload the proof and approve again.");
    }
    const { status, authorizationId } = await authorizePayPalOrder(paypalOrderId);
    const saved = await saveOrder(
      refreshStatus({ ...order, paypal: { ...order.paypal, authorizationId, lastStatus: status } }),
    );
    return NextResponse.json(saved);
  });
}
