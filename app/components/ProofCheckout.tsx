"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { post } from "./api.ts";

export function ProofCheckout({ orderId, clientId, currency }: { orderId: string; clientId: string; currency: string }) {
  const router = useRouter();
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string>();

  if (!clientId) {
    return <p className="error small">PayPal is not configured (NEXT_PUBLIC_PAYPAL_CLIENT_ID is empty).</p>;
  }

  return (
    <>
      <label className="row" style={{ fontWeight: 400, gap: 8 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        I&apos;ve checked the specification and artwork, and approve it for printing.
      </label>
      <div style={{ marginTop: 12, opacity: approved ? 1 : 0.4, pointerEvents: approved ? "auto" : "none" }}>
        <PayPalScriptProvider options={{ clientId, currency, intent: "authorize" }}>
          <PayPalButtons
            style={{ layout: "vertical" }}
            disabled={!approved}
            createOrder={async () => (await post<{ id: string }>(`/api/orders/${orderId}/paypal/create`)).id}
            onApprove={async () => {
              await post(`/api/orders/${orderId}/paypal/authorize`);
              router.refresh();
            }}
            onError={(err) => setError(String(err))}
          />
        </PayPalScriptProvider>
      </div>
      {error && <p className="error small">{error}</p>}
    </>
  );
}
