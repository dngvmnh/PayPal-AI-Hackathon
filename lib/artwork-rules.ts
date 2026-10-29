import type { AIFinding, Source } from "./types.ts";

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function different(a: string[], b: string[]): boolean {
  return a.length !== b.length || a.some((value, index) => value !== b[index]);
}

function years(value: string): string[] {
  return uniqueSorted(value.match(/\b\d{4}\b/g) ?? []);
}

function inkColors(value: string): string[] {
  // Do not infer a color set from negated or ambiguous descriptions.
  if (/\b(no|not|without|except|excluding)\b/i.test(value)) return [];

  const matches = value.toLowerCase().match(
    /\b(?:safety orange|white|black|red|orange|yellow|blue|green|purple|pink|brown|gold|silver|grey|gray|navy|cyan|magenta)\b/g,
  ) ?? [];

  return uniqueSorted(matches.map((color) =>
    color === "safety orange" ? "orange" : color === "grey" ? "gray" : color,
  ));
}

export function hasObviousArtworkMismatch(
  finding: AIFinding,
  sources: Source[],
): boolean {
  if (!finding.suggestedValue) return false;

  if (finding.field !== "print_text" && finding.field !== "ink_colors") {
    return false;
  }

  const extract = finding.field === "print_text" ? years : inkColors;
  const expected = extract(finding.suggestedValue);

  if (expected.length === 0) return false;

  return finding.evidence.some((item) => {
    const source = sources.find((candidate) => candidate.id === item.sourceId);
    if (source?.kind !== "design") return false;

    const observed = extract(item.value);
    return observed.length > 0 && different(expected, observed);
  });
}