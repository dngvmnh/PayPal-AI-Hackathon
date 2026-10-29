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

export interface ArtworkVersion {
  version: number;
  /** Stored filename under .data/uploads/<orderId>/ */
  file: string;
  mimeType: string;
  sha256: string;
  uploadedAt: string;
  note?: string;
}

export interface Source {
  id: string;
  kind: SourceKind;
  /** Display name, e.g. "Order brief", "Email from Dana (Mar 3)", "front.png" */
  name: string;
  /** Text content for briefs and messages */
  text?: string;
  /** For design files: the current version's stored filename (mirrors the last entry of `versions`) */
  file?: string;
  mimeType?: string;
  /** For design files: every uploaded version, oldest first. The last one is current. */
  versions?: ArtworkVersion[];
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
field: z.enum([
  "quantity",
  "size_breakdown",
  "print_text",
  "garment_color",
  "ink_colors",
  "unit_price",
  "total_price",
]),requiresArtworkFix: z.boolean().optional().describe(
  "True only when this finding requires changing the artwork itself; false when artwork is merely supporting evidence.",
),
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
artworkReadings: z.array(z.object({
  sourceId: z.string(),
  textElements: z.array(z.string()),
  inkColors: z.array(z.string()),
})).optional(),

artworkClaims: z.array(z.object({
  findingId: z.string(),
  field: z.enum(["year", "date", "name", "url", "text_line", "ink_colors"]),
  expected: z.string(),
  observed: z.string().nullable(),
  matches: z.boolean(),
})).optional(),
  pricing: z.object({
    quantity: z.number().int().nullable(),
    unitPrice: z.number().nullable(),
    currency: z.string().describe("ISO 4217 code, e.g. USD"),
  }),
});
export type AIAnalysis = z.infer<typeof AIAnalysis>;

// ---------- Stored order ----------

export type FindingStatus =
  | "open"
  | "resolved" // merchant confirmed a spec value
  | "awaiting_artwork" // required artwork fields set, waiting for a verified corrected file
  | "resolved_by_artwork" // corrected artwork verified by a re-check (PLAN §2 point 2)
  | "waived" // real problem, accepted with a reason shown to the customer
  | "dismissed_ai_error"; // problem doesn't exist; reason logged, not shown to the customer

export type CheckGroup = "quantity_sizes" | "text_dates" | "colors" | "pricing";

export type RequiredArtworkField = "year" | "date" | "name" | "url" | "text_line" | "ink_colors";

export interface Dismissal {
  at: string;
  reason: string;
  /** ranAt of the analysis the dismissed finding came from */
  analysisRanAt: string;
  /** sha256 of each design source's current version at the time of dismissal */
  artworkHashes: Record<string, string>;
  checkedArtworkMyself: boolean;
}

export interface Finding extends AIFinding {
  id: string;
  status: FindingStatus;
  checkGroup?: CheckGroup;
  /** The artwork itself is wrong; only a verified corrected file or a dismissal clears it */
  requiresArtworkFix?: boolean;
  /** Set by evidence validation; false means at least one evidence item didn't check out */
evidenceStatus?: "verified" | "unverified" | "invalid";
  evidenceValid?: boolean;
  evidenceProblems?: string[];
  /** Value the merchant settled on (status "resolved") */
  resolvedValue?: string;
  /** Merchant typed the value for a finding with invalid evidence */
  acceptedDespiteInvalidEvidence?: boolean;
  /** What the corrected artwork must show (status "awaiting_artwork") */
  requiredFields?: { field: RequiredArtworkField; value: string }[];
requiredSourceFingerprints?: Record<string, string>;
  waiveReason?: string;
  dismissal?: Dismissal;
}

export interface ArtworkVerification {
  findingId: string;
  field: RequiredArtworkField;
  expected: string;
  observed: string | null;
  matches: boolean;
  codeCheck: "pass" | "fail";
  reason?: string;
}

export interface Analysis {
  ranAt: string;
  model: string;
  /** true when the canned demo analysis was used because no API key is configured */
  demo: boolean;
  /** A failed check keeps the order blocked until it is re-run */
  status: "succeeded" | "failed";
  error?: string;
  /** sha256 of each design source's version that this check actually read, by source id */
  artworkHashes: Record<string, string>;
sourceFingerprints?: Record<string, string>;
  /** Filled by the verified re-check (AI-5a) */
  artworkReadings?: { sourceId: string; sha256: string; textElements: string[]; inkColors: string[] }[];
  verifications?: ArtworkVerification[];
  summary: string;
  findings: Finding[];
}

export type OrderStatus =
  | "draft" // sources collected, not yet checked
  | "needs_review" // open issues, or the last check failed / is stale
  | "ready_for_approval" // gate passes; waiting for the customer
  | "approved" // customer approved this exact version (saved on the server)
  | "authorized" // PayPal authorization held; order locked
  | "captured" // funds captured; production started
  | "cancelled"; // authorization voided without reopening

export interface Approval {
  id: string;
  iteration: number;
  versionHash: string;
  spec: Partial<Record<SpecField, string>>;
  pricing: { quantity: number; unitPrice: number; currency: string };
  amount: number;
  artworkHashes: Record<string, string>;
  /** Exceptions shown to the customer before approving */
  waived: { findingId: string; title: string; reason: string }[];
  approvedAt: string;
  approvedBy: { name: string; userAgent?: string };
}

export interface PaymentEvent {
  at: string;
  /** PayPal webhook event id, or "api" for responses to our own calls */
  id: string;
  type: string;
  summary: string;
}

export interface PaymentIteration {
  iteration: number;
  approvalId: string;
  versionHash: string;
  paypalOrderId?: string;
  authorizationId?: string;
  captureId?: string;
  status: "created" | "authorized" | "captured" | "voided";
  events: PaymentEvent[];
}

export interface HistoryEntry {
  at: string;
  type: string;
  summary: string;
}

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
  status: OrderStatus;
  /** Payment iteration; increases by one each time an authorization is voided and the order reopened */
  iteration: number;
  /** The customer's current approval. Cleared as soon as the approved version changes. */
  approval?: Approval;
  /** Every approval ever given, including cancelled ones */
  approvals: Approval[];
  payments: PaymentIteration[];
  cancelled?: boolean;
  history: HistoryEntry[];
}
