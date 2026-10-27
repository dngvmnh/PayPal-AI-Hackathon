import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paymentGate, specHash } from "../lib/gate.ts";
import { applyAnalysis, parseNumber, resolveFinding, setSpecField } from "../lib/orders.ts";
import { splitThread } from "../lib/sample.ts";
import { AIAnalysis, type Order } from "../lib/types.ts";

const fixture = AIAnalysis.parse(
  JSON.parse(readFileSync("samples/riverside-5k/demo-analysis.json", "utf8")),
);

function draft(): Order {
  return {
    id: "t1",
    createdAt: "2026-01-01T00:00:00Z",
    title: "Test",
    customerName: "Dana",
    customerEmail: "",
    sources: [],
    spec: {},
    pricing: { quantity: null, unitPrice: null, currency: "USD" },
    status: "draft",
  };
}

test("gate is closed before the AI check runs", () => {
  const g = paymentGate(draft());
  assert.equal(g.ok, false);
  assert.match(g.reasons.join(" "), /not been run/);
});

test("open blocking findings keep payment blocked", () => {
  const order = applyAnalysis(draft(), fixture, { model: "m", demo: true });
  assert.equal(order.status, "needs_review");
  assert.equal(paymentGate(order).ok, false);
  assert.equal(paymentGate(order).amount, 1425);
});

test("settling every blocking finding unlocks payment", () => {
  let order = applyAnalysis(draft(), fixture, { model: "m", demo: true });
  for (const f of order.analysis!.findings) {
    if (f.severity === "blocking") {
      order = resolveFinding(order, f.id, { status: "resolved", value: f.suggestedValue ?? "x" });
    }
  }
  const g = paymentGate(order);
  assert.equal(g.ok, true, g.reasons.join(" "));
  assert.equal(order.status, "ready_for_proof");
  assert.equal(g.amount, 1425);
});

test("resolving quantity updates the payable amount", () => {
  let order = applyAnalysis(draft(), fixture, { model: "m", demo: true });
  const qty = order.analysis!.findings.find((f) => f.field === "quantity")!;
  order = resolveFinding(order, qty.id, { status: "resolved", value: "200 shirts" });
  assert.equal(order.pricing.quantity, 200);
  assert.equal(paymentGate(order).amount, 1900);
});

test("resolving requires a value", () => {
  const order = applyAnalysis(draft(), fixture, { model: "m", demo: true });
  assert.throws(() => resolveFinding(order, "f1", { status: "resolved", value: " " }));
});

test("spec hash changes when the spec changes", () => {
  const order = applyAnalysis(draft(), fixture, { model: "m", demo: true });
  const before = specHash(order);
  assert.equal(specHash(order), before);
  assert.notEqual(specHash(setSpecField(order, "garment_color", "Black")), before);
});

test("parseNumber handles currency and commas", () => {
  assert.equal(parseNumber("$1,425.00", false), 1425);
  assert.equal(parseNumber("150 shirts", true), 150);
  assert.equal(parseNumber("n/a", true), null);
});

test("splitThread splits on header lines", () => {
  const parts = splitThread(readFileSync("samples/riverside-5k/messages.txt", "utf8"));
  assert.equal(parts.length, 4);
  assert.match(parts[3].text, /150 shirts/);
});

test("fixture evidence references real sample source ids", () => {
  const ids = new Set(["brief", "msg-1", "msg-2", "msg-3", "msg-4", "design-front"]);
  for (const f of fixture.findings) for (const e of f.evidence) assert.ok(ids.has(e.sourceId), e.sourceId);
});

test("fixture reports at most one finding per field", () => {
  const fields = fixture.findings.map((f) => f.field);
  assert.equal(new Set(fields).size, fields.length);
});
