import type { AIAnalysis, AIFinding, Source } from "./types.ts";

// Plain arithmetic the model sometimes gets wrong, checked in code on the spec it extracted. These add findings the
// model missed; they never remove one. Each finding quotes the source line it rests on, or isn't raised.

const SIZE = /(?:^|[\s/,:(-])(?:XXS|XS|S|M|L|XL|XXL|[2-5]XL)\s*[:=x×-]?\s*(\d+)(?![\d.])/gi;

/** The sum of a breakdown like "S 12 / M 20 / L 14", or null unless at least two sizes can be read. */
export function sizeTotal(text: string): number | null {
  const counts = [...text.matchAll(SIZE)].map((m) => Number(m[1]));
  return counts.length >= 2 ? counts.reduce((a, b) => a + b, 0) : null;
}

function money(text: string | null | undefined): number | null {
  const match = text?.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** A line from the text sources that passes the test, to quote as evidence. */
function findLine(sources: Source[], test: (line: string) => boolean) {
  for (const source of sources) {
    if (source.kind === "design" || !source.text) continue;
    const line = source.text.split("\n").map((l) => l.trim()).find((l) => l && test(l));
    if (line) return { sourceId: source.id, quote: line };
  }
  return undefined;
}

export function codeCheckFindings(ai: AIAnalysis, sources: Source[]): AIFinding[] {
  const spec = (field: string) => ai.proposedSpec.find((s) => s.field === field)?.value;
  const reported = (field: string) => ai.findings.some((f) => f.field === field && f.severity !== "info");
  const quantity = ai.pricing.quantity;
  const findings: AIFinding[] = [];

  const sizes = spec("size_breakdown");
  const total = sizes ? sizeTotal(sizes) : null;
  if (quantity != null && total != null && total !== quantity && !reported("size_breakdown")) {
    const line = findLine(sources, (l) => sizeTotal(l) === total);
    if (line) {
      findings.push({
        field: "size_breakdown",
        severity: "blocking",
        requiresArtworkFix: false,
        title: `Sizes add up to ${total}, but the quantity is ${quantity}`,
        explanation: `Checked by code: the size breakdown totals ${total} shirts for an order of ${quantity}.`,
        evidence: [{ ...line, value: sizes! }],
        suggestedValue: null,
        customerQuestion: `Your sizes add up to ${total} shirts, but the order is for ${quantity}. Which sizes should we print?`,
      });
    }
  }

  const unitPrice = ai.pricing.unitPrice;
  const stated = money(spec("total_price"));
  if (quantity != null && unitPrice != null && stated != null && !reported("total_price")) {
    const expected = Math.round(quantity * unitPrice * 100) / 100;
    const line = findLine(sources, (l) => /total/i.test(l) && money(l) === stated);
    if (expected !== stated && line) {
      findings.push({
        field: "total_price",
        severity: "blocking",
        requiresArtworkFix: false,
        title: `Total is ${stated.toFixed(2)}, but ${quantity} × ${unitPrice.toFixed(2)} = ${expected.toFixed(2)}`,
        explanation: "Checked by code: the stated total doesn't match quantity times unit price.",
        evidence: [{ ...line, value: spec("total_price")! }],
        suggestedValue: expected.toFixed(2),
        customerQuestion: `The total should be ${expected.toFixed(2)} for ${quantity} shirts at ${unitPrice.toFixed(2)}. Is that right?`,
      });
    }
  }
  return findings;
}
