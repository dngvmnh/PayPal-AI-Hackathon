import Link from "next/link";
import { listOrders } from "@/lib/store.ts";
import { paymentGate } from "@/lib/gate.ts";
import { StatusPill } from "./components/status.tsx";
import { SampleButton } from "./components/SampleButton.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const orders = await listOrders();
  return (
    <>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div>
          <h1>Orders</h1>
          <div className="muted">
            AI cross-checks the brief, the customer&apos;s messages, and the design files. PayPal checkout
            unlocks only once they agree.
          </div>
        </div>
        <div className="row">
          <SampleButton />
          <Link href="/orders/new" className="button primary">
            New order
          </Link>
        </div>
      </div>
      <div className="panel">
        {orders.length === 0 ? (
          <p className="muted">No orders yet. Load the sample order to see the full flow.</p>
        ) : (
          <table>
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
                    <td>
                      <Link href={`/orders/${o.id}`}>{o.title}</Link>
                    </td>
                    <td>{o.customerName}</td>
                    <td>{open ?? "—"}</td>
                    <td>{amount != null ? `${amount.toFixed(2)} ${o.pricing.currency}` : "—"}</td>
                    <td>
                      <StatusPill status={o.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
