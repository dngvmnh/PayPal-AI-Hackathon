"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { post } from "./api.ts";

interface Props {
  orderId: string;
  versionHash: string;
  approved: boolean;
  approvedBy?: string;
  clientId: string;
  currency: string;
}

/** Step 1: approve this exact version (saved on the server). Step 2: pay with PayPal (authorization). */
export function ProofCheckout({ orderId, versionHash, approved, approvedBy, clientId, currency }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!approved) {
    return (
      <>
        <span className="pay-step">Step 1 of 2: approve</span>
        <label className="check-label">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I&apos;ve checked the specification, the artwork and the amount, and approve this version for printing.</span>
        </label>
        <label htmlFor="approver">Your name</label>
        <input id="approver" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="primary"
          style={{ marginTop: 12, width: "100%" }}
          disabled={!checked || !name.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await post(`/api/orders/${orderId}/approve`, { name, versionHash });
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Approve this version
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </>
    );
  }

  if (!clientId) {
    return <p className="error" role="alert">Approved by {approvedBy}. PayPal is not configured (NEXT_PUBLIC_PAYPAL_CLIENT_ID is empty).</p>;
  }

  return (
    <>
      <span className="pay-step">Step 2 of 2: pay</span>
      <p><span className="pill ok wrap">Approved by {approvedBy}</span></p>
      <div className="stack-top">
        <PayPalScriptProvider options={{ clientId, currency, intent: "authorize" }}>
          <PayPalButtons
            style={{ layout: "vertical" }}
            createOrder={async () => (await post<{ id: string }>(`/api/orders/${orderId}/paypal/create`)).id}
            onApprove={async () => {
              try {
                await post(`/api/orders/${orderId}/paypal/authorize`);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
              router.refresh();
            }}
            onError={(err) => setError(String(err))}
          />
        </PayPalScriptProvider>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
