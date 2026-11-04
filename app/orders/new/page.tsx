"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewOrder() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/orders", { method: "POST", body: new FormData(e.currentTarget) });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
      setBusy(false);
      return;
    }
    router.push(`/orders/${json.id}`);
  }

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <h1>New order</h1>
        <p className="muted">Drop in everything you have about the job. The AI check compares all of it.</p>
      </div>
      <div className="panel">
        <h2>The job</h2>
        <div className="grid2">
          <div>
            <label htmlFor="title" style={{ marginTop: 0 }}>Job title</label>
            <input id="title" name="title" placeholder="Riverside 5K volunteer shirts" required />
          </div>
          <div className="grid2">
            <div>
              <label htmlFor="customerName" style={{ marginTop: 0 }}>Customer</label>
              <input id="customerName" name="customerName" />
            </div>
            <div>
              <label htmlFor="customerEmail" style={{ marginTop: 0 }}>Email</label>
              <input id="customerEmail" name="customerEmail" type="email" />
            </div>
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>The sources</h2>
        <label htmlFor="brief">Order brief / work ticket</label>
        <textarea id="brief" name="brief" placeholder="Product, quantity, sizes, colors, text, price, due date…" />
        <label htmlFor="messages">Customer messages</label>
        <textarea
          id="messages"
          name="messages"
          placeholder={"Paste the email or chat thread. Separate messages with header lines like:\n--- Email · Mar 9 · Dana ---"}
        />
        <label htmlFor="designs">Design files</label>
        <input id="designs" name="designs" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
        <p className="hint">PNG, JPG, WebP, GIF, or PDF proofs. Up to 20 MB each.</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Create order"}
      </button>
    </form>
  );
}
