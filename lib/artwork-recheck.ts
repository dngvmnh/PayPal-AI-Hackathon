import { buildArtworkVerifications } from "./artwork-compare.ts";
import { currentArtworkHashes } from "./gate.ts";
import { markResolvedByArtwork } from "./orders.ts";
import type { AIAnalysis, ArtworkVerification, Order } from "./types.ts";

type RecheckOutput = Pick<AIAnalysis, "artworkReadings" | "artworkClaims">;

/**
 * Process an AI re-check response after applyAnalysis().
 * Call only after the request sent and checked the current artwork bytes.
 */
export function processArtworkRecheck(order: Order, output: RecheckOutput): Order {
  let result = structuredClone(order);

  if (!result.analysis || result.analysis.status !== "succeeded" || result.analysis.demo) {
    return result;
  }

  const pending = result.analysis.findings.filter(
    (finding) => finding.status === "awaiting_artwork",
  );
  const currentHashes = currentArtworkHashes(result);
  const verifications: ArtworkVerification[] = [];
  const recordedReadings: NonNullable<Order["analysis"]>["artworkReadings"] = [];

  for (const finding of pending) {
    const required = finding.requiredFields ?? [];
    const designIds = [...new Set(
      finding.evidence
        .map((item) => item.sourceId)
        .filter((id) =>
          result.sources.some((source) => source.id === id && source.kind === "design"),
        ),
    )];

    // The MVP currently supports re-checking one referenced artwork per finding.
    // Ambiguous or missing sources remain blocked.
    const sourceId = designIds.length === 1 ? designIds[0] : undefined;
    const readings = (output.artworkReadings ?? []).filter(
      (reading) => reading.sourceId === sourceId,
    );
    const reading = readings.length === 1 ? readings[0] : undefined;

    const readable =
      reading?.textElements.some((text) => text.trim()) &&
      reading?.inkColors.some((color) => color.trim());

    if (!sourceId || !currentHashes[sourceId] || !reading || !readable) {
      for (const field of required) {
        verifications.push({
          findingId: finding.id,
          field: field.field,
          expected: field.value,
          observed: null,
          matches: false,
          codeCheck: "fail",
          reason: "Artwork source or readable AI output is missing or ambiguous.",
        });
      }
      continue;
    }

    recordedReadings.push({
      sourceId,
      sha256: currentHashes[sourceId],
      textElements: reading.textElements,
      inkColors: reading.inkColors,
    });

    const checks = buildArtworkVerifications(
      finding.id,
      required,
      reading,
      output.artworkClaims ?? [],
    );

    if (checks.length > 0 && checks.every((check) => check.matches && check.codeCheck === "pass")) {
      try {
        result = markResolvedByArtwork(result, finding.id, checks);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        for (const check of checks) check.reason = reason;
      }
    }

    verifications.push(...checks);
  }

  result.analysis!.artworkReadings = recordedReadings;
  result.analysis!.verifications = verifications;
  return result;
}