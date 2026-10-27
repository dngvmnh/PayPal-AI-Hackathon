import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store.ts";
import { paymentGate } from "@/lib/gate.ts";
import { paypalConfigured } from "@/lib/paypal.ts";
import { OrderWorkspace } from "@/app/components/OrderWorkspace.tsx";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  return (
    <OrderWorkspace
      order={order}
      gate={paymentGate(order)}
      aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
      paypalConfigured={paypalConfigured()}
    />
  );
}
