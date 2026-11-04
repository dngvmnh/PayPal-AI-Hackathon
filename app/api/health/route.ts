import { NextResponse } from "next/server";
import { liveAiConfigured } from "@/lib/ai.ts";
import { paypalConfigured } from "@/lib/paypal.ts";

/** Health check for the host, and a quick way to see which integrations are configured (no secrets). */
export function GET() {
  return NextResponse.json({
    ok: true,
    ai: liveAiConfigured() ? "live" : "demo",
    paypal: paypalConfigured() ? "configured" : "missing",
    paypalWebhook: process.env.PAYPAL_WEBHOOK_ID ? "configured" : "missing",
    paypalApi: process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com",
  });
}
