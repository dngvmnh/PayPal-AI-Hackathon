import { NextResponse } from "next/server";
import { resolveFinding } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder } from "@/lib/http.ts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const { fid } = await params;
  const body = await req.json();
  return withOrder(params, async (order) => {
    if (order.paypal?.authorizationId) throw new Error("Payment already authorized; spec is locked.");
    return NextResponse.json(await saveOrder(resolveFinding(order, fid, body)));
  });
}
