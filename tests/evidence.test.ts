import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEvidence } from "../lib/evidence.ts";
import type { Source } from "../lib/types.ts";

const sources: Source[] = [
  { id: "brief", kind: "brief", name: "Brief", text: "Quantity: 120 shirts" },
  { id: "email", kind: "message", name: "Email", text: "We need 150 shirts now." },
  { id: "design", kind: "design", name: "Design", file: "front.png", mimeType: "image/png" },
];

function evidence(sourceId: string, quote: string) {
  return { sourceId, quote, value: "test" };
}

test("matching text quotes are verified, including whitespace differences", () => {
  const result = validateEvidence(
    { evidence: [evidence("brief", "Quantity:  120\nshirts")] },
    sources,
  );
  assert.equal(result.status, "verified");
  assert.deepEqual(result.problems, []);
});

test("a quote absent from the source is invalid", () => {
  const result = validateEvidence(
    { evidence: [evidence("email", "We need 200 shirts now.")] },
    sources,
  );
  assert.equal(result.status, "invalid");
});

test("an unknown or ambiguous source ID is invalid", () => {
  const missing = validateEvidence(
    { evidence: [evidence("missing", "Some quote")] },
    sources,
  );
  const duplicate = validateEvidence(
    { evidence: [evidence("brief", "Quantity: 120")] },
    [...sources, sources[0]],
  );
  assert.equal(missing.status, "invalid");
  assert.equal(duplicate.status, "invalid");
});

test("empty evidence and empty quotes are invalid", () => {
  assert.equal(validateEvidence({ evidence: [] }, sources).status, "invalid");
  assert.equal(
    validateEvidence({ evidence: [evidence("brief", "  ")] }, sources).status,
    "invalid",
  );
});

test("artwork descriptions remain unverified", () => {
  const result = validateEvidence(
    { evidence: [evidence("design", "The design shows 2025")] },
    sources,
  );
  assert.equal(result.status, "unverified");
});

test("invalid evidence takes priority over unverified artwork", () => {
  const result = validateEvidence(
    {
      evidence: [
        evidence("design", "The design shows 2025"),
        evidence("email", "A quote that does not exist"),
      ],
    },
    sources,
  );
  assert.equal(result.status, "invalid");
  assert.equal(result.problems.length, 2);
});

import { applyAnalysis } from "../lib/orders.ts";
import { currentArtworkHashes } from "../lib/gate.ts";
import { draft, fixture } from "./helpers.ts";

test("applyAnalysis records evidence validation on new findings", () => {
  const order = draft();
  const analysis = structuredClone(fixture);
  const template = analysis.findings[0];

  analysis.findings = [
    { ...template, evidence: [evidence("brief", "...")] },
    { ...template, evidence: [evidence("brief", "not in the source")] },
    { ...template, evidence: [evidence("design-front", "Visible artwork text")] },
  ];

  const result = applyAnalysis(order, analysis, {
    model: "test",
    demo: false,
    artworkHashes: currentArtworkHashes(order),
  });

  const findings = result.analysis!.findings;
  assert.deepEqual(
    findings.map((f) => f.evidenceStatus),
    ["verified", "invalid", "unverified"],
  );
  assert.deepEqual(
    findings.map((f) => f.evidenceValid),
    [true, false, false],
  );
  assert.ok(findings[1].evidenceProblems?.length);
  assert.ok(findings[2].evidenceProblems?.length);
});

import { resolveFinding } from "../lib/orders.ts";

test("Riverside artwork findings require an artwork fix", () => {
  const order = draft();

  const result = applyAnalysis(order, structuredClone(fixture), {
    model: "demo-fixture",
    demo: true,
    artworkHashes: currentArtworkHashes(order),
  });

  const findings = result.analysis!.findings;
  const printText = findings.find((f) => f.field === "print_text")!;
  const inkColors = findings.find((f) => f.field === "ink_colors")!;
  const quantity = findings.find((f) => f.field === "quantity")!;

  assert.equal(printText.requiresArtworkFix, true);
  assert.equal(inkColors.requiresArtworkFix, true);
  assert.notEqual(quantity.requiresArtworkFix, true);

  assert.throws(
    () => resolveFinding(result, printText.id, {
      type: "confirm",
      value: "Correct text",
      typedByHand: true,
    }),
    /artwork error/i,
  );
});