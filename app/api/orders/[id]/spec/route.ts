import { NextResponse } from "next/server";
import { refreshStatus, setSpecField } from "@/lib/orders.ts";
import { paymentGate } from "@/lib/gate.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";
import { SpecField } from "@/lib/types.ts";

/** Body: { field, value } to edit one spec field, or { action: "send_proof" }. */
export async function POST(req: Request, { params }: IdParams) {
  const body = await req.json();
  return withOrder(params, async (order) => {
    if (order.paypal?.authorizationId) throw new Error("Payment already authorized; spec is locked.");
    if (body.action === "send_proof") {
      const gate = paymentGate(order);
      if (!gate.ok) throw new Error(gate.reasons.join(" "));
      return NextResponse.json(await saveOrder(refreshStatus({ ...order, status: "proof_sent" })));
    }
    const field = SpecField.parse(body.field);
    return NextResponse.json(await saveOrder(setSpecField(order, field, String(body.value ?? ""))));
  });
}
