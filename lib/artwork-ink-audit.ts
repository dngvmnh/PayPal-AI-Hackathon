import { compareArtworkInkColors, parseInkColors } from "./artwork-compare.ts";
import type { AIAnalysis, Evidence, Source } from "./types.ts";

/** Compare AI observations with a source-backed extracted ink specification.
 * This does not verify the pixels or infer manufacturing color codes.
 */
export function auditArtworkInks(analysis: AIAnalysis, sources: Source[]): AIAnalysis {
  const expected = analysis.proposedSpec.find(spec => spec.field === "ink_colors")?.value;
  if (!expected || !parseInkColors([expected])) return analysis;

  // Require a literal, labeled source statement agreeing with the extracted spec.
  // Unsupported wording remains the AI/merchant's responsibility, rather than being guessed.
  const evidence: Evidence[] = [];
  for (const source of sources) {
    if (source.kind === "design" || !source.text || sources.filter(s => s.id === source.id).length !== 1) continue;
    for (const match of source.text.matchAll(/\bink\s+colou?rs?\s*:\s*([^\r\n.;]+)/gi)) {
      if (compareArtworkInkColors(expected, [match[1].trim()]).codeCheck !== "pass") continue;
      evidence.push({sourceId: source.id, value: expected, quote: match[0]});
      break;
    }
  }
  if (!evidence.length) return analysis;

  const readings = analysis.artworkReadings ?? [];
  for (const reading of readings) {
    const designs = sources.filter(s => s.id === reading.sourceId && s.kind === "design");
    if (designs.length !== 1 || readings.filter(r => r.sourceId === reading.sourceId).length !== 1) continue;
    const observed = parseInkColors(reading.inkColors);
    if (!observed || compareArtworkInkColors(expected, reading.inkColors).codeCheck === "pass") continue;
    evidence.push({
      sourceId: reading.sourceId,
      value: observed.join(", "),
      quote: `AI image observation lists these print inks: ${observed.join(", ")}.`,
    });
  }
  if (!evidence.some(item => sources.some(s => s.id === item.sourceId && s.kind === "design"))) return analysis;

  const result = structuredClone(analysis);
  const existing = result.findings.find(f => f.field === "ink_colors");
  const explanation = `The AI artwork inventory differs from the source-backed extracted ink specification (${expected}). Review the cited order statement and artwork before printing; the image observation itself may be wrong.`;
  if (existing) {
    existing.requiresArtworkFix = true;
    existing.severity = "blocking";
    existing.explanation += ` ${explanation}`;
    existing.evidence = [...new Map([...existing.evidence, ...evidence].map(item => [item.sourceId, item])).values()];
  } else {
    result.findings.push({
      field: "ink_colors",
      requiresArtworkFix: true,
      severity: "blocking",
      title: "Artwork ink inventory differs from the order's specified inks",
      explanation,
      evidence,
      suggestedValue: expected,
      customerQuestion: `Please confirm the required ink colors (${expected}) and supply corrected artwork if these are the intended inks.`,
    });
  }
  result.summary = `AI flagged ${result.findings.length} potential issue(s) for review. Additional issues may remain; merchant and customer confirmation are required.`;
  return result;
}
