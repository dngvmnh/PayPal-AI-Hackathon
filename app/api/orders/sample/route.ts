import { NextResponse } from "next/server";
import { seedSampleOrder } from "@/lib/sample.ts";

export async function POST() {
  const order = await seedSampleOrder();
  return NextResponse.json({ id: order.id });
}
