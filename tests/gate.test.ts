import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentArtworkHashes, paymentGate, versionHash } from "../lib/gate.ts";
import {
  addArtworkVersion,
  markResolvedByArtwork,
  parseNumber,
  recordFailedCheck,
  resolveFinding,
  setSpecField,
} from "../lib/orders.ts";
import { splitThread } from "../lib/sample.ts";
import type { ArtworkVerification, Order } from "../lib/types.ts";
import { checked, draft, fixture, settled } from "./helpers.ts";

const id = (o: Order, field: string) => o.analysis!.findings.find((f) => f.field === field)!.id;

/** Mark the print_text finding as an artwork error (normally set by the AI, AI-3). */
function withArtworkFinding(): Order {
  const o = checked();
  o.analysis!.findings.find((f) => f.field === "print_text")!.requiresArtworkFix = true;
  return o;
}

test("gate is closed before the AI check runs", () => {
  const g = paymentGate(draft());
  assert.equal(g.ok, false);
  assert.match(g.reasons.join(" "), /not been run/);
});

test("open findings block approval; settling them opens the gate", () => {
  assert.equal(checked().status, "needs_review");
  const order = settled();
  assert.deepEqual(paymentGate(order).reasons, []);
  assert.equal(order.status, "ready_for_approval");
  assert.equal(paymentGate(order).amount, 1425);
});

test("warnings block until handled; info never blocks", () => {
  let o = checked();
  o.analysis!.findings.forEach((f) => (f.severity = f.severity === "blocking" ? "warning" : f.severity));
  for (const f of o.analysis!.findings.filter((x) => x.severity === "warning").slice(1)) {
    o = resolveFinding(o, f.id, { type: "confirm", value: f.suggestedValue! });
  }
  assert.equal(paymentGate(o).ok, false);
  const last = o.analysis!.findings.find((f) => f.status === "open" && f.severity === "warning")!;
  o = resolveFinding(o, last.id, { type: "waive", reason: "Customer confirmed by phone" });
  assert.equal(paymentGate(o).ok, true); // the remaining info finding is still open
});

test("resolving quantity updates the payable amount", () => {
  const o = resolveFinding(checked(), id(checked(), "quantity"), { type: "confirm", value: "200 shirts" });
  assert.equal(o.pricing.quantity, 200);
  assert.equal(paymentGate(o).amount, 1900);
});

test("confirm requires a value", () => {
  assert.throws(() => resolveFinding(checked(), "f1", { type: "confirm", value: " " }), /value/);
});

test("artwork findings can't be confirmed or waived", () => {
  const o = withArtworkFinding();
  const f = id(o, "print_text");
  assert.throws(() => resolveFinding(o, f, { type: "confirm", value: "x" }), /artwork error/);
  assert.throws(() => resolveFinding(o, f, { type: "waive", reason: "looks fine to me" }), /can't be waived/);
});

test("an artwork finding forced to 'resolved' still blocks the gate", () => {
  const o = settled();
  o.analysis!.findings.find((f) => f.field === "print_text")!.requiresArtworkFix = true;
  assert.equal(paymentGate(o).ok, false);
  assert.match(paymentGate(o).reasons.join(" "), /verified corrected file or a dismissal/);
});

test("waive needs a clear reason", () => {
  assert.throws(() => resolveFinding(checked(), "f1", { type: "waive", reason: "ok" }), /clear reason/);
});

test("dismissing an artwork finding needs a reason and the 'checked myself' tick, and is recorded", () => {
  const o = withArtworkFinding();
  const f = id(o, "print_text");
  assert.throws(() => resolveFinding(o, f, { type: "dismiss", reason: "AI misread the year" }), /checked the artwork/);
  const d = resolveFinding(o, f, { type: "dismiss", reason: "AI misread the year", checkedArtworkMyself: true });
  const finding = d.analysis!.findings.find((x) => x.id === f)!;
  assert.equal(finding.status, "dismissed_ai_error");
  assert.equal(finding.dismissal!.artworkHashes["design-front"], "hash-v1");
  assert.ok(d.history.some((h) => h.type === "finding_dismissed"));
});

test("a dismissed artwork finding no longer forces a corrected file", () => {
  let o = withArtworkFinding();
  for (const f of o.analysis!.findings) {
    if (f.severity === "info") continue;
    o = f.requiresArtworkFix
      ? resolveFinding(o, f.id, { type: "dismiss", reason: "Year on the file is correct", checkedArtworkMyself: true })
      : resolveFinding(o, f.id, { type: "confirm", value: f.suggestedValue! });
  }
  assert.deepEqual(paymentGate(o).reasons, []);
});

test("invalid evidence: value must be typed by hand", () => {
  const o = checked();
  const f = o.analysis!.findings.find((x) => x.field === "quantity")!;
  f.evidenceValid = false;
  assert.throws(() => resolveFinding(o, f.id, { type: "confirm", value: "150" }), /type the correct value/i);
  const r = resolveFinding(o, f.id, { type: "confirm", value: "150", typedByHand: true });
  assert.equal(r.analysis!.findings.find((x) => x.id === f.id)!.acceptedDespiteInvalidEvidence, true);
});

test("a failed check blocks approval", () => {
  const o = recordFailedCheck(settled(), "timeout", currentArtworkHashes(settled()));
  assert.equal(o.status, "needs_review");
  assert.match(paymentGate(o).reasons.join(" "), /failed: timeout/);
});

test("uploading a new artwork version makes the check stale", () => {
  const o = addArtworkVersion(settled(), "design-front", { file: "b.png", mimeType: "image/png", sha256: "hash-v2" });
  assert.equal(o.sources[1].versions!.length, 2);
  assert.equal(o.sources[1].file, "b.png");
  assert.match(paymentGate(o).reasons.join(" "), /Artwork changed/);
});

// ---- verified corrected artwork (backstop for AI-5a) ----

function awaitingArtwork(): Order {
  let o = settled(checked());
  const f = id(o, "print_text");
  o = resolveFinding(o, f, { type: "reopen" });
  o.analysis!.findings.find((x) => x.id === f)!.requiresArtworkFix = true;
  o = resolveFinding(o, f, {
    type: "require_artwork",
    requiredFields: [
      { field: "year", value: "2026" },
      { field: "url", value: "riverside5k.org" },
    ],
  });
  o = addArtworkVersion(o, "design-front", { file: "v2.png", mimeType: "image/png", sha256: "hash-v2" });
  return applyRecheck(o);
}

/** Simulate a successful re-check that read the current artwork and kept the finding decisions. */
function applyRecheck(o: Order): Order {
  const copy = structuredClone(o);
  copy.analysis!.artworkHashes = currentArtworkHashes(copy);
  copy.analysis!.status = "succeeded";
  return copy;
}

const pass = (field: ArtworkVerification["field"], expected: string): ArtworkVerification => ({
  findingId: "",
  field,
  expected,
  observed: expected,
  matches: true,
  codeCheck: "pass",
});

test("artwork finding clears only when every required field is verified", () => {
  const o = awaitingArtwork();
  const f = id(o, "print_text");
  const v = [pass("year", "2026"), pass("url", "riverside5k.org")].map((x) => ({ ...x, findingId: f }));
  assert.throws(() => markResolvedByArtwork(o, f, v.slice(0, 1)), /url/);
  assert.throws(
    () => markResolvedByArtwork(o, f, [{ ...v[0], codeCheck: "fail", reason: "found {2025, 2026}" }, v[1]]),
    /2025, 2026/,
  );
  const done = markResolvedByArtwork(o, f, v);
  assert.equal(done.analysis!.findings.find((x) => x.id === f)!.status, "resolved_by_artwork");
  assert.deepEqual(paymentGate(done).reasons, []);
});

test("artwork verification refuses a check that read an older file", () => {
  const o = awaitingArtwork();
  o.analysis!.artworkHashes = { "design-front": "hash-v1" };
  const f = id(o, "print_text");
  assert.throws(() => markResolvedByArtwork(o, f, []), /current artwork/);
});

test("require_artwork validates the required fields", () => {
  const o = checked();
  assert.throws(() => resolveFinding(o, "f1", { type: "require_artwork", requiredFields: [] }), /at least one/);
  assert.throws(
    () => resolveFinding(o, "f1", { type: "require_artwork", requiredFields: [{ field: "year", value: " " }] }),
    /empty/,
  );
});

// ---- misc ----

test("version hash covers spec, artwork and waived exceptions", () => {
  const o = settled();
  const h = versionHash(o);
  assert.equal(versionHash(structuredClone(o)), h);
  assert.notEqual(versionHash(setSpecField(o, "garment_color", "Black")), h);
  assert.notEqual(versionHash(addArtworkVersion(o, "design-front", { file: "c.png", mimeType: "image/png", sha256: "x" })), h);
  const waived = resolveFinding(resolveFinding(o, "f1", { type: "reopen" }), "f1", { type: "waive", reason: "Customer accepted on call" });
  assert.notEqual(versionHash(waived), h);
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
