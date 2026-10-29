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