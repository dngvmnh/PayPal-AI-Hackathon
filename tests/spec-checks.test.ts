import { test } from "node:test";
import assert from "node:assert/strict";
import { codeCheckFindings, priceTiers, sizeTotal } from "../lib/spec-checks.ts";
import type { AIAnalysis, Source } from "../lib/types.ts";

const sources: Source[] = [
  { id: "brief", kind: "brief", name: "Brief", text: "- Sizes: S 12 / M 20 / L 14\n- Total price: $500.00" },
];

function analysis(sizes: string | null, total: string | null, findings: AIAnalysis["findings"] = []): AIAnalysis {
  return {
    summary: "s",
    proposedSpec: [
      { field: "size_breakdown", value: sizes, confidence: "high" },
      { field: "total_price", value: total, confidence: "high" },
    ],
    findings,
    pricing: { quantity: 48, unitPrice: 10, currency: "USD" },
  };
}

test("reads size breakdowns in common formats", () => {
  assert.equal(sizeTotal("S 12 / M 20 / L 14"), 46);
  assert.equal(sizeTotal("S:5, M:10, XL:5, 2XL:2"), 22);
  assert.equal(sizeTotal("All adult L"), null);
  assert.equal(sizeTotal("Front center, 11 wide"), null);
});

test("sizes that don't add up raise a blocking finding quoting the source", () => {
  const [finding] = codeCheckFindings(analysis("S 12 / M 20 / L 14", null), sources);
  assert.equal(finding.field, "size_breakdown");
  assert.equal(finding.severity, "blocking");
  assert.deepEqual(finding.evidence[0].sourceId, "brief");
  assert.ok(sources[0].text!.includes(finding.evidence[0].quote));
});

test("sizes that add up raise nothing", () => {
  assert.deepEqual(codeCheckFindings(analysis("S 18 / M 20 / L 10", null), sources), []);
});

test("a total that isn't quantity times unit price raises a finding", () => {
  const [finding] = codeCheckFindings(analysis(null, "$500.00"), sources);
  assert.equal(finding.field, "total_price");
  assert.equal(finding.suggestedValue, "480.00");
});

test("a correct total raises nothing, and no source line means no finding", () => {
  assert.deepEqual(codeCheckFindings(analysis(null, "$480.00"), sources), []);
  assert.deepEqual(codeCheckFindings(analysis(null, "$700.00"), sources), []);
});

const priceList: Source[] = [
  {
    id: "brief",
    kind: "brief",
    name: "Brief",
    text: "- Price list: $12.00 per shirt for 12-49 shirts, $10.00 per shirt for 50 or more\n- Total price: $480.00",
  },
];

test("reads price lists in common formats", () => {
  assert.deepEqual(priceTiers("$12.00 per shirt for 12-49 shirts, $10.00 per shirt for 50 or more"), [
    { price: 12, min: 12, max: 49 },
    { price: 10, min: 50, max: Infinity },
  ]);
  assert.deepEqual(priceTiers("12-49 shirts: $12, 50+ shirts: $10"), [
    { min: 12, max: 49, price: 12 },
    { min: 50, max: Infinity, price: 10 },
  ]);
  assert.deepEqual(priceTiers("That comes to $480 at $10 a shirt."), []);
});

test("a unit price off the price list raises findings for the price and the total", () => {
  const found = codeCheckFindings(analysis(null, "$480.00"), priceList);
  assert.deepEqual(found.map((f) => f.field), ["unit_price", "total_price"]);
  assert.equal(found[0].suggestedValue, "12.00");
  assert.equal(found[1].suggestedValue, "576.00");
});

test("the price list's price for this quantity raises nothing", () => {
  const ai = analysis(null, "$576.00");
  ai.pricing.unitPrice = 12;
  const sources: Source[] = [{ ...priceList[0], text: priceList[0].text!.replace("$480.00", "$576.00") }];
  assert.deepEqual(codeCheckFindings(ai, sources), []);
});

test("a field the model already reported isn't reported twice", () => {
  const existing = {
    field: "size_breakdown",
    severity: "blocking",
    title: "t",
    explanation: "e",
    evidence: [],
    suggestedValue: null,
    customerQuestion: "q",
  } as AIAnalysis["findings"][number];
  assert.deepEqual(codeCheckFindings(analysis("S 12 / M 20 / L 14", null, [existing]), sources), []);
});
