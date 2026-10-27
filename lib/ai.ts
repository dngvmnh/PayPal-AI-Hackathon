import { promises as fs } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AIAnalysis, SPEC_FIELDS, SPEC_LABELS, type Order } from "./types.ts";
import { uploadPath } from "./store.ts";

export const MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You are the pre-press desk of a custom print shop (apparel, signage, stickers, packaging).
Before the shop collects payment, you cross-check every source for an order: the shop's internal brief,
the customer's messages, and the design files the customer approved. Your job is to catch anything that
would make the printed result differ from what the customer expects or what they are being charged for.

Check every one of these spec fields across every source: ${SPEC_FIELDS.map((f) => `${f} (${SPEC_LABELS[f]})`).join(", ")}.

How to judge:
- Customer messages are chronological; a later message overrides an earlier one, but flag it if the brief
  or design was not updated to match.
- Read design files carefully: spelling, dates/years, phone numbers, URLs, colors actually used, number of
  ink colors, placement, and anything that would not print well (e.g. text too close to the edge, low contrast).
- Check arithmetic: quantity x unit price vs any quoted total; size breakdown sums vs quantity.
- Report at most one finding per field. If a field has several problems (e.g. wrong year and wrong URL in
  the printed text), combine them into one finding.
- suggestedValue is the complete corrected value for the whole field (it replaces the field in the final
  spec), never a fragment.
- Only report a finding when sources disagree, a value is missing that production needs, or the design has
  a defect. Do not report fields where all sources agree.
- severity "blocking" means printing or charging as-is would likely be wrong. Use it for wrong text, wrong
  quantity, wrong colors, price mismatches, and missing information production cannot proceed without.
- Each evidence item must reference a real source id and quote the source verbatim (text) or describe what
  is visible (design file).
- pricing reflects the latest agreed quantity and unit price; use null when it cannot be determined.`;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

async function buildContent(order: Order): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text: `Order: ${order.title}\nCustomer: ${order.customerName}\nSources follow, each introduced by a <source> header.`,
    },
  ];
  for (const s of order.sources) {
    const header = `<source id="${s.id}" kind="${s.kind}" name="${s.name}">`;
    if (s.text) {
      content.push({ type: "text", text: `${header}\n${s.text}\n</source>` });
      continue;
    }
    if (!s.file || !s.mimeType) continue;
    const data = (await fs.readFile(uploadPath(order.id, s.file))).toString("base64");
    content.push({ type: "text", text: header });
    if (IMAGE_TYPES.has(s.mimeType)) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: s.mimeType as "image/png", data },
      });
    } else if (s.mimeType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      });
    } else {
      content.push({ type: "text", text: `(unsupported file type ${s.mimeType}; not shown)` });
    }
  }
  content.push({
    type: "text",
    text: "Cross-check all sources and return the analysis.",
  });
  return content;
}

export async function analyzeOrder(order: Order): Promise<{ analysis: AIAnalysis; demo: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (order.isSample) return { analysis: await loadDemoAnalysis(), demo: true };
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local, or use the sample order to try demo mode.",
    );
  }

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "high", format: betaZodOutputFormat(AIAnalysis) },
    // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: await buildContent(order) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to analyze this order.");
  }
  if (!response.parsed_output) {
    throw new Error(`Could not parse the analysis (stop_reason: ${response.stop_reason}).`);
  }
  return { analysis: response.parsed_output, demo: false };
}

async function loadDemoAnalysis(): Promise<AIAnalysis> {
  const raw = await fs.readFile(
    path.join(process.cwd(), "samples", "riverside-5k", "demo-analysis.json"),
    "utf8",
  );
  return AIAnalysis.parse(JSON.parse(raw));
}
