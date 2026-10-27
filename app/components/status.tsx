import type { OrderStatus } from "@/lib/types.ts";

const LABELS: Record<OrderStatus, [string, string]> = {
  draft: ["Not checked", "info"],
  needs_review: ["Needs review", "blocking"],
  ready_for_proof: ["Ready for proof", "ok"],
  proof_sent: ["Proof sent", "ok"],
  authorized: ["Paid (authorized)", "ok"],
  captured: ["In production", "ok"],
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const [label, cls] = LABELS[status];
  return <span className={`pill ${cls}`}>{label}</span>;
}
