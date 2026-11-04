import Link from "next/link";
import { listOrders } from "@/lib/store.ts";
import { paymentGate } from "@/lib/gate.ts";
import { StatusPill } from "./components/status.tsx";
import { SampleButton } from "./components/SampleButton.tsx";

export const dynamic = "force-dynamic";

const HOW = [
  {
    color: "yellow",
    title: "AI checks every source",
    text: "The brief, the customer's messages and the artwork are compared for mismatches, and each flag quotes its sources.",
  },
  {
    color: "violet",
    title: "The merchant settles it",
    text: "Confirm the value, waive with a reason, or fix the artwork. A corrected file is checked field by field.",
  },
  {
    color: "mint",
    title: "The customer approves and pays",
    text: "They approve one exact version. PayPal holds the money until production starts, and any change means a new approval.",
  },
];

export default async function Home() {
  const orders = await listOrders();
  return (
    <>
      <section className="hero">
        <h1>Catch print mistakes before anyone pays.</h1>
        <p>
          AI-assisted verification backed by merchant and customer confirmation, for custom t-shirt orders. The PayPal
          payment is tied to the exact version the customer approved.
        </p>
        <div className="row">
          <SampleButton />
          <Link href="/orders/new" className="button primary">
            New order
          </Link>
        </div>
      </section>

      <section className="how" aria-label="How it works">
        {HOW.map((step, i) => (
          <div key={step.title} className={`how-card ${step.color}`}>
            <span className="how-number">{i + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </div>
        ))}
      </section>

      <h2>Orders</h2>
      {orders.length === 0 ? (
        <div className="panel empty">
          <h3>No orders yet</h3>
          <p className="muted">Load the sample order to see the full flow.</p>
        </div>
      ) : (
        <div className="panel table-panel">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Open issues</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const open = o.analysis?.findings.filter((f) => f.status === "open" && f.severity !== "info").length;
                const amount = paymentGate(o).amount;
                return (
                  <tr key={o.id}>
                    <td data-label="Order">
                      <Link href={`/orders/${o.id}`}>{o.title}</Link>
                    </td>
                    <td data-label="Customer">{o.customerName || "—"}</td>
                    <td data-label="Open issues">{open ?? "—"}</td>
                    <td data-label="Amount">{amount != null ? `${amount.toFixed(2)} ${o.pricing.currency}` : "—"}</td>
                    <td data-label="Status">
                      <StatusPill status={o.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
