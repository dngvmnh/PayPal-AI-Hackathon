import { NextResponse } from "next/server";
import { getOrder } from "./store.ts";
import type { Order } from "./types.ts";

export type IdParams = { params: Promise<{ id: string }> };

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

/** Load the order from route params and run the handler, turning thrown errors into JSON responses. */
export async function withOrder(
  params: Promise<{ id: string }>,
  handler: (order: Order) => Promise<Response>,
): Promise<Response> {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return fail("Order not found", 404);
  try {
    return await handler(order);
  } catch (e) {
    // Transitions throw user-facing messages for anything that isn't allowed.
    console.error(e);
    return fail(e, 400);
  }
}
