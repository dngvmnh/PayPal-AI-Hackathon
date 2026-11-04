// PayPal sandbox helper for DG-2 (live run) and the webhook registration. Reads the keys from .env.local.
//   npm run sandbox -- check                  credentials work, and what the running app has configured
//   npm run sandbox -- webhook <public-url>   register (or update) the webhook for <public-url>/api/paypal/webhook
//   npm run sandbox -- webhooks               list the app's webhooks
//   npm run sandbox -- live                   DG-2: sample order → approve in the browser → authorize → capture,
//                                             then a second order → authorize → void & reopen
//   npm run sandbox -- order <paypal-order-id>  status and custom_id of a PayPal order
// The app must be running for `check` and `live` (APP_URL, default http://localhost:3000), started with the same keys.
const API = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
const APP = process.env.APP_URL ?? "http://localhost:3000";
const EVENTS = [
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

let token;
async function paypal(method, pathname, body) {
  if (!token) {
    const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
    if (!id || !secret) fail("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set. Fill in .env.local first.");
    const res = await fetch(`${API}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) fail(`PayPal auth failed: ${res.status} ${await res.text()}`);
    token = (await res.json()).access_token;
  }
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`PayPal ${method} ${pathname} failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function app(method, pathname, body) {
  const res = await fetch(`${APP}${pathname}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((e) => fail(`App not reachable at ${APP} (${e.cause?.code ?? e.message}). Start it first.`));
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`App ${method} ${pathname} failed: ${res.status} ${json.error ?? JSON.stringify(json)}`);
  return json;
}

async function check() {
  await paypal("GET", "/v1/notifications/webhooks");
  console.log(`PayPal credentials ok (${API})`);
  const health = await app("GET", "/api/health");
  console.log(`App at ${APP}:`, health);
  if (health.paypal !== "configured") fail("The app has no PayPal keys: restart it after filling in .env.local.");
  if (health.paypalApi !== API) fail(`The app talks to ${health.paypalApi}, this script to ${API}.`);
}

async function webhook(base) {
  if (!base?.startsWith("https://")) fail("Usage: npm run sandbox -- webhook https://<public host>");
  const url = `${base.replace(/\/+$/, "")}/api/paypal/webhook`;
  const { webhooks = [] } = await paypal("GET", "/v1/notifications/webhooks");
  const existing = webhooks.find((w) => w.url === url);
  let id;
  if (existing) {
    const have = existing.event_types.map((e) => e.name).sort().join();
    if (have !== [...EVENTS].sort().join()) {
      await paypal("PATCH", `/v1/notifications/webhooks/${existing.id}`, [
        { op: "replace", path: "/event_types", value: EVENTS.map((name) => ({ name })) },
      ]);
      console.log(`Updated the events of webhook ${existing.id}`);
    } else console.log(`Webhook already registered for ${url}`);
    id = existing.id;
  } else {
    id = (await paypal("POST", "/v1/notifications/webhooks", { url, event_types: EVENTS.map((name) => ({ name })) })).id;
    console.log(`Registered webhook for ${url}`);
  }
  console.log(`\nPAYPAL_WEBHOOK_ID=${id}\nSet it in .env.local and on the host, then restart / redeploy.`);
}

async function listWebhooks() {
  const { webhooks = [] } = await paypal("GET", "/v1/notifications/webhooks");
  if (!webhooks.length) console.log("No webhooks registered.");
  for (const w of webhooks) console.log(`${w.id}  ${w.url}  ${w.event_types.map((e) => e.name).join(", ")}`);
}

async function showOrder(id) {
  if (!id) fail("Usage: npm run sandbox -- order <paypal-order-id>");
  const o = await paypal("GET", `/v2/checkout/orders/${id}`);
  const unit = o.purchase_units?.[0] ?? {};
  console.log(`${o.id}  ${o.status}  ${unit.amount?.value} ${unit.amount?.currency_code}  custom_id=${unit.custom_id}`);
  for (const a of unit.payments?.authorizations ?? []) console.log(`  authorization ${a.id}  ${a.status}`);
  for (const c of unit.payments?.captures ?? []) console.log(`  capture ${c.id}  ${c.status}`);
}

// The live run, step by step, through the app's own API (the same calls the UI makes).
async function approvedSampleOrder(name) {
  const { id } = await app("POST", "/api/orders/sample");
  const order = `/api/orders/${id}`;
  const analyzed = await app("POST", `${order}/analyze`);
  // Same settling as scripts/e2e.mjs: demo mode can't re-check artwork, so artwork findings are dismissed.
  for (const f of analyzed.analysis.findings.filter((f) => f.severity !== "info")) {
    const artwork = f.requiresArtworkFix || f.evidenceStatus === "unverified";
    await app(
      "POST",
      `${order}/findings/${f.id}`,
      artwork
        ? { type: "dismiss", reason: "Checked the artwork file by hand for this payment test", checkedArtworkMyself: true }
        : { type: "confirm", value: f.suggestedValue },
    );
  }
  const approved = await app("POST", `${order}/approve`, { name });
  console.log(`\n${name}: order ${id}, approved version ${approved.approval.versionHash.slice(0, 16)}, ${approved.approval.amount}`);
  return { id, order, approved };
}

async function payInBrowser(order) {
  const { id: paypalOrderId } = await app("POST", `${order}/paypal/create`);
  const created = await paypal("GET", `/v2/checkout/orders/${paypalOrderId}`);
  const link = created.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  console.log(`PayPal order ${paypalOrderId}. Open this link and pay with the sandbox *personal* account:\n  ${link}`);
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const { status } = await paypal("GET", `/v2/checkout/orders/${paypalOrderId}`);
    if (status === "APPROVED") break;
    if (Date.now() > deadline) fail(`Still ${status} after 15 minutes; run again when ready.`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("Buyer approved.");
  const authorized = await app("POST", `${order}/paypal/authorize`);
  const auth = authorized.payments.at(-1);
  console.log(`Authorized: ${auth.authorizationId}`);
  return { paypalOrderId, authorizationId: auth.authorizationId };
}

async function checkCustomId(authorizationId, expected) {
  const a = await paypal("GET", `/v2/payments/authorizations/${authorizationId}`);
  const ok = a.custom_id === expected;
  console.log(`${ok ? "ok  " : "FAIL"} custom_id in PayPal = ${a.custom_id} (expected ${expected}), status ${a.status}`);
  return ok;
}

async function live() {
  await check();
  // A host still rolling out a deploy swaps instances mid-run and, on the free plan, loses the orders with it.
  if (!APP.includes("localhost") && (await app("GET", "/api/health")).paypalWebhook !== "configured") {
    fail("The host has no PAYPAL_WEBHOOK_ID yet: set it and wait for the redeploy to finish.");
  }
  let ok = true;

  const first = await approvedSampleOrder("Dana Whitfield");
  const one = await payInBrowser(first.order);
  ok = (await checkCustomId(one.authorizationId, customId(first))) && ok;
  const captured = await app("POST", `${first.order}/paypal/capture`);
  const capture = captured.payments.at(-1);
  console.log(`Captured: ${capture.captureId}, order status ${captured.status}`);
  ok = captured.status === "captured" && ok;

  const second = await approvedSampleOrder("Dana Whitfield (void test)");
  const two = await payInBrowser(second.order);
  ok = (await checkCustomId(two.authorizationId, customId(second))) && ok;
  const reopened = await app("POST", `${second.order}/paypal/void`, { reopen: true, reason: "Customer wants black shirts" });
  console.log(`Voided & reopened: iteration ${reopened.iteration}, status ${reopened.status}`);
  ok = reopened.iteration === 2 && reopened.status === "ready_for_approval" && ok;
  const voided = await paypal("GET", `/v2/payments/authorizations/${two.authorizationId}`);
  console.log(`PayPal authorization ${two.authorizationId}: ${voided.status}`);
  ok = voided.status === "VOIDED" && ok;

  // Webhooks reach the app only when it is public and the webhook is registered (`webhook <url>`), so run
  // `live` against the hosted app (APP_URL=https://...) to see them land.
  if ((await app("GET", "/api/health")).paypalWebhook === "configured" && !APP.includes("localhost")) {
    console.log("\nWaiting up to 2 minutes for PayPal's signed webhook events...");
    const deadline = Date.now() + 120_000;
    for (const [orderId, type] of [
      [first.id, "PAYMENT.CAPTURE.COMPLETED"],
      [second.id, "PAYMENT.AUTHORIZATION.VOIDED"],
    ]) {
      let seen;
      while (!seen && Date.now() < deadline) {
        const o = await app("GET", `/api/orders/${orderId}`);
        seen = o.payments.flatMap((p) => p.events).find((e) => e.id !== "api" && e.type === type);
        if (!seen) await new Promise((r) => setTimeout(r, 5000));
      }
      console.log(`${seen ? "ok  " : "FAIL"} webhook ${type} on order ${orderId}${seen ? ` (${seen.id})` : ""}`);
      ok = Boolean(seen) && ok;
    }
  }

  console.log(`\nSandbox ids for the README / screenshots:`);
  console.log(`  captured: order ${first.id}, PayPal order ${one.paypalOrderId}, capture ${capture.captureId}`);
  console.log(`  voided:   order ${second.id}, PayPal order ${two.paypalOrderId}, authorization ${two.authorizationId}`);
  if (!ok) fail("\nSome checks failed.");
  console.log("\nall checks passed");
}

function customId({ id, approved }) {
  return `${id}:${approved.iteration}:${approved.approval.versionHash.slice(0, 16)}`;
}

const [command, arg] = process.argv.slice(2);
const commands = { check, webhook: () => webhook(arg), webhooks: listWebhooks, live, order: () => showOrder(arg) };
if (!commands[command]) fail(`Commands: ${Object.keys(commands).join(", ")}. See the top of scripts/sandbox.mjs.`);
await commands[command]();
