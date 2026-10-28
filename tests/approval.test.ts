import { test } from "node:test";
import assert from "node:assert/strict";
import { versionHash } from "../lib/gate.ts";
import {
  addArtworkVersion,
  approve,
  assertCanAuthorize,
  assertCanStartPayment,
  hasValidApproval,
  markAuthorized,
  markCaptured,
  markVoided,
  paypalCustomId,
  resolveFinding,
  setSpecField,
  startPayment,
} from "../lib/orders.ts";
import { applyPayPalEvent, eventMatchesOrder, orderIdFromEvent } from "../lib/webhooks.ts";
import type { Order } from "../lib/types.ts";
import { checked, settled } from "./helpers.ts";

const api = { eventId: "api", type: "TEST" };

function approved(): Order {
  return approve(settled(), { name: "Dana Whitfield", userAgent: "test" });
}

function authorized(): Order {
  return markAuthorized(startPayment(approved(), "PAYPAL-ORDER-1"), "AUTH-1", api);
}

test("approval needs a passing gate and a name", () => {
  assert.throws(() => approve(checked(), { name: "Dana" }), /Not ready for approval/);
  assert.throws(() => approve(settled(), { name: " " }), /name/);
});

test("approval is saved with spec, artwork hashes, amount and exceptions", () => {
  const o = approved();
  assert.equal(o.status, "approved");
  const a = o.approval!;
  assert.equal(a.versionHash, versionHash(o));
  assert.equal(a.amount, 1425);
  assert.deepEqual(a.artworkHashes, { "design-front": "hash-v1" });
  assert.equal(a.approvedBy.name, "Dana Whitfield");
  assert.equal(o.approvals.length, 1);
});

test("approving the same version twice doesn't create a second approval", () => {
  const o = approve(approved(), { name: "Dana Whitfield" });
  assert.equal(o.approvals.length, 1);
});

for (const [what, change] of [
  ["a spec edit", (o: Order) => setSpecField(o, "garment_color", "Black")],
  ["a price edit", (o: Order) => setSpecField(o, "unit_price", "$10.00")],
  ["new artwork", (o: Order) => addArtworkVersion(o, "design-front", { file: "v2.png", mimeType: "image/png", sha256: "hash-v2" })],
  [
    "a new waived exception",
    (o: Order) => resolveFinding(resolveFinding(o, "f1", { type: "reopen" }), "f1", { type: "waive", reason: "Customer accepted on call" }),
  ],
] as const) {
  test(`${what} cancels the approval`, () => {
    const o = change(approved());
    assert.equal(o.approval, undefined);
    assert.equal(hasValidApproval(o), false);
    assert.notEqual(o.status, "approved");
    assert.ok(o.history.some((h) => h.type === "approval_cancelled"));
    assert.equal(o.approvals.length, 1, "the cancelled approval stays in history");
  });
}

test("payment needs a current approval", () => {
  assert.throws(() => assertCanStartPayment(settled()), /approve the current version/);
  const o = startPayment(approved(), "PAYPAL-ORDER-1");
  assert.equal(o.payments[0].status, "created");
  assert.equal(paypalCustomId(o), `t1:1:${o.approval!.versionHash.slice(0, 16)}`);
});

test("authorize refuses if the order changed after approval", () => {
  const started = startPayment(approved(), "PAYPAL-ORDER-1");
  assert.doesNotThrow(() => assertCanAuthorize(started));
  const changed = setSpecField(started, "garment_color", "Black");
  assert.throws(() => assertCanAuthorize(changed), /changed after the customer approved/);
});

test("authorization locks the order", () => {
  const o = authorized();
  assert.equal(o.status, "authorized");
  assert.throws(() => setSpecField(o, "garment_color", "Black"), /locked/);
  assert.throws(() => resolveFinding(o, "f1", { type: "reopen" }), /locked/);
  assert.throws(
    () => addArtworkVersion(o, "design-front", { file: "v2.png", mimeType: "image/png", sha256: "h" }),
    /locked/,
  );
  assert.throws(() => approve(o, { name: "Dana" }), /locked/);
});

test("branch 1: authorize → capture", () => {
  const o = markCaptured(authorized(), "CAP-1", api);
  assert.equal(o.status, "captured");
  assert.equal(o.payments[0].captureId, "CAP-1");
});

test("branch 2a: authorize → void and cancel", () => {
  const o = markVoided(authorized(), { ...api, reopen: false, reason: "Customer cancelled" });
  assert.equal(o.status, "cancelled");
  assert.equal(o.payments[0].status, "voided");
  assert.throws(() => setSpecField(o, "garment_color", "Black"), /cancelled/);
});

test("branch 2b: authorize → void and reopen starts a new iteration that needs a new approval", () => {
  let o = markVoided(authorized(), { ...api, reopen: true, reason: "Customer wants black shirts" });
  assert.equal(o.iteration, 2);
  assert.equal(o.approval, undefined);
  assert.equal(o.status, "ready_for_approval");
  o = setSpecField(o, "garment_color", "Black");
  assert.throws(() => assertCanStartPayment(o), /approve/);
  o = approve(o, { name: "Dana Whitfield" });
  o = markAuthorized(startPayment(o, "PAYPAL-ORDER-2"), "AUTH-2", api);
  assert.equal(o.payments.length, 2);
  assert.deepEqual(o.payments.map((p) => p.status), ["voided", "authorized"]);
  assert.equal(o.approvals.length, 2);
  assert.equal(o.approvals[1].spec.garment_color, "Black");
});

test("capture or void without an authorization fails", () => {
  assert.throws(() => markCaptured(approved(), "CAP", api), /No authorization/);
  assert.throws(() => markVoided(approved(), { ...api, reopen: true, reason: "x" }), /No authorization/);
});

// ---- webhooks ----

const evt = (id: string, event_type: string, resource: object) => ({ id, event_type, resource });

test("webhook: custom_id identifies the order", () => {
  const o = startPayment(approved(), "PAYPAL-ORDER-1");
  const e = evt("WH-1", "PAYMENT.AUTHORIZATION.CREATED", { id: "AUTH-1", custom_id: paypalCustomId(o) });
  assert.equal(orderIdFromEvent(e), "t1");
});

test("webhook: authorization created, then capture completed", () => {
  let o = startPayment(approved(), "PAYPAL-ORDER-1");
  o = applyPayPalEvent(o, evt("WH-1", "PAYMENT.AUTHORIZATION.CREATED", { id: "AUTH-1" }));
  assert.equal(o.status, "authorized");
  assert.equal(o.payments[0].authorizationId, "AUTH-1");
  o = applyPayPalEvent(
    o,
    evt("WH-2", "PAYMENT.CAPTURE.COMPLETED", { id: "CAP-1", supplementary_data: { related_ids: { authorization_id: "AUTH-1" } } }),
  );
  assert.equal(o.status, "captured");
});

test("webhook: replayed events change nothing", () => {
  const e = evt("WH-1", "PAYMENT.AUTHORIZATION.CREATED", { id: "AUTH-1" });
  const once = applyPayPalEvent(startPayment(approved(), "PAYPAL-ORDER-1"), e);
  const twice = applyPayPalEvent(once, e);
  assert.equal(twice.payments[0].events.length, once.payments[0].events.length);
});

test("webhook: confirming our own authorization only adds an event", () => {
  const o = applyPayPalEvent(authorized(), evt("WH-1", "PAYMENT.AUTHORIZATION.CREATED", { id: "AUTH-1" }));
  assert.equal(o.status, "authorized");
  assert.equal(o.payments[0].events.at(-1)!.id, "WH-1");
});

test("webhook: a void done in PayPal reopens the order", () => {
  const o = applyPayPalEvent(authorized(), evt("WH-3", "PAYMENT.AUTHORIZATION.VOIDED", { id: "AUTH-1" }));
  assert.equal(o.iteration, 2);
  assert.equal(o.status, "ready_for_approval");
});

test("webhook: void event after our own void-and-reopen is just recorded", () => {
  const voided = markVoided(authorized(), { ...api, reopen: true, reason: "changes", authorizationId: "AUTH-1" });
  const o = applyPayPalEvent(voided, evt("WH-3", "PAYMENT.AUTHORIZATION.VOIDED", { id: "AUTH-1" }));
  assert.equal(o.iteration, 2, "no second reopen");
  assert.equal(o.payments[0].events.at(-1)!.id, "WH-3");
});

test("webhook: capture denied keeps the authorization", () => {
  const o = applyPayPalEvent(
    authorized(),
    evt("WH-4", "PAYMENT.CAPTURE.DENIED", { id: "CAP-X", supplementary_data: { related_ids: { authorization_id: "AUTH-1" } } }),
  );
  assert.equal(o.status, "authorized");
  assert.ok(o.history.some((h) => h.type === "capture_denied"));
});

test("webhook: fallback matching by PayPal ids", () => {
  const o = authorized();
  assert.ok(eventMatchesOrder(o, evt("WH", "PAYMENT.AUTHORIZATION.VOIDED", { id: "AUTH-1" })));
  assert.ok(eventMatchesOrder(o, evt("WH", "PAYMENT.CAPTURE.COMPLETED", { supplementary_data: { related_ids: { order_id: "PAYPAL-ORDER-1" } } })));
  assert.ok(!eventMatchesOrder(o, evt("WH", "PAYMENT.AUTHORIZATION.VOIDED", { id: "OTHER" })));
});
