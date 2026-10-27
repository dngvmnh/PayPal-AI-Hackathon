import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store.ts";
import { paymentGate } from "@/lib/gate.ts";
import { SPEC_FIELDS, SPEC_LABELS } from "@/lib/types.ts";
import { ProofCheckout } from "@/app/components/ProofCheckout.tsx";

export const dynamic = "force-dynamic";

/** Customer-facing proof: final spec + artwork, approve and pay with PayPal. */
export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const gate = paymentGate(order);
  const designs = order.sources.filter((s) => s.kind === "design" && s.mimeType?.startsWith("image/"));
  const paid = Boolean(order.paypal?.authorizationId);

  return (
    <>
      <h1>Proof for {order.title}</h1>
      <p className="muted">
        Hi {order.customerName || "there"}, please check every line below. What you approve here is exactly
        what we print and charge.
      </p>
      <div className="grid-main">
        <div className="panel">
          <h2>Final specification</h2>
          <table>
            <tbody>
              {SPEC_FIELDS.filter((f) => order.spec[f]).map((f) => (
                <tr key={f}>
                  <th style={{ width: "38%" }}>{SPEC_LABELS[f]}</th>
                  <td>{order.spec[f]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {designs.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Customer-supplied artwork</h3>
              <p className="hint">
                Changes listed in the specification above (text, colors) will be applied to this file before
                printing.
              </p>
              {designs.map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={`/api/files/${order.id}/${d.file}`} alt={d.name} className="thumb" />
              ))}
            </>
          )}
        </div>
        <div className="panel">
          <h2>Approve &amp; pay</h2>
          {gate.amount != null && (
            <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
              {gate.amount.toFixed(2)} {order.pricing.currency}
            </p>
          )}
          <p className="small muted">
            {order.pricing.quantity} × {order.pricing.unitPrice?.toFixed(2)} {order.pricing.currency}. Your
            PayPal payment is authorized now and captured only when production starts.
          </p>
          {paid ? (
            <p className="pill ok">Approved and paid. Thank you!</p>
          ) : gate.ok && (order.status === "proof_sent" || order.status === "ready_for_proof") ? (
            <ProofCheckout orderId={order.id} clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} currency={order.pricing.currency} />
          ) : (
            <p className="error small">This proof isn&apos;t ready yet: {gate.reasons.join(" ")}</p>
          )}
        </div>
      </div>
    </>
  );
}
