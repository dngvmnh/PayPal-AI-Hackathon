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
        <label className="row" style={{ fontWeight: 400, gap: 8 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I&apos;ve checked the specification, the artwork and the amount, and approve this version for printing.
        </label>
        <label htmlFor="approver">Your name</label>
        <input id="approver" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="primary"
          style={{ marginTop: 12 }}
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
        {error && <p className="error small">{error}</p>}
      </>
    );
  }

  if (!clientId) {
    return <p className="error small">Approved by {approvedBy}. PayPal is not configured (NEXT_PUBLIC_PAYPAL_CLIENT_ID is empty).</p>;
  }

  return (
    <>
      <p className="pill ok">Approved by {approvedBy}</p>
      <div style={{ marginTop: 12 }}>
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
      {error && <p className="error small">{error}</p>}
    </>
  );
}
