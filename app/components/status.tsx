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
  return <span className={`pill ${cls}`}>{label}</span>;
}
