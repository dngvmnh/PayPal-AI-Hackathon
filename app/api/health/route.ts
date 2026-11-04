import { aiConfigured, aiProvider, aiModel } from "@/lib/ai-config.ts";
import { NextResponse } from "next/server";
import { paypalConfigured } from "@/lib/paypal.ts";

/** Health check for the host, and a quick way to see which integrations are configured (no secrets). */
export function GET() {
  return NextResponse.json({
    ok: true,
    ai: aiConfigured() ? "live" : "demo",
    aiProvider: aiProvider(),
    aiModel: aiModel(),
    paypal: paypalConfigured() ? "configured" : "missing",
    paypalWebhook: process.env.PAYPAL_WEBHOOK_ID ? "configured" : "missing",
    paypalApi: process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com",
  });
}
