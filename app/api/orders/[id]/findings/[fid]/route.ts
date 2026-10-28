import { NextResponse } from "next/server";
import { resolveFinding, type FindingAction } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder } from "@/lib/http.ts";

/** Body: a FindingAction, e.g. { type: "waive", reason }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const { fid } = await params;
  const action = (await req.json()) as FindingAction;
  return withOrder(params, async (order) => NextResponse.json(await saveOrder(resolveFinding(order, fid, action))));
}
