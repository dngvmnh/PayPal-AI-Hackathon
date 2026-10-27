import { z } from "zod";

/** The spec fields every source is checked against. Order matters: it is the display order. */
export const SPEC_FIELDS = [
  "product",
  "quantity",
  "size_breakdown",
  "garment_color",
  "ink_colors",
  "print_text",
  "print_location",
  "print_dimensions",
  "due_date",
  "unit_price",
  "total_price",
  "shipping",
] as const;
export const SpecField = z.enum(SPEC_FIELDS);
export type SpecField = z.infer<typeof SpecField>;

export const SPEC_LABELS: Record<SpecField, string> = {
  product: "Product",
  quantity: "Quantity",
  size_breakdown: "Size breakdown",
  garment_color: "Garment / stock color",
  ink_colors: "Ink colors",
  print_text: "Printed text",
  print_location: "Print location",
  print_dimensions: "Print dimensions",
  due_date: "Due / pickup date",
  unit_price: "Unit price",
  total_price: "Total price",
  shipping: "Shipping / pickup",
};

export type SourceKind = "brief" | "message" | "design";

export interface Source {
  id: string;
  kind: SourceKind;
  /** Display name, e.g. "Order brief", "Email from Dana (Mar 3)", "front.png" */
  name: string;
  /** Text content for briefs and messages */
  text?: string;
  /** For design files: stored filename under .data/uploads/<orderId>/ */
  file?: string;
  mimeType?: string;
}

// ---------- AI output (structured) ----------

export const Evidence = z.object({
  sourceId: z.string().describe("id of the source this evidence comes from"),
  value: z.string().describe("the value this source states or shows for the field"),
  quote: z
    .string()
    .describe("verbatim quote for text sources, or a short visual observation for design files"),
});
export type Evidence = z.infer<typeof Evidence>;

export const AIFinding = z.object({
  field: SpecField,
  severity: z
    .enum(["blocking", "warning", "info"])
    .describe(
      "blocking = would produce a wrong or unpayable order; warning = likely problem worth confirming; info = minor note",
    ),
  title: z.string().describe("one-line summary, e.g. 'Year on design (2025) differs from brief (2026)'"),
  explanation: z.string(),
  evidence: z.array(Evidence).describe("one entry per source that speaks to this field"),
  suggestedValue: z
    .string()
    .nullable()
    .describe(
      "complete corrected value for the whole field (replaces it in the final spec), or null if it cannot be inferred",
    ),
  customerQuestion: z
    .string()
    .describe("a short, friendly question the merchant can send the customer to settle it"),
});
export type AIFinding = z.infer<typeof AIFinding>;

export const SpecValue = z.object({
  field: SpecField,
  value: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const AIAnalysis = z.object({
  summary: z.string().describe("2-3 sentence plain-language overview for the merchant"),
  proposedSpec: z
    .array(SpecValue)
    .describe("best current understanding of each spec field, latest customer intent wins"),
  findings: z.array(AIFinding),
  pricing: z.object({
    quantity: z.number().int().nullable(),
    unitPrice: z.number().nullable(),
    currency: z.string().describe("ISO 4217 code, e.g. USD"),
  }),
});
export type AIAnalysis = z.infer<typeof AIAnalysis>;

// ---------- Stored order ----------

export type FindingStatus = "open" | "resolved" | "waived";

export interface Finding extends AIFinding {
  id: string;
  status: FindingStatus;
  /** Value the merchant settled on */
  resolvedValue?: string;
  resolutionNote?: string;
}

export interface Analysis {
  ranAt: string;
  model: string;
  /** true when the canned demo analysis was used because no API key is configured */
  demo: boolean;
  summary: string;
  findings: Finding[];
}

export type OrderStatus =
  | "draft" // sources collected, not yet checked
  | "needs_review" // AI found open issues
  | "ready_for_proof" // all blocking issues settled
  | "proof_sent" // customer link shared
  | "authorized" // customer approved proof + PayPal authorization
  | "captured"; // merchant captured funds (production started)

export interface Order {
  id: string;
  createdAt: string;
  title: string;
  customerName: string;
  customerEmail: string;
  /** Seeded from samples/; lets demo mode use the canned analysis without an API key */
  isSample?: boolean;
  sources: Source[];
  analysis?: Analysis;
  /** Final spec after AI proposal + merchant resolutions */
  spec: Partial<Record<SpecField, string>>;
  pricing: { quantity: number | null; unitPrice: number | null; currency: string };
  /** Hash of spec+pricing the customer approved; sent to PayPal as custom_id */
  approvedSpecHash?: string;
  status: OrderStatus;
  paypal?: {
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    lastStatus?: string;
  };
}
