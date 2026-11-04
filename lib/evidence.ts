import type { AIFinding, Source } from "./types.ts";

export type EvidenceStatus = "verified" | "unverified" | "invalid";

export interface EvidenceValidation {
  status: EvidenceStatus;
  problems: string[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function validateEvidence(
  finding: Pick<AIFinding, "evidence">,
  sources: Source[],
): EvidenceValidation {
  const problems: string[] = [];
  let hasInvalid = false;
  let hasUnverified = false;

  if (finding.evidence.length === 0) {
    return { status: "invalid", problems: ["No evidence was provided."] };
  }

  for (const item of finding.evidence) {
    const matchingSources = sources.filter((source) => source.id === item.sourceId);

    if (matchingSources.length !== 1) {
      hasInvalid = true;
      problems.push(`Source "${item.sourceId}" was not found or is ambiguous.`);
      continue;
    }

    const source = matchingSources[0];

    if (!normalizeWhitespace(item.quote)) {
      hasInvalid = true;
      problems.push(`Evidence for "${item.sourceId}" has an empty quote.`);
      continue;
    }

    if (source.kind === "design") {
      hasUnverified = true;
      problems.push(`Artwork evidence for "${item.sourceId}" needs visual verification.`);
      continue;
    }

    if (
      !source.text ||
      !normalizeWhitespace(source.text).includes(normalizeWhitespace(item.quote))
    ) {
      hasInvalid = true;
      problems.push(`Quote for "${item.sourceId}" was not found in the source.`);
    }
  }

  return {
    status: hasInvalid ? "invalid" : hasUnverified ? "unverified" : "verified",
    problems,
  };
}
/** Expand shortened quotes only when every fragment has one unambiguous location in the source. */
export function expandSourceQuote(quote: string, source: string): string | null {
  const text = normalizeWhitespace(source);
  const original = normalizeWhitespace(quote);
  if (text.includes(original)) return null;
  const parts = original.split(/\.\.\.|…/).map(p => p.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")).filter(Boolean);
  if (parts.length < 2 || parts.some(p => p.length < 8)) return null;
  let cursor = 0;
  let start = -1;
  for (const part of parts) {
    const at = text.indexOf(part);
    if (at < cursor || at < 0 || text.indexOf(part, at + 1) !== -1) return null;
    if (start < 0) start = at;
    cursor = at + part.length;
  }
  return text.slice(start, cursor);
}
