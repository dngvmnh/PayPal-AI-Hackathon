import { NextResponse } from "next/server";
import { withOrder, type IdParams } from "@/lib/http.ts";

export async function GET(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => NextResponse.json(order));
}
