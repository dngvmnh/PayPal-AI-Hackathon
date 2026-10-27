import { SPEC_LABELS, SPEC_FIELDS, type Order } from "./types.ts";
import { paymentGate, specHash } from "./gate.ts";

// PayPal REST (Orders v2 + Payments v2), sandbox by default.
const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function accessToken(): Promise<string> {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function call<T>(method: string, pathname: string, body?: unknown, requestId?: string): Promise<T> {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayPal ${method} ${pathname} failed: ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

/**
 * Create a PayPal order for the approved spec. intent=AUTHORIZE: funds are held when the
 * customer approves the proof and captured only when the merchant starts production.
 * custom_id carries the spec hash, so the payment is tied to one exact approved version.
 */
export async function createPayPalOrder(order: Order): Promise<{ id: string; specHash: string }> {
  const gate = paymentGate(order);
  if (!gate.ok || gate.amount == null) throw new Error(`Payment blocked: ${gate.reasons.join(" ")}`);
  const hash = specHash(order);
  const currency = order.pricing.currency || "USD";
  const value = gate.amount.toFixed(2);
  const specLine = SPEC_FIELDS.filter((f) => order.spec[f])
    .map((f) => `${SPEC_LABELS[f]}: ${order.spec[f]}`)
    .join("; ");

  const created = await call<{ id: string }>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: `${order.id}:${hash}`,
          invoice_id: `PP-${order.id}-${hash.slice(0, 6)}`,
          description: order.title.slice(0, 127),
          soft_descriptor: "PROOFPAY",
          amount: {
            currency_code: currency,
            value,
            breakdown: { item_total: { currency_code: currency, value } },
          },
          items: [
            {
              name: (order.spec.product ?? order.title).slice(0, 127),
              description: specLine.slice(0, 127),
              quantity: String(order.pricing.quantity),
              unit_amount: { currency_code: currency, value: order.pricing.unitPrice!.toFixed(2) },
              category: "PHYSICAL_GOODS",
            },
          ],
        },
      ],
    },
    `create-${order.id}-${hash}`,
  );
  return { id: created.id, specHash: hash };
}

interface AuthorizeResponse {
  status: string;
  purchase_units: { payments: { authorizations: { id: string; status: string }[] } }[];
}

export async function authorizePayPalOrder(paypalOrderId: string) {
  const res = await call<AuthorizeResponse>(
    "POST",
    `/v2/checkout/orders/${paypalOrderId}/authorize`,
    {},
    `authorize-${paypalOrderId}`,
  );
  const auth = res.purchase_units[0]?.payments.authorizations[0];
  return { status: res.status, authorizationId: auth?.id };
}

export async function captureAuthorization(authorizationId: string) {
  const res = await call<{ id: string; status: string }>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { final_capture: true },
    `capture-${authorizationId}`,
  );
  return { captureId: res.id, status: res.status };
}
