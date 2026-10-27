import { NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/paypal.ts";
import { refreshStatus } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/** Merchant starts production: capture the held authorization. */
export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    const authorizationId = order.paypal?.authorizationId;
    if (!authorizationId) throw new Error("No authorization to capture.");
    const { captureId, status } = await captureAuthorization(authorizationId);
    const saved = await saveOrder(
      refreshStatus({ ...order, paypal: { ...order.paypal, captureId, lastStatus: status } }),
    );
    return NextResponse.json(saved);
  });
}
