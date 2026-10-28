import { NextResponse } from "next/server";
import { voidAuthorization } from "@/lib/paypal.ts";
import { currentPayment, markVoided } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/**
 * Release the held funds. Body: { reopen: boolean, reason }.
 * reopen=true starts a new iteration so the order can be edited and approved again; false cancels it.
 */
export async function POST(req: Request, { params }: IdParams) {
  const body = await req.json();
  return withOrder(params, async (order) => {
    const payment = currentPayment(order);
    if (payment?.status !== "authorized" || !payment.authorizationId) throw new Error("No authorization to void.");
    const reason = String(body.reason ?? "").trim();
    if (!reason) throw new Error("Say why you're voiding the authorization.");
    await voidAuthorization(payment.authorizationId);
    const saved = await saveOrder(
      markVoided(order, { reopen: Boolean(body.reopen), reason, eventId: "api", type: "VOID", authorizationId: payment.authorizationId }),
    );
    return NextResponse.json(saved);
  });
}
