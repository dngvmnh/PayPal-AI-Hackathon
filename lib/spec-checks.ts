import type { AIAnalysis, AIFinding, Source } from "./types.ts";

// Plain arithmetic the model sometimes gets wrong, checked in code against the shop's brief, using the quantity and
// unit price the model settled on. These can raise a finding the model missed or reported too softly; they never
// clear one. Each finding quotes the brief line it rests on, or isn't raised.

const SIZE = /(?:^|[\s/,:(-])(?:XXS|XS|S|M|L|XL|XXL|[2-5]XL)\s*[:=x×-]?\s*(\d+)(?![\d.])/gi;
const STATED_TOTAL = /\btotal\b[^$\d]*\$?\s*(\d[\d,]*(?:\.\d+)?)/i;

const PRICE_FOR_RANGE = /\$\s*(\d+(?:\.\d+)?)[^$,;]*?\bfor\s+(\d+)\s*(?:-|–|to)\s*(\d+)/gi;
const PRICE_FOR_MINIMUM = /\$\s*(\d+(?:\.\d+)?)[^$,;]*?\bfor\s+(\d+)\s*(?:\+|or more)/gi;
const RANGE_FOR_PRICE = /\b(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:shirts?|pcs|pieces)?\s*[:=@]\s*\$\s*(\d+(?:\.\d+)?)/gi;
const MINIMUM_FOR_PRICE = /\b(\d+)\s*(?:\+|or more)\s*(?:shirts?|pcs|pieces)?\s*[:=@]\s*\$\s*(\d+(?:\.\d+)?)/gi;

/** The sum of a breakdown like "S 12 / M 20 / L 14", or null unless at least two sizes can be read. */
export function sizeTotal(text: string): number | null {
  const counts = [...text.matchAll(SIZE)].map((m) => Number(m[1]));
  return counts.length >= 2 ? counts.reduce((a, b) => a + b, 0) : null;
}

/** The amount in a line like "Total price: $480.00", or null if the line states no total. */
export function statedTotal(line: string): number | null {
  const match = line.match(STATED_TOTAL);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

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

/** The first brief line that passes the test, to quote as evidence. */
function findBriefLine(sources: Source[], test: (line: string) => boolean) {
  for (const source of sources) {
    if (source.kind !== "brief" || !source.text) continue;
    const line = source.text.split("\n").map((l) => l.trim()).find((l) => l && test(l));
    if (line) return { sourceId: source.id, quote: line };
  }
  return undefined;
}

export function codeCheckFindings(ai: AIAnalysis, sources: Source[]): AIFinding[] {
  const settled = (field: string) => ai.findings.some((f) => f.field === field && f.severity === "blocking");
  const quantity = ai.pricing.quantity;
  if (quantity == null) return [];
  const findings: AIFinding[] = [];

  const sizesLine = findBriefLine(sources, (l) => sizeTotal(l) != null);
  const sizes = sizesLine ? sizeTotal(sizesLine.quote)! : null;
  if (sizesLine && sizes !== quantity && !settled("size_breakdown")) {
    findings.push({
      field: "size_breakdown",
      severity: "blocking",
      requiresArtworkFix: false,
      title: `Sizes add up to ${sizes}, but the quantity is ${quantity}`,
      explanation: `Checked by code: the size breakdown totals ${sizes} shirts for an order of ${quantity}.`,
      evidence: [{ ...sizesLine, value: String(sizes) }],
      suggestedValue: null,
      customerQuestion: `Your sizes add up to ${sizes} shirts, but the order is for ${quantity}. Which sizes should we print?`,
    });
  }

  // A price list settles the unit price for this quantity, so the total below is checked against that price.
  let unitPrice = ai.pricing.unitPrice;
  const listLine = findBriefLine(sources, (l) => priceTiers(l).length >= 2);
  const listed = listLine && priceTiers(listLine.quote).find((t) => quantity >= t.min && quantity <= t.max)?.price;
  if (listLine && listed != null && unitPrice !== listed) {
    if (unitPrice != null && !settled("unit_price")) {
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

  const totalLine = findBriefLine(sources, (l) => statedTotal(l) != null);
  if (totalLine && unitPrice != null && !settled("total_price")) {
    const stated = statedTotal(totalLine.quote)!;
    const expected = Math.round(quantity * unitPrice * 100) / 100;
    if (stated !== expected) {
      findings.push({
        field: "total_price",
        severity: "blocking",
        requiresArtworkFix: false,
        title: `Total is ${stated.toFixed(2)}, but ${quantity} × ${unitPrice.toFixed(2)} = ${expected.toFixed(2)}`,
        explanation: "Checked by code: the stated total doesn't match quantity times the unit price.",
        evidence: [{ ...totalLine, value: String(stated) }],
        suggestedValue: expected.toFixed(2),
        customerQuestion: `The total should be ${expected.toFixed(2)} for ${quantity} shirts at ${unitPrice.toFixed(2)}. Is that right?`,
      });
    }
  }
  return findings;
}
