import { NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit.ts";
import { seedSampleOrder } from "@/lib/sample.ts";

export async function POST(req: Request) {
  const limited = limitRequest(req, "write");
  if (limited) return limited;

  const order = await seedSampleOrder();
  return NextResponse.json({ id: order.id });
}
