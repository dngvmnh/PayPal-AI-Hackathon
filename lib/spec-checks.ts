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

const PRICE_FOR_RANGE = /\$\s*(\d+(?:\.\d+)?)[^$,;]*?\bfor\s+(\d+)\s*(?:-|–|to)\s*(\d+)/gi;
const PRICE_FOR_MINIMUM = /\$\s*(\d+(?:\.\d+)?)[^$,;]*?\bfor\s+(\d+)\s*(?:\+|or more)/gi;
const RANGE_FOR_PRICE = /\b(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:shirts?|pcs|pieces)?\s*[:=@]\s*\$\s*(\d+(?:\.\d+)?)/gi;
const MINIMUM_FOR_PRICE = /\b(\d+)\s*(?:\+|or more)\s*(?:shirts?|pcs|pieces)?\s*[:=@]\s*\$\s*(\d+(?:\.\d+)?)/gi;

interface PriceTier {
  min: number;
  max: number;
  price: number;
}

/** The tiers of a price list like "$12 per shirt for 12-49 shirts, $10 per shirt for 50 or more". */
export function priceTiers(line: string): PriceTier[] {
  return [
    ...[...line.matchAll(PRICE_FOR_RANGE)].map((m) => ({ price: +m[1], min: +m[2], max: +m[3] })),
    ...[...line.matchAll(PRICE_FOR_MINIMUM)].map((m) => ({ price: +m[1], min: +m[2], max: Infinity })),
    ...[...line.matchAll(RANGE_FOR_PRICE)].map((m) => ({ min: +m[1], max: +m[2], price: +m[3] })),
    ...[...line.matchAll(MINIMUM_FOR_PRICE)].map((m) => ({ min: +m[1], max: Infinity, price: +m[2] })),
  ];
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

  // A price list settles the unit price for this quantity, so the total below is checked against that price.
  let unitPrice = ai.pricing.unitPrice;
  const listLine = findLine(sources, (l) => priceTiers(l).length >= 2);
  const listed = listLine && quantity != null
    ? priceTiers(listLine.quote).find((t) => quantity >= t.min && quantity <= t.max)?.price
    : undefined;
  if (listed != null && listLine && unitPrice !== listed) {
    if (!reported("unit_price") && unitPrice != null) {
      findings.push({
        field: "unit_price",
        severity: "blocking",
        requiresArtworkFix: false,
        title: `Unit price is ${unitPrice.toFixed(2)}, but the price list gives ${listed.toFixed(2)} for ${quantity} shirts`,
        explanation: "Checked by code: the unit price isn't the price list's price for this quantity.",
        evidence: [{ ...listLine, value: String(unitPrice) }],
        suggestedValue: listed.toFixed(2),
        customerQuestion: `For ${quantity} shirts the price list gives ${listed.toFixed(2)} per shirt. Can we go ahead at that price?`,
      });
    }
    unitPrice = listed;
  }

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
        explanation: "Checked by code: the stated total doesn't match quantity times the unit price.",
        evidence: [{ ...line, value: spec("total_price")! }],
        suggestedValue: expected.toFixed(2),
        customerQuestion: `The total should be ${expected.toFixed(2)} for ${quantity} shirts at ${unitPrice.toFixed(2)}. Is that right?`,
      });
    }
  }
  return findings;
}
