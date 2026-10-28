import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store.ts";
import { paymentGate, versionHash, waivedExceptions } from "@/lib/gate.ts";
import { hasValidApproval } from "@/lib/orders.ts";
import { SPEC_FIELDS, SPEC_LABELS } from "@/lib/types.ts";
import { ProofCheckout } from "@/app/components/ProofCheckout.tsx";

export const dynamic = "force-dynamic";

/** Customer-facing proof: the exact spec, artwork files and amount to approve, then PayPal. */
export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const gate = paymentGate(order);
  const designs = order.sources.filter((s) => s.kind === "design");
  const exceptions = waivedExceptions(order);
  const hash = versionHash(order);
  const approved = hasValidApproval(order);

  let panel: React.ReactNode;
  if (order.status === "cancelled") panel = <p className="muted">This order was cancelled.</p>;
  else if (order.status === "authorized" || order.status === "captured")
    panel = <p className="pill ok">Approved and paid. Thank you!</p>;
  else if (!gate.ok) panel = <p className="error small">This proof isn&apos;t ready yet. The shop is still finalizing it.</p>;
  else
    panel = (
      <ProofCheckout
        orderId={order.id}
        versionHash={hash}
        approved={approved}
        approvedBy={order.approval?.approvedBy.name}
        clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""}
        currency={order.pricing.currency}
      />
    );

  return (
    <>
      <h1>Proof for {order.title}</h1>
      <p className="muted">
        Hi {order.customerName || "there"}, please check the specification, the artwork and the amount below. You
        approve this exact version; if anything changes later, we&apos;ll ask you to approve again.
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
          {exceptions.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Exceptions you are accepting</h3>
              <ul className="evidence">
                {exceptions.map((x) => (
                  <li key={x.findingId}>
                    <b>{x.title}</b> — {x.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {designs.map((d) => {
            const v = d.versions?.at(-1);
            if (!v) return null;
            return (
              <div key={d.id} style={{ marginTop: 16 }}>
                <h3>
                  Artwork to be printed: {d.name}{" "}
                  <span className="small muted">
                    version {v.version} · {v.sha256.slice(0, 12)}
                  </span>
                </h3>
                {v.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${order.id}/${v.file}`} alt={d.name} className="thumb" />
                ) : (
                  <a href={`/api/files/${order.id}/${v.file}`} target="_blank" rel="noreferrer">
                    Open {d.name}
                  </a>
                )}
              </div>
            );
          })}
        </div>
        <div className="panel">
          <h2>Approve &amp; pay</h2>
          {gate.amount != null && (
            <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
              {gate.amount.toFixed(2)} {order.pricing.currency}
            </p>
          )}
          <p className="small muted">
            {order.pricing.quantity} × {order.pricing.unitPrice?.toFixed(2)} {order.pricing.currency}. PayPal holds
            the payment when you approve, and the shop captures it only when production starts.
          </p>
          <p className="small muted">
            Version <code>{hash.slice(0, 12)}</code>
          </p>
          {panel}
        </div>
      </div>
    </>
  );
}
