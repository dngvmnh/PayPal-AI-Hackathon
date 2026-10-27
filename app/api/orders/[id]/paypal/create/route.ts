import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/lib/paypal.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/** Called by the PayPal button's createOrder callback on the customer proof page. */
export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    if (order.paypal?.authorizationId) throw new Error("This order is already paid.");
    const { id, specHash } = await createPayPalOrder(order);
    await saveOrder({ ...order, approvedSpecHash: specHash, paypal: { ...order.paypal, orderId: id, lastStatus: "CREATED" } });
    return NextResponse.json({ id });
  });
}
