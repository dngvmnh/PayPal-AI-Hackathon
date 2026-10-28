// End-to-end check of the approval and payment flow against a running app (demo AI + mock PayPal).
//   terminal 1: npm run mock:paypal
//   terminal 2: npm run build && PAYPAL_API_BASE=http://localhost:4010 PAYPAL_CLIENT_ID=x PAYPAL_CLIENT_SECRET=x \
//               PAYPAL_WEBHOOK_ID=x npm start
//   terminal 3: npm run e2e            (APP_URL defaults to http://localhost:3000)
const B = process.env.APP_URL ?? "http://localhost:3000";
let failures = 0;

async function post(path, body = {}, headers = {}) {
  const r = await fetch(B + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { code: r.status, json: await r.json().catch(() => ({})) };
}

function expect(label, r, code, check = () => true) {
  const ok = r.code === code && check(r.json);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(46)} ${r.code} ${r.json.error ?? r.json.status ?? ""}`);
  return r.json;
}

const { id } = (await post("/api/orders/sample")).json;
const order = `/api/orders/${id}`;
const analyzed = expect("AI check (demo fixture)", await post(`${order}/analyze`), 200, (o) => o.status === "needs_review");
expect("approve with open findings is refused", await post(`${order}/approve`, { name: "Dana" }), 400);
expect("waive needs a clear reason", await post(`${order}/findings/f1`, { type: "waive", reason: "ok" }), 400);
for (const f of analyzed.analysis.findings.filter((f) => f.severity !== "info")) {
  await post(`${order}/findings/${f.id}`, { type: "confirm", value: f.suggestedValue });
}
expect("approve a stale displayed version is refused", await post(`${order}/approve`, { name: "Dana", versionHash: "x" }), 400);
const approved = expect("customer approves", await post(`${order}/approve`, { name: "Dana Whitfield" }), 200, (o) => o.status === "approved");
expect("create PayPal order", await post(`${order}/paypal/create`), 200, (o) => o.id);
expect("authorize", await post(`${order}/paypal/authorize`), 200, (o) => o.status === "authorized");
expect("edit while authorized is refused", await post(`${order}/spec`, { field: "garment_color", value: "Black" }), 400);
expect(
  "void & reopen",
  await post(`${order}/paypal/void`, { reopen: true, reason: "Customer wants black shirts" }),
  200,
  (o) => o.iteration === 2 && o.status === "ready_for_approval",
);
await post(`${order}/spec`, { field: "garment_color", value: "Black" });
expect("payment without a new approval is refused", await post(`${order}/paypal/create`), 400);
const second = expect("customer approves revision 2", await post(`${order}/approve`, { name: "Dana Whitfield" }), 200);
expect("new approval has a new version", { code: 200, json: {} }, 200, () => second.approval.versionHash !== approved.approval.versionHash);
await post(`${order}/paypal/create`);
const auth = expect("authorize revision 2", await post(`${order}/paypal/authorize`), 200, (o) => o.status === "authorized");
const authId = auth.payments.at(-1).authorizationId;

const hook = (sig, event) => post("/api/paypal/webhook", event, { "paypal-transmission-sig": sig });
const capture = { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-WH", custom_id: `${id}:2:x`, supplementary_data: { related_ids: { authorization_id: authId } } } };
expect("webhook with a bad signature is rejected", await hook("bad", capture), 400);
expect("webhook capture completed", await hook("good", capture), 200);
expect("webhook replay is harmless", await hook("good", capture), 200);
const after = await (await fetch(`${B}${order}`)).json();
expect("order is captured, both iterations kept", { code: 200, json: after }, 200, (o) =>
  o.status === "captured" && o.payments.map((p) => p.status).join() === "voided,captured");

const health = await (await fetch(`${B}/api/health`)).json();
console.log(`\norder ${id} · PayPal API ${health.paypalApi}`);
if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
