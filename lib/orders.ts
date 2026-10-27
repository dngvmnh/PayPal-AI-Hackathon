import { paymentGate } from "./gate.ts";
import type { AIAnalysis, Finding, Order, OrderStatus, SpecField } from "./types.ts";

/** Merge a fresh AI analysis into the order: proposed spec, pricing, and findings (all open). */
export function applyAnalysis(
  order: Order,
  ai: AIAnalysis,
  meta: { model: string; demo: boolean },
): Order {
  const spec: Order["spec"] = {};
  for (const { field, value } of ai.proposedSpec) if (value) spec[field] = value;
  const findings: Finding[] = ai.findings.map((f, i) => ({ ...f, id: `f${i + 1}`, status: "open" }));
  return refreshStatus({
    ...order,
    spec,
    pricing: { ...ai.pricing, currency: ai.pricing.currency || "USD" },
    approvedSpecHash: undefined,
    analysis: {
      ranAt: new Date().toISOString(),
      model: meta.model,
      demo: meta.demo,
      summary: ai.summary,
      findings,
    },
  });
}

export function resolveFinding(
  order: Order,
  findingId: string,
  action: { status: "resolved" | "waived" | "open"; value?: string; note?: string },
): Order {
  if (!order.analysis) throw new Error("No analysis to resolve.");
  const finding = order.analysis.findings.find((f) => f.id === findingId);
  if (!finding) throw new Error(`Unknown finding ${findingId}`);
  if (action.status === "resolved" && !action.value?.trim()) {
    throw new Error("Resolving a finding requires the value you settled on.");
  }

  const findings = order.analysis.findings.map((f) =>
    f.id === findingId
      ? { ...f, status: action.status, resolvedValue: action.value?.trim(), resolutionNote: action.note }
      : f,
  );
  let next: Order = { ...order, analysis: { ...order.analysis, findings } };
  if (action.status === "resolved" && action.value) {
    next = setSpecField(next, finding.field, action.value.trim());
  }
  return refreshStatus(next);
}

/** Update one spec field; quantity and unit price also drive the PayPal amount. */
export function setSpecField(order: Order, field: SpecField, value: string): Order {
  const pricing = { ...order.pricing };
  if (field === "quantity") pricing.quantity = parseNumber(value, true);
  if (field === "unit_price") pricing.unitPrice = parseNumber(value, false);
  return refreshStatus({ ...order, spec: { ...order.spec, [field]: value }, pricing, approvedSpecHash: undefined });
}

export function parseNumber(value: string, integer: boolean): number | null {
  const m = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return integer ? Math.round(n) : n;
}

export function refreshStatus(order: Order): Order {
  let status: OrderStatus;
  if (order.paypal?.captureId) status = "captured";
  else if (order.paypal?.authorizationId) status = "authorized";
  else if (!order.analysis) status = "draft";
  else if (!paymentGate(order).ok) status = "needs_review";
  else status = order.status === "proof_sent" ? "proof_sent" : "ready_for_proof";
  return { ...order, status };
}
