import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store.ts";
import { paymentGate, versionHash, waivedExceptions } from "@/lib/gate.ts";
import { currentPayment, hasValidApproval } from "@/lib/orders.ts";
import { SPEC_FIELDS, SPEC_LABELS } from "@/lib/types.ts";
import { LocalTime } from "@/app/components/LocalTime.tsx";
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

  const payment = currentPayment(order);
  const lastVoided = [...order.payments].reverse().find((p) => p.status === "voided");
  const paid = order.status === "authorized" || order.status === "captured";

  let panel: React.ReactNode;
  if (order.status === "cancelled")
    panel = (
      <div className="notice">
        <b>This order was cancelled.</b>
        <p className="small">The PayPal authorization was voided, so no money was taken.</p>
      </div>
    );
  else if (paid && order.approval && payment)
    panel = (
      <div className="notice ok">
        <h3>{order.status === "captured" ? "Paid. Your order is in production." : "Approved and paid. Thank you!"}</h3>
        <table className="receipt">
          <tbody>
            <tr>
              <th>Amount</th>
              <td>
                {order.approval.amount.toFixed(2)} {order.approval.pricing.currency}
              </td>
            </tr>
            <tr>
              <th>Payment</th>
              <td>
                {order.status === "captured"
                  ? "Captured (production started)"
                  : "Authorized: held by PayPal, taken when production starts"}
              </td>
            </tr>
            <tr>
              <th>Approved by</th>
              <td>
                {order.approval.approvedBy.name}, <LocalTime iso={order.approval.approvedAt} />
              </td>
            </tr>
            <tr>
              <th>Version</th>
              <td>
                <code>{order.approval.versionHash.slice(0, 12)}</code>
              </td>
            </tr>
            <tr>
              <th>PayPal order</th>
              <td>
                <code>{payment.paypalOrderId}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  else if (!gate.ok) panel = <p className="notice warn">This proof isn&apos;t ready yet. The shop is still finalizing it.</p>;
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
      <div className="page-head">
        <h1>Proof for {order.title}</h1>
        <p className="muted">
          Hi {order.customerName || "there"}, please check the artwork, the specification and the amount below. You
          approve this exact version; if anything changes later, we&apos;ll ask you to approve again.
        </p>
      </div>
      <div className="grid-main">
        <div>
          {designs.map((d) => {
            const v = d.versions?.at(-1);
            if (!v) return null;
            return (
              <div key={d.id} className="panel">
                <h2>Artwork to be printed</h2>
                <h3>
                  {d.name}
                  <span className="artwork-meta">
                    Version {v.version} · {v.sha256.slice(0, 12)}
                  </span>
                </h3>
                {v.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${order.id}/${v.file}`} alt={d.name} className="thumb stack-top" />
                ) : (
                  <a href={`/api/files/${order.id}/${v.file}`} target="_blank" rel="noreferrer">
                    Open {d.name}
                  </a>
                )}
              </div>
            );
          })}
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
              <div className="notice warn stack-top">
                <h3>Exceptions you are accepting</h3>
                <ul className="evidence">
                  {exceptions.map((x) => (
                    <li key={x.findingId}>
                      <b>{x.title}</b> — {x.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className={`panel sticky-panel ${paid ? "receipt-first" : ""}`}>
          <h2>{paid ? "Your receipt" : "Approve & pay"}</h2>
          {gate.amount != null && (
            <div className="pay-amount">
              {gate.amount.toFixed(2)} {order.pricing.currency}
            </div>
          )}
          <p className="small muted">
            {order.pricing.quantity} × {order.pricing.unitPrice?.toFixed(2)} {order.pricing.currency}. PayPal holds
            the payment when you approve, and the shop captures it only when production starts.
          </p>
          <p className="small muted">
            Version <code>{hash.slice(0, 12)}</code>
            {order.iteration > 1 && <> · revision {order.iteration}</>}
          </p>
          {lastVoided && order.iteration > lastVoided.iteration && !payment && (
            <p className="notice warn small">
              The order changed after your earlier payment, so that payment was released. Please check this
              version and approve again.
            </p>
          )}
          {panel}
        </div>
      </div>
    </>
  );
}
