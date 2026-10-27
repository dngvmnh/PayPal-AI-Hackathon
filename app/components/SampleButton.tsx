"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api.ts";

export function SampleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { id } = await post<{ id: string }>("/api/orders/sample");
        router.push(`/orders/${id}`);
      }}
    >
      {busy ? "Loading…" : "Load sample order (Riverside 5K)"}
    </button>
  );
}
