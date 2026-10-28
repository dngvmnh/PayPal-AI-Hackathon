import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store.ts";
import { currentArtworkHashes, paymentGate } from "@/lib/gate.ts";
import { paypalConfigured } from "@/lib/paypal.ts";
import { OrderWorkspace } from "@/app/components/OrderWorkspace.tsx";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const current = currentArtworkHashes(order);
  const read = order.analysis?.artworkHashes ?? {};
  const checkStale = Boolean(order.analysis) && Object.keys(current).some((k) => current[k] !== read[k]);
  return (
    <OrderWorkspace
      order={order}
      gate={paymentGate(order)}
      aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
      paypalConfigured={paypalConfigured()}
      checkStale={checkStale}
    />
  );
}
