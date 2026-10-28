import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/lib/paypal.ts";
import { assertCanStartPayment, startPayment } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/** Called by the PayPal button's createOrder callback, after the customer approved the version. */
export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    assertCanStartPayment(order);
    const id = await createPayPalOrder(order);
    await saveOrder(startPayment(order, id));
    return NextResponse.json({ id });
  });
}
