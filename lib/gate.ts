import { createHash } from "node:crypto";
import { SPEC_FIELDS, type Order } from "./types.ts";

export interface GateResult {
  ok: boolean;
  reasons: string[];
  amount: number | null;
}

/**
 * Payment collection is only allowed once the order is internally consistent:
 * the AI check has run, no blocking finding is still open, and pricing is complete.
 * This is the core rule of the product, so it lives in one pure function.
 */
export function paymentGate(order: Order): GateResult {
  const reasons: string[] = [];
  if (!order.analysis) reasons.push("AI consistency check has not been run.");
  const openBlocking = order.analysis?.findings.filter(
    (f) => f.severity === "blocking" && f.status === "open",
  );
  if (openBlocking?.length) {
    reasons.push(`${openBlocking.length} blocking issue(s) still open.`);
  }
  const { quantity, unitPrice } = order.pricing;
  if (!quantity || quantity <= 0) reasons.push("Quantity is not set.");
  if (unitPrice == null || unitPrice <= 0) reasons.push("Unit price is not set.");
  const amount = quantity && unitPrice ? round2(quantity * unitPrice) : null;
  return { ok: reasons.length === 0, reasons, amount };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stable hash of what the customer is approving. Any spec edit after approval changes it. */
export function specHash(order: Pick<Order, "spec" | "pricing">): string {
  const canonical = JSON.stringify({
    spec: SPEC_FIELDS.map((f) => [f, order.spec[f] ?? null]),
    pricing: [order.pricing.quantity, order.pricing.unitPrice, order.pricing.currency],
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
