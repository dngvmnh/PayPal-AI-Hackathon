import type { OrderStatus } from "@/lib/types.ts";

const LABELS: Record<OrderStatus, [string, string]> = {
  draft: ["Not checked", "info"],
  needs_review: ["Needs review", "blocking"],
  ready_for_approval: ["Waiting for customer approval", "warning"],
  approved: ["Approved, awaiting payment", "ok"],
  authorized: ["Paid (authorized), locked", "ok"],
  captured: ["In production", "ok"],
  cancelled: ["Cancelled", "info"],
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const [label, cls] = LABELS[status];
  return <span className={`pill wrap ${cls}`}>{label}</span>;
}

const STEPS = ["AI check", "Settle findings", "Customer approves", "Customer pays", "Capture"];
const CURRENT_STEP: Record<Exclude<OrderStatus, "cancelled">, number> = {
  draft: 0,
  needs_review: 1,
  ready_for_approval: 2,
  approved: 3,
  authorized: 4,
  captured: STEPS.length,
};

/** Where the order is in the flow. A cancelled order has left it, so its status pill says enough. */
export function OrderSteps({ status }: { status: OrderStatus }) {
  if (status === "cancelled") return null;
  const current = CURRENT_STEP[status];
  return (
    <ol className="steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={`step ${i < current ? "done" : i === current ? "current" : "todo"}`}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="step-number">{i < current ? "✓" : i + 1}</span>
          <span className="step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
