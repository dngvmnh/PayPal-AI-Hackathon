import { SPEC_LABELS, SPEC_FIELDS, type Order } from "./types.ts";
import { hasValidApproval, paypalCustomId } from "./orders.ts";

// PayPal REST (Orders v2 + Payments v2 + webhook verification), sandbox by default.
const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function accessToken(): Promise<string> {
  if (!paypalConfigured()) throw new Error("PayPal sandbox credentials are not set (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).");
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
 * Create a PayPal order for the version the customer approved. intent=AUTHORIZE: funds are held at approval
 * and captured only when the merchant starts production. custom_id carries order, iteration and version hash,
 * so the payment points to one exact approved version.
 */
export async function createPayPalOrder(order: Order): Promise<string> {
  if (!hasValidApproval(order)) throw new Error("The customer must approve the current version first.");
  const approval = order.approval!;
  const { currency, quantity, unitPrice } = approval.pricing;
  const value = approval.amount.toFixed(2);
  const specLine = SPEC_FIELDS.filter((f) => approval.spec[f])
    .map((f) => `${SPEC_LABELS[f]}: ${approval.spec[f]}`)
    .join("; ");

  const created = await call<{ id: string }>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: paypalCustomId(order),
          invoice_id: `PP-${order.id}-${order.iteration}-${approval.versionHash.slice(0, 8)}`,
          description: order.title.slice(0, 127),
          soft_descriptor: "PROOFPAY",
          amount: {
            currency_code: currency,
            value,
            breakdown: { item_total: { currency_code: currency, value } },
          },
          items: [
            {
              name: (approval.spec.product ?? order.title).slice(0, 127),
              description: specLine.slice(0, 127),
              quantity: String(quantity),
              unit_amount: { currency_code: currency, value: unitPrice.toFixed(2) },
              category: "PHYSICAL_GOODS",
            },
          ],
        },
      ],
    },
    `create-${order.id}-${order.iteration}-${approval.versionHash.slice(0, 16)}`,
  );
  return created.id;
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
  if (!auth?.id) throw new Error(`PayPal returned no authorization (status ${res.status}).`);
  return { status: res.status, authorizationId: auth.id };
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

/** Release the held funds. PayPal answers 204 No Content on success. */
export async function voidAuthorization(authorizationId: string): Promise<void> {
  await call("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, `void-${authorizationId}`);
}

/**
 * Verify a webhook delivery with PayPal (POST /v1/notifications/verify-webhook-signature).
 * Requires PAYPAL_WEBHOOK_ID, the id of the webhook registered in the developer dashboard.
 */
export async function verifyWebhookSignature(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set.");
  const h = (name: string) => headers.get(name) ?? "";
  const res = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: h("paypal-auth-algo"),
    cert_url: h("paypal-cert-url"),
    transmission_id: h("paypal-transmission-id"),
    transmission_sig: h("paypal-transmission-sig"),
    transmission_time: h("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  });
  return res.verification_status === "SUCCESS";
}
