import { NextResponse } from "next/server";
import { approve } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

/** Customer approves the exact version shown on the proof page. Body: { name, versionHash }. */
export async function POST(req: Request, { params }: IdParams) {
  const body = await req.json();
  return withOrder(params, async (order) => {
    const approved = approve(order, { name: String(body.name ?? ""), userAgent: req.headers.get("user-agent") ?? undefined });
    // The page sends the hash it displayed; refuse if the order changed while the customer was reading it.
    if (body.versionHash && approved.approval?.versionHash !== body.versionHash) {
      throw new Error("This proof changed while you were viewing it. Reload the page and check it again.");
    }
    return NextResponse.json(await saveOrder(approved));
  });
}
