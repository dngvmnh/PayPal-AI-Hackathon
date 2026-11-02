// Local stand-in for the PayPal REST API, for testing the payment flow without sandbox credentials.
// It is not PayPal: it accepts any credentials and returns fixed-shape responses.
//   npm run mock:paypal            (listens on :4010)
//   PAYPAL_API_BASE=http://localhost:4010 PAYPAL_CLIENT_ID=x PAYPAL_CLIENT_SECRET=x PAYPAL_WEBHOOK_ID=x npm run dev
// Webhook signatures verify only when the "paypal-transmission-sig" header is "good".
import http from "node:http";

const PORT = Number(process.env.MOCK_PAYPAL_PORT ?? 4010);
let n = 0;
const calls = [];
const orders = new Map(); // id -> { body, status }
const auths = new Map(); // authorization id -> { status, custom_id }
const webhooks = [];

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(obj === undefined ? "" : JSON.stringify(obj));
    };
    const url = req.url ?? "";
    if (url === "/__calls") return send(200, calls);
    const json = req.headers["content-type"]?.includes("application/json") && body ? JSON.parse(body) : undefined;
    calls.push({ method: req.method, url, requestId: req.headers["paypal-request-id"], body: json });

    let m;
    if (url === "/v1/oauth2/token") return send(200, { access_token: "mock-token", expires_in: 3600 });
    if (url === "/v2/checkout/orders") {
      const id = `MOCK-ORDER-${++n}`;
      // There is no buyer here: orders count as approved right away.
      orders.set(id, { body: json, status: "APPROVED" });
      return send(201, { id, status: "CREATED" });
    }
    if ((m = url.match(/^\/v2\/checkout\/orders\/(.+)\/authorize$/))) {
      auths.set(`AUTH-${m[1]}`, { status: "CREATED", custom_id: orders.get(m[1])?.body?.purchase_units?.[0]?.custom_id });
      return send(201, {
        status: "COMPLETED",
        purchase_units: [{ payments: { authorizations: [{ id: `AUTH-${m[1]}`, status: "CREATED" }] } }],
      });
    }
    if (req.method === "GET" && (m = url.match(/^\/v2\/checkout\/orders\/([^/]+)$/))) {
      const o = orders.get(m[1]);
      if (!o) return send(404, { name: "RESOURCE_NOT_FOUND" });
      return send(200, {
        id: m[1],
        status: o.status,
        purchase_units: o.body?.purchase_units ?? [],
        links: [{ rel: "approve", href: `http://localhost:${PORT}/checkoutnow?token=${m[1]}` }],
      });
    }
    if ((m = url.match(/^\/v2\/payments\/authorizations\/(.+)\/capture$/))) {
      if (auths.has(m[1])) auths.get(m[1]).status = "CAPTURED";
      return send(201, { id: `CAP-${m[1]}`, status: "COMPLETED" });
    }
    if ((m = url.match(/^\/v2\/payments\/authorizations\/(.+)\/void$/))) {
      if (auths.has(m[1])) auths.get(m[1]).status = "VOIDED";
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "GET" && (m = url.match(/^\/v2\/payments\/authorizations\/([^/]+)$/))) {
      const a = auths.get(m[1]);
      return a ? send(200, { id: m[1], ...a }) : send(404, { name: "RESOURCE_NOT_FOUND" });
    }
    if (url === "/v1/notifications/webhooks") {
      if (req.method === "GET") return send(200, { webhooks });
      const hook = { id: `MOCK-WH-${webhooks.length + 1}`, url: json.url, event_types: json.event_types };
      webhooks.push(hook);
      return send(201, hook);
    }
    if (req.method === "PATCH" && (m = url.match(/^\/v1\/notifications\/webhooks\/(.+)$/))) {
      const hook = webhooks.find((w) => w.id === m[1]);
      if (!hook) return send(404, { name: "RESOURCE_NOT_FOUND" });
      for (const op of json) if (op.path === "/event_types") hook.event_types = op.value;
      return send(200, hook);
    }
    if (url === "/v1/notifications/verify-webhook-signature") {
      const ok = json?.transmission_sig === "good";
      return send(200, { verification_status: ok ? "SUCCESS" : "FAILURE" });
    }
    send(404, { name: "NOT_MOCKED", url });
  })
  .listen(PORT, () => console.log(`Mock PayPal API on http://localhost:${PORT}`));
