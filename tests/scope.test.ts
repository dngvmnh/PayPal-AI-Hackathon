import { test } from "node:test";
import assert from "node:assert/strict";
import { AIAnalysis } from "../lib/types.ts";
import { applyAnalysis } from "../lib/orders.ts";
import { currentArtworkHashes } from "../lib/gate.ts";
import { draft, fixture } from "./helpers.ts";

test("finding outside the MVP scope is rejected", () => {
  const input = {
    ...structuredClone(fixture),
    findings: [
      { ...fixture.findings[0], field: "print_location" },
    ],
  };

  assert.equal(AIAnalysis.safeParse(input).success, false);
});

test("other spec fields can still be extracted", () => {
  const input = structuredClone(fixture);
  input.proposedSpec.push({
    field: "print_location",
    value: "Front center",
    confidence: "high",
  });

  assert.equal(AIAnalysis.safeParse(input).success, true);
});

test("all MVP finding fields are assigned to the correct group", () => {
  const expected = {
    quantity: "quantity_sizes",
    size_breakdown: "quantity_sizes",
    print_text: "text_dates",
    garment_color: "colors",
    ink_colors: "colors",
    unit_price: "pricing",
    total_price: "pricing",
  } as const;

  const input = structuredClone(fixture);
  input.findings = Object.keys(expected).map((field) => ({
    ...fixture.findings[0],
    field: field as keyof typeof expected,
    evidence: [{ sourceId: "brief", value: "...", quote: "..." }],
  }));

  const parsed = AIAnalysis.parse(input);
  const order = draft();
  const result = applyAnalysis(order, parsed, {
    model: "test",
    demo: false,
    artworkHashes: currentArtworkHashes(order),
  });

  for (const finding of result.analysis!.findings) {
    assert.equal(finding.checkGroup, expected[finding.field]);
  }
});

test("obvious artwork year and ink mismatches force artwork fix", () => {
  const input = structuredClone(fixture);

  const textTemplate = fixture.findings.find((f) => f.field === "print_text")!;
  const inkTemplate = fixture.findings.find((f) => f.field === "ink_colors")!;

  input.findings = [
    {
      ...textTemplate,
      requiresArtworkFix: false,
      suggestedValue: "EVENT 2026",
      evidence: [{
        sourceId: "design-front",
        value: "EVENT 2025",
        quote: "Artwork says EVENT 2025",
      }],
    },
    {
      ...inkTemplate,
      requiresArtworkFix: false,
      suggestedValue: "white",
      evidence: [{
        sourceId: "design-front",
        value: "white, red",
        quote: "Artwork uses white and red",
      }],
    },
  ];

  const order = draft();
  const result = applyAnalysis(order, input, {
    model: "test",
    demo: false,
    artworkHashes: currentArtworkHashes(order),
  });

  assert.equal(
    result.analysis!.findings.find((f) => f.field === "print_text")!.requiresArtworkFix,
    true,
  );
  assert.equal(
    result.analysis!.findings.find((f) => f.field === "ink_colors")!.requiresArtworkFix,
    true,
  );
});

import { hasObviousArtworkMismatch } from "../lib/artwork-rules.ts";

test("matching artwork and non-artwork fields are not forced to need a fix", () => {
  const sources = draft().sources;
  const text = fixture.findings.find((f) => f.field === "print_text")!;
  const ink = fixture.findings.find((f) => f.field === "ink_colors")!;
  const quantity = fixture.findings.find((f) => f.field === "quantity")!;

  assert.equal(hasObviousArtworkMismatch({
    ...text,
    suggestedValue: "EVENT 2026",
    evidence: [{ sourceId: "design-front", value: "EVENT 2026", quote: "2026" }],
  }, sources), false);

  assert.equal(hasObviousArtworkMismatch({
    ...ink,
    suggestedValue: "white, safety orange",
    evidence: [{ sourceId: "design-front", value: "white, orange", quote: "white and orange" }],
  }, sources), false);

  assert.equal(hasObviousArtworkMismatch({
    ...quantity,
    suggestedValue: "150",
    evidence: [{ sourceId: "design-front", value: "120", quote: "120" }],
  }, sources), false);
});