// Local stand-in for the PayPal REST API, for testing the payment flow without sandbox credentials.
// It is not PayPal: it accepts any credentials and returns fixed-shape responses.
//   npm run mock:paypal            (listens on :4010)
//   PAYPAL_API_BASE=http://localhost:4010 PAYPAL_CLIENT_ID=x PAYPAL_CLIENT_SECRET=x PAYPAL_WEBHOOK_ID=x npm run dev
// Webhook signatures verify only when the "paypal-transmission-sig" header is "good".
import http from "node:http";

const PORT = Number(process.env.MOCK_PAYPAL_PORT ?? 4010);
let n = 0;
const calls = [];

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
    if (url === "/v2/checkout/orders") return send(201, { id: `MOCK-ORDER-${++n}`, status: "CREATED" });
    if ((m = url.match(/^\/v2\/checkout\/orders\/(.+)\/authorize$/)))
      return send(201, {
        status: "COMPLETED",
        purchase_units: [{ payments: { authorizations: [{ id: `AUTH-${m[1]}`, status: "CREATED" }] } }],
      });
    if ((m = url.match(/^\/v2\/payments\/authorizations\/(.+)\/capture$/))) return send(201, { id: `CAP-${m[1]}`, status: "COMPLETED" });
    if (url.match(/^\/v2\/payments\/authorizations\/(.+)\/void$/)) {
      res.writeHead(204);
      return res.end();
    }
    if (url === "/v1/notifications/verify-webhook-signature") {
      const ok = json?.transmission_sig === "good";
      return send(200, { verification_status: ok ? "SUCCESS" : "FAILURE" });
    }
    send(404, { name: "NOT_MOCKED", url });
  })
  .listen(PORT, () => console.log(`Mock PayPal API on http://localhost:${PORT}`));
