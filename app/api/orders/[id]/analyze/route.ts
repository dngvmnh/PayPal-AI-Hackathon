import { NextResponse } from "next/server";
import { analyzeOrder, MODEL } from "@/lib/ai.ts";
import { applyAnalysis } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    if (order.paypal?.authorizationId) throw new Error("Payment already authorized; spec is locked.");
    const { analysis, demo } = await analyzeOrder(order);
    const saved = await saveOrder(applyAnalysis(order, analysis, { model: demo ? "demo-fixture" : MODEL, demo }));
    return NextResponse.json(saved);
  });
}
