import { test } from "node:test";
import assert from "node:assert/strict";
import { codeCheckFindings, priceTiers, sizeTotal, statedTotal } from "../lib/spec-checks.ts";
import { applyAnalysis, newOrder } from "../lib/orders.ts";
import type { AIAnalysis, Source } from "../lib/types.ts";

function brief(...lines: string[]): Source[] {
  return [{ id: "brief", kind: "brief", name: "Brief", text: lines.join("\n") }];
}

function analysis(findings: AIAnalysis["findings"] = []): AIAnalysis {
  return { summary: "s", proposedSpec: [], findings, pricing: { quantity: 48, unitPrice: 10, currency: "USD" } };
}

function modelFinding(field: string, severity: string) {
  return {
    field,
    severity,
    requiresArtworkFix: false,
    title: "from the model",
    explanation: "e",
    evidence: [],
    suggestedValue: null,
    customerQuestion: "q",
  } as unknown as AIAnalysis["findings"][number];
}

test("reads size breakdowns in common formats", () => {
  assert.equal(sizeTotal("S 12 / M 20 / L 14"), 46);
  assert.equal(sizeTotal("S:5, M:10, XL:5, 2XL:2"), 22);
  assert.equal(sizeTotal("All adult L"), null);
  assert.equal(sizeTotal("Print: front center, 11\" wide"), null);
  assert.equal(sizeTotal("Needed by: pickup Saturday May 9, 2026"), null);
});

test("reads stated totals, wherever they sit in the line", () => {
  assert.equal(statedTotal("- Total price: $480.00"), 480);
  assert.equal(statedTotal("- Price: $9.50 per shirt (2-color front) — total $1,140.00"), 1140);
  assert.equal(statedTotal("- Unit price: $9.00 per shirt"), null);
});

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

test("sizes that don't add up raise a blocking finding quoting the brief", () => {
  const sources = brief("- Sizes: S 12 / M 20 / L 14");
  const [finding] = codeCheckFindings(analysis(), sources);
  assert.equal(finding.field, "size_breakdown");
  assert.equal(finding.severity, "blocking");
  assert.equal(finding.evidence[0].quote, "- Sizes: S 12 / M 20 / L 14");
});

test("sizes that add up, or that have no counts, raise nothing", () => {
  assert.deepEqual(codeCheckFindings(analysis(), brief("- Sizes: S 18 / M 20 / L 10")), []);
  assert.deepEqual(codeCheckFindings(analysis(), brief("- Sizes: All adult L")), []);
});

test("a total that isn't quantity times unit price raises a finding, and a correct one doesn't", () => {
  const [finding] = codeCheckFindings(analysis(), brief("- Total price: $500.00"));
  assert.equal(finding.field, "total_price");
  assert.equal(finding.suggestedValue, "480.00");
  assert.deepEqual(codeCheckFindings(analysis(), brief("- Total price: $480.00")), []);
});

test("no stated total means nothing to check", () => {
  assert.deepEqual(codeCheckFindings(analysis(), brief("- Unit price: $9.00 per shirt")), []);
});

test("a unit price off the price list raises findings for the price and the total", () => {
  const sources = brief("- Price list: $12.00 per shirt for 12-49 shirts, $10.00 per shirt for 50 or more", "- Total: $480.00");
  const found = codeCheckFindings(analysis(), sources);
  assert.deepEqual(found.map((f) => f.field), ["unit_price", "total_price"]);
  assert.equal(found[0].suggestedValue, "12.00");
  assert.equal(found[1].suggestedValue, "576.00");
});

test("the price list's price for this quantity raises nothing", () => {
  const ai = analysis();
  ai.pricing.unitPrice = 12;
  const sources = brief("- Price list: $12.00 per shirt for 12-49 shirts, $10.00 per shirt for 50 or more", "- Total: $576.00");
  assert.deepEqual(codeCheckFindings(ai, sources), []);
});

test("a field the model already blocked on isn't reported twice", () => {
  const ai = analysis([modelFinding("size_breakdown", "blocking")]);
  assert.deepEqual(codeCheckFindings(ai, brief("- Sizes: S 12 / M 20 / L 14")), []);
});

test("a code finding replaces the model's softer finding on the same field", () => {
  const order = newOrder({
    id: "o1",
    title: "t",
    customerName: "c",
    customerEmail: "c@example.com",
    sources: brief("- Sizes: S 12 / M 20 / L 14"),
  });
  const applied = applyAnalysis(order, analysis([modelFinding("size_breakdown", "warning")]), {
    model: "m",
    demo: false,
    artworkHashes: {},
  });
  const findings = applied.analysis!.findings.filter((f) => f.field === "size_breakdown");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "blocking");
  assert.match(findings[0].title, /add up to 46/);
});
