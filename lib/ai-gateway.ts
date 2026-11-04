import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AIAnalysis, AIFinding, type Source } from "./types.ts";

/** Request-specific output guide. Existing evidence validation remains authoritative. */
export function gatewayAnalysisSchema(sources: Pick<Source, "id" | "kind" | "text">[]) {
  if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error("Duplicate source IDs prevent a grounded AI check.");
  const variants = sources.flatMap(source => {
    const lines = [...new Set((source.text ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
    if (source.kind !== "design" && !lines.length) return [];
    return [z.object({
      sourceId: z.literal(source.id),
      value: z.string(),
      quote: source.kind === "design"
        ? z.string().describe("Visual observation from the actual image; not a verified text quotation")
        : z.enum(lines as [string, ...string[]]).describe("Copy one complete source-body line exactly. Headers and calculated values are not quotations."),
    })];
  });
  if (!variants.length) throw new Error("No usable evidence sources were supplied.");
  return AIAnalysis.extend({findings: z.array(AIFinding.extend({evidence: z.array(z.discriminatedUnion("sourceId", [variants[0]!, ...variants.slice(1)]))}))});
}

type GatewayBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export function gatewayContent(blocks: Anthropic.Beta.BetaContentBlockParam[]): GatewayBlock[] {
  return blocks.map((block) => {
    if (block.type === "text") return { type: "text", text: block.text };
    if (block.type === "image" && block.source.type === "base64") {
      if (!["image/png", "image/jpeg", "image/webp"].includes(block.source.media_type)) {
        throw new Error("The Astropods image integration currently accepts PNG, JPEG or WebP artwork. Convert other formats first.");
      }
      return {
        type: "image_url",
        image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
      };
    }
    // Never silently omit a document and then report a successful check.
    throw new Error("The Astropods image integration cannot check PDF or other document artwork yet. Upload PNG, JPEG or WebP instead.");
  });
}

export function parseGatewayAnalysis(raw: string): AIAnalysis {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("AI returned invalid JSON. The check did not succeed; try again.");
  }
  const result = AIAnalysis.safeParse(json);
  if (!result.success) {
    throw new Error("AI returned an analysis that does not match the required schema. The check did not succeed.");
  }
  const findings = result.data.findings.map((f) => f.field);
  const spec = result.data.proposedSpec.map((s) => s.field);
  if (new Set(findings).size !== findings.length || new Set(spec).size !== spec.length) {
    throw new Error("AI returned duplicate fields. The check did not succeed.");
  }
  // Model-generated summaries must never imply that unreported issues were verified.
  result.data.summary = result.data.findings.length
    ? `AI flagged ${result.data.findings.length} potential issue(s) for review. Additional issues may remain; merchant and customer confirmation are required.`
    : "AI reported no inconsistencies in the scoped checks. This is not a guarantee; review the sources and artwork before approval.";
  return result.data;
}

export async function analyzeWithGateway(
  content: Anthropic.Beta.BetaContentBlockParam[],
  systemPrompt: string,
  config: { url: string; key: string; model: string; sources?: Pick<Source, "id" | "kind" | "text">[] },
  request: typeof fetch = fetch,
): Promise<AIAnalysis> {
  const url = new URL(config.url);
  if (url.protocol !== "https:") throw new Error("ASTRO_GATEWAY_URL must use HTTPS.");
  if (!config.key || !config.model) throw new Error("Astropods AI configuration is incomplete.");
  const blocks = gatewayContent(content);
  const schema = z.toJSONSchema(config.sources ? gatewayAnalysisSchema(config.sources) : AIAnalysis);
  const started = Date.now();
  let response: Response;
  try {
    response = await request(`${config.url.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 6000,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\nReturn only one JSON object matching this JSON Schema. Do not use markdown. Evidence sourceId must be one of the provided sources. For text evidence, choose a complete verbatim body line permitted by the source-specific schema; do not combine a heading with a different fragment or quote source-name metadata. Put arithmetic in explanation, never invent a calculation source. Include artworkReadings for every artwork source. Return an empty findings array when there are no issues.\n${JSON.stringify(schema)}`,
          },
          { role: "user", content: blocks },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error("Could not reach the AI Gateway or the request timed out. The check did not succeed.");
  }
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403
      ? "The development key may have expired; reconnect Astropods."
      : response.status === 429 ? "Check remaining credits and rate limits." : "Try again later.";
    // Do not return provider bodies or headers, which might include sensitive values.
    throw new Error(`AI Gateway request failed (HTTP ${response.status}). ${hint}`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("AI Gateway returned an unreadable response. The check did not succeed.");
  }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason !== "stop" || choice?.message?.refusal || typeof choice?.message?.content !== "string") {
    throw new Error("AI output was refused, incomplete or missing. The check did not succeed.");
  }
  const analysis = parseGatewayAnalysis(choice.message.content);
  const readings = analysis.artworkReadings ?? [];
  const sourceIds = readings.map((r) => r.sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("AI returned ambiguous artwork readings. The check did not succeed.");
  const designIds = content.flatMap((block) => {
    if (block.type !== "text") return [];
    return [...block.text.matchAll(/<source id="([^"]+)" kind="design"/g)].map((m) => m[1]);
  });
  for (const id of designIds) {
    const reading = readings.find((r) => r.sourceId === id);
    if (!reading || ![...reading.textElements, ...reading.inkColors].some((v) => v.trim())) {
      throw new Error("AI did not provide a readable observation for every artwork file. The check did not succeed.");
    }
  }
  console.info(JSON.stringify({
    event: "ai.check", provider: "astropods", model: config.model,
    latencyMs: Date.now() - started,
    promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens,
  }));
  return analysis;
}
