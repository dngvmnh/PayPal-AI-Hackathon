import { hasObviousArtworkMismatch } from "./artwork-rules.ts";
import { validateEvidence } from "./evidence.ts";
import { randomUUID } from "node:crypto";
import { currentArtworkHashes, isLocked, paymentGate, versionHash, waivedExceptions, sha256 } from "./gate.ts";
import type {
  AIAnalysis,
  ArtworkVerification,
  ArtworkVersion,
  Finding,
  Order,
  OrderStatus,
  PaymentIteration,
  RequiredArtworkField,
  SpecField,
} from "./types.ts";

// Every transition takes an order and returns a new one; callers persist the result.
// They throw an Error with a user-facing message when the transition isn't allowed.

const REQUIRED_FIELDS: RequiredArtworkField[] = ["year", "date", "name", "url", "text_line", "ink_colors"];
const MIN_REASON = 10;
export function currentSourceFingerprints(
  order: Pick<Order, "sources">,
): Record<string, string> {
  return Object.fromEntries(
    order.sources.map((source) => [
      source.id,
      sha256(JSON.stringify({
        kind: source.kind,
        name: source.name,
        text: source.text ?? null,
        file: source.file ?? null,
        mimeType: source.mimeType ?? null,
        artworkHash: source.versions?.at(-1)?.sha256 ?? null,
      })),
    ]),
  );
}
const CHECK_GROUP_BY_FIELD: Record<
  AIAnalysis["findings"][number]["field"],
  NonNullable<Finding["checkGroup"]>
> = {
  quantity: "quantity_sizes",
  size_breakdown: "quantity_sizes",
  print_text: "text_dates",
  garment_color: "colors",
  ink_colors: "colors",
  unit_price: "pricing",
  total_price: "pricing",
};

export function newOrder(fields: Pick<Order, "id" | "title" | "customerName" | "customerEmail" | "sources"> & { isSample?: boolean }): Order {
  return finalize({
    ...fields,
    createdAt: new Date().toISOString(),
    spec: {},
    pricing: { quantity: null, unitPrice: null, currency: "USD" },
    status: "draft",
    iteration: 1,
    approvals: [],
    payments: [],
    history: [{ at: new Date().toISOString(), type: "created", summary: `Order created with ${fields.sources.length} sources` }],
  });
}

function log(order: Order, type: string, summary: string): void {
  order.history.push({ at: new Date().toISOString(), type, summary });
}

function assertEditable(order: Order): void {
  if (isLocked(order)) {
    throw new Error(
      order.status === "cancelled"
        ? "This order is cancelled."
        : "Payment is authorized, so the order is locked. Void the authorization and reopen to make changes.",
    );
  }
}

export function currentPayment(order: Order): PaymentIteration | undefined {
  return order.payments.find((p) => p.iteration === order.iteration);
}

// ---------- AI check ----------

/** Merge a fresh AI analysis into the order: proposed spec, pricing, and findings (all open). */
export function applyAnalysis(
  order: Order,
  ai: AIAnalysis,
  meta: { model: string; demo: boolean; artworkHashes: Record<string, string> },
): Order {
  assertEditable(order);
  const o = structuredClone(order);
  const previousAnalysis = o.analysis;
  const previousFindings = previousAnalysis?.findings ?? [];
  const fingerprints = currentSourceFingerprints(o);

  const spec: Order["spec"] = {};
  for (const { field, value } of ai.proposedSpec) {
    if (value) spec[field] = value;
  }

  o.spec = spec;
  o.pricing = { ...ai.pricing, currency: ai.pricing.currency || "USD" };

  const retained: Finding[] = [];

  for (const finding of previousFindings) {
    const validation = validateEvidence(finding, o.sources);

    if (finding.status === "awaiting_artwork") {
      finding.evidenceStatus = validation.status;
      finding.evidenceValid = validation.status === "verified";
      finding.evidenceProblems = validation.problems;
      retained.push(finding);
      continue;
    }

    const sourceIds = [...new Set(finding.evidence.map((item) => item.sourceId))];
    const sourcesUnchanged =
      sourceIds.length > 0 &&
      sourceIds.every((id) =>
        o.sources.filter((source) => source.id === id).length === 1 &&
        Boolean(previousAnalysis?.sourceFingerprints?.[id]) &&
        previousAnalysis?.sourceFingerprints?.[id] === fingerprints[id]
      );

    const resolvedValue = finding.resolvedValue?.trim();
    const proposedValue = spec[finding.field]?.trim();

    const specAgrees = !proposedValue || proposedValue === resolvedValue;
    const numberValue = resolvedValue
      ? parseNumber(resolvedValue, finding.field === "quantity")
      : null;

    const pricingAgrees =
      (finding.field !== "quantity" ||
        ai.pricing.quantity == null ||
        ai.pricing.quantity === numberValue) &&
      (finding.field !== "unit_price" ||
        ai.pricing.unitPrice == null ||
        ai.pricing.unitPrice === numberValue);

    const canRetainResolution =
      finding.status === "resolved" &&
      !finding.requiresArtworkFix &&
      Boolean(resolvedValue) &&
      sourcesUnchanged &&
      validation.status === finding.evidenceStatus &&
      specAgrees &&
      pricingAgrees;

    if (canRetainResolution && resolvedValue) {
      finding.evidenceProblems = validation.problems;
      setSpec(o, finding.field, resolvedValue);
      retained.push(finding);
      continue;
    }

    if (
      finding.status === "resolved_by_artwork" &&
      finding.requiresArtworkFix &&
      finding.requiredFields?.length
    ) {
      finding.status = "awaiting_artwork";
    } else {
      clearResolution(finding);
      finding.status = "open";
    }

    finding.evidenceStatus = validation.status;
    finding.evidenceValid = validation.status === "verified";
    finding.evidenceProblems = validation.problems;
    retained.push(finding);
  }

  const usedIds = new Set(previousFindings.map((finding) => finding.id));
  let nextId = 1;

  const newFindings: Finding[] = ai.findings.map((finding) => {
    while (usedIds.has(`f${nextId}`)) nextId++;
    const id = `f${nextId++}`;
    usedIds.add(id);

    const validation = validateEvidence(finding, o.sources);

    return {
      ...finding,
      id,
      status: "open",
requiresArtworkFix:
  finding.requiresArtworkFix === true || hasObviousArtworkMismatch(finding, o.sources),
      checkGroup: CHECK_GROUP_BY_FIELD[finding.field],
      evidenceStatus: validation.status,
      evidenceValid: validation.status === "verified",
      evidenceProblems: validation.problems,
    };
  });

  const findings = [...retained, ...newFindings];

  o.analysis = {
    ranAt: new Date().toISOString(),
    model: meta.model,
    demo: meta.demo,
    status: "succeeded",
    artworkHashes: meta.artworkHashes,
    sourceFingerprints: fingerprints,
    summary: ai.summary,
    findings,
  };

  log(o, "check", `AI check succeeded: ${findings.length} finding(s)`);
  return finalize(o);
}
/** A failed check keeps earlier findings visible but blocks approval until a re-run succeeds. */
export function recordFailedCheck(order: Order, error: string, artworkHashes: Record<string, string>): Order {
  assertEditable(order);
  const o = structuredClone(order);
  o.analysis = {
    ...(o.analysis ?? { model: "", demo: false, summary: "", findings: [] }),
    ranAt: new Date().toISOString(),
    status: "failed",
    error,
    artworkHashes,
  };
  log(o, "check_failed", `AI check failed: ${error}`);
  return finalize(o);
}

// ---------- Findings ----------

export type FindingAction =
  | { type: "confirm"; value: string; typedByHand?: boolean }
  | { type: "require_artwork"; requiredFields: { field: RequiredArtworkField; value: string }[]; specValue?: string }
  | { type: "waive"; reason: string }
  | { type: "dismiss"; reason: string; checkedArtworkMyself?: boolean }
  | { type: "reopen" };

export function resolveFinding(order: Order, findingId: string, action: FindingAction): Order {
  assertEditable(order);
  const o = structuredClone(order);
  const f = o.analysis?.findings.find((x) => x.id === findingId);
  if (!o.analysis || !f) throw new Error(`Unknown finding ${findingId}`);

  switch (action.type) {
    case "confirm": {
      const value = action.value?.trim();
      if (!value) throw new Error("Confirming a finding requires the value you settled on.");
      if (f.requiresArtworkFix) {
        throw new Error("This is an artwork error: upload a corrected file, or dismiss it as an AI error.");
      }
      if (f.evidenceValid === false && !action.typedByHand) {
        throw new Error("This finding's evidence didn't check out. Type the correct value yourself.");
      }
      clearResolution(f);
      f.status = "resolved";
      f.resolvedValue = value;
      f.acceptedDespiteInvalidEvidence = f.evidenceValid === false ? true : undefined;
      setSpec(o, f.field, value);
      log(o, "finding_resolved", `${f.title} → ${value}`);
      break;
    }
    case "require_artwork": {
      const fields = (action.requiredFields ?? []).map((r) => ({ field: r.field, value: r.value?.trim() }));
      if (!fields.length) throw new Error("Set at least one field the corrected artwork must show.");
      for (const r of fields) {
        if (!REQUIRED_FIELDS.includes(r.field)) throw new Error(`Unknown artwork field "${r.field}".`);
        if (!r.value) throw new Error(`The required value for "${r.field}" is empty.`);
      }
      clearResolution(f);
      f.status = "awaiting_artwork";
      f.requiresArtworkFix = true;
      f.requiredFields = fields;
const fingerprints = currentSourceFingerprints(o);
f.requiredSourceFingerprints = Object.fromEntries(
  o.sources
    .filter((source) => source.kind !== "design")
    .map((source) => [source.id, fingerprints[source.id]]),
);
      if (action.specValue?.trim()) setSpec(o, f.field, action.specValue.trim());
      log(o, "artwork_required", `${f.title}: artwork must show ${fields.map((r) => `${r.field}=${r.value}`).join(", ")}`);
      break;
    }
    case "waive": {
      if (f.requiresArtworkFix) throw new Error("Artwork errors can't be waived. Upload a corrected file instead.");
      const reason = action.reason?.trim() ?? "";
      if (reason.length < MIN_REASON) throw new Error(`Give a clear reason (at least ${MIN_REASON} characters); the customer will see it.`);
      clearResolution(f);
      f.status = "waived";
      f.waiveReason = reason;
      log(o, "finding_waived", `${f.title}: ${reason}`);
      break;
    }
    case "dismiss": {
      const reason = action.reason?.trim() ?? "";
      if (reason.length < MIN_REASON) throw new Error(`Explain why this is an AI error (at least ${MIN_REASON} characters).`);
const referencesArtwork = f.evidence.some((item) =>
  o.sources.some((source) => source.id === item.sourceId && source.kind === "design"),
);

if (
  (f.requiresArtworkFix || referencesArtwork) &&
  !action.checkedArtworkMyself
) {        throw new Error('Confirm "I checked the artwork file myself" to dismiss an artwork finding.');
      }
      clearResolution(f);
      f.status = "dismissed_ai_error";
      f.dismissal = {
        at: new Date().toISOString(),
        reason,
        analysisRanAt: o.analysis.ranAt,
        artworkHashes: currentArtworkHashes(o),
        checkedArtworkMyself: Boolean(action.checkedArtworkMyself),
      };
      log(o, "finding_dismissed", `${f.title} dismissed as AI error: ${reason}`);
      break;
    }
    case "reopen": {
      clearResolution(f);
      f.status = "open";
      log(o, "finding_reopened", f.title);
      break;
    }
    default:
      throw new Error("Unknown action.");
  }
  return finalize(o);
}

function clearResolution(f: Finding): void {
  delete f.resolvedValue;
  delete f.acceptedDespiteInvalidEvidence;
  delete f.requiredFields;
delete f.requiredSourceFingerprints;
  delete f.waiveReason;
  delete f.dismissal;
}

/**
 * Backstop for the verified re-check (AI-5a computes the verifications). An artwork finding clears only when
 * the latest check succeeded on the current artwork and every required field was confirmed by both the AI
 * and the code comparison (PLAN §2 point 2).
 */
export function markResolvedByArtwork(order: Order, findingId: string, verifications: ArtworkVerification[]): Order {
  assertEditable(order);
  const o = structuredClone(order);
  const f = o.analysis?.findings.find((x) => x.id === findingId);
  if (!o.analysis || !f) throw new Error(`Unknown finding ${findingId}`);
  if (f.status !== "awaiting_artwork" || !f.requiredFields?.length) {
    throw new Error("Set the required artwork fields before verifying corrected artwork.");
  }
  if (o.analysis.status !== "succeeded") throw new Error("The last check didn't succeed.");
const textSources = o.sources.filter((source) => source.kind !== "design");
const currentFingerprints = currentSourceFingerprints(o);
const requiredFingerprints = f.requiredSourceFingerprints;

const sourceChanged =
  !requiredFingerprints ||
  Object.keys(requiredFingerprints).length !== textSources.length ||
  textSources.some((source) =>
    !requiredFingerprints[source.id] ||
    requiredFingerprints[source.id] !== currentFingerprints[source.id]
  );

if (sourceChanged) {
  throw new Error("Order sources changed since the artwork requirements were set.");
}
if (o.analysis.demo) {
  throw new Error("A saved demo analysis cannot verify artwork.");
}

const designSources = o.sources.filter((source) => source.kind === "design");
const current = currentArtworkHashes(o);
const read = o.analysis.artworkHashes ?? {};

const missingArtworkHash =
  designSources.length === 0 ||
  designSources.some((source) => !current[source.id]);

const hashesDiffer =
  Object.keys(current).length !== Object.keys(read).length ||
  Object.keys(current).some((key) => current[key] !== read[key]);

if (missingArtworkHash || hashesDiffer) {
  throw new Error("The last check didn't read the current artwork version.");
}
const group = f.checkGroup ?? CHECK_GROUP_BY_FIELD[f.field];

const sameGroupBlocking = o.analysis.findings.some((other) =>
  other.id !== f.id &&
  other.severity === "blocking" &&
  other.status === "open" &&
  (other.checkGroup ?? CHECK_GROUP_BY_FIELD[other.field]) === group
);

if (sameGroupBlocking) {
  throw new Error("A blocking finding remains open in the same group.");
}
  for (const r of f.requiredFields) {
    const v = verifications.find((x) => x.findingId === f.id && x.field === r.field && x.expected === r.value);
    if (!v || !v.matches || v.codeCheck !== "pass") {
      throw new Error(`${r.field}: ${v?.reason ?? "not confirmed on the corrected artwork"}`);
    }
  }
  f.status = "resolved_by_artwork";
  log(o, "artwork_verified", `${f.title}: corrected artwork verified`);
  return finalize(o);
}

// ---------- Spec and artwork ----------

/** Update one spec field; quantity and unit price also drive the PayPal amount. */
export function setSpecField(order: Order, field: SpecField, value: string): Order {
  assertEditable(order);
  const o = structuredClone(order);
  setSpec(o, field, value);
  log(o, "spec_edited", `${field} → ${value}`);
  return finalize(o);
}

function setSpec(o: Order, field: SpecField, value: string): void {
  o.spec[field] = value;
  if (field === "quantity") o.pricing.quantity = parseNumber(value, true);
  if (field === "unit_price") o.pricing.unitPrice = parseNumber(value, false);
}

export function parseNumber(value: string, integer: boolean): number | null {
  const m = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return integer ? Math.round(n) : n;
}

/** Add a corrected artwork file as the new current version of a design source. */
export function addArtworkVersion(
  order: Order,
  sourceId: string,
  file: Omit<ArtworkVersion, "version" | "uploadedAt">,
): Order {
  assertEditable(order);
  const o = structuredClone(order);
  const source = o.sources.find((s) => s.id === sourceId);
  if (!source || source.kind !== "design") throw new Error(`Unknown design source ${sourceId}`);
  const versions = (source.versions ??= []);
  const version: ArtworkVersion = { ...file, version: versions.length + 1, uploadedAt: new Date().toISOString() };
  versions.push(version);
  source.file = version.file;
  source.mimeType = version.mimeType;
  log(o, "artwork_uploaded", `${source.name}: version ${version.version} uploaded${file.note ? ` (${file.note})` : ""}`);
  return finalize(o);
}

// ---------- Approval ----------

/** The customer approves the exact current version. Saved on the server; any later change cancels it. */
export function approve(order: Order, by: { name: string; userAgent?: string }): Order {
  assertEditable(order);
  const name = by.name?.trim();
  if (!name) throw new Error("Type your name to approve.");
  const gate = paymentGate(order);
  if (!gate.ok || gate.amount == null) throw new Error(`Not ready for approval: ${gate.reasons.join(" ")}`);
  const o = structuredClone(order);
  const hash = versionHash(o);
  if (o.approval?.versionHash === hash) return o;
  o.approval = {
    id: randomUUID().slice(0, 8),
    iteration: o.iteration,
    versionHash: hash,
    spec: { ...o.spec },
    pricing: { quantity: o.pricing.quantity!, unitPrice: o.pricing.unitPrice!, currency: o.pricing.currency },
    amount: gate.amount,
    artworkHashes: currentArtworkHashes(o),
    waived: waivedExceptions(o),
    approvedAt: new Date().toISOString(),
    approvedBy: { name, userAgent: by.userAgent },
  };
  o.approvals.push(o.approval);
  log(o, "approved", `Approved by ${name} (version ${hash.slice(0, 12)}, ${gate.amount.toFixed(2)} ${o.pricing.currency})`);
  return finalize(o);
}

/** The approval is valid only while the version it covers is unchanged. */
export function hasValidApproval(order: Order): boolean {
  return Boolean(order.approval && order.approval.iteration === order.iteration && order.approval.versionHash === versionHash(order));
}

/** PayPal custom_id: order, iteration and approved version, so each payment points to one approved version. */
export function paypalCustomId(order: Order): string {
  return `${order.id}:${order.iteration}:${order.approval!.versionHash.slice(0, 16)}`;
}

// ---------- Payment ----------

/** Checks to run before creating a PayPal order. */
export function assertCanStartPayment(order: Order): void {
  assertEditable(order);
  if (!hasValidApproval(order)) throw new Error("The customer must approve the current version first.");
  const existing = currentPayment(order);
  if (existing && existing.status !== "created") throw new Error("A payment for this iteration already exists.");
}

export function startPayment(order: Order, paypalOrderId: string): Order {
  assertCanStartPayment(order);
  const o = structuredClone(order);
  const existing = currentPayment(o);
  const payment: PaymentIteration = existing ?? {
    iteration: o.iteration,
    approvalId: o.approval!.id,
    versionHash: o.approval!.versionHash,
    status: "created",
    events: [],
  };
  payment.approvalId = o.approval!.id;
  payment.versionHash = o.approval!.versionHash;
  payment.paypalOrderId = paypalOrderId;
  payment.events.push(event("api", "ORDER.CREATED", `PayPal order ${paypalOrderId} created`));
  if (!existing) o.payments.push(payment);
  return finalize(o);
}

/** Checks to run before calling PayPal authorize: the approved version must still be the current one. */
export function assertCanAuthorize(order: Order): PaymentIteration {
  const payment = currentPayment(order);
  if (!payment?.paypalOrderId || payment.status !== "created") throw new Error("No PayPal order waiting for authorization.");
  if (!hasValidApproval(order) || payment.versionHash !== order.approval!.versionHash) {
    throw new Error("The order changed after the customer approved it. Approve the new version and pay again.");
  }
  return payment;
}

export function markAuthorized(order: Order, authorizationId: string, source: { eventId: string; type: string }): Order {
  const o = structuredClone(order);
  const p = o.payments.find((x) => x.authorizationId === authorizationId) ?? currentPayment(o);
  if (!p?.paypalOrderId) throw new Error("No payment to authorize.");
  if (p.events.some((e) => e.id === source.eventId && e.id !== "api")) return o;
  p.events.push(event(source.eventId, source.type, `Authorization ${authorizationId}`));
  if (p.status === "created") {
    p.status = "authorized";
    p.authorizationId = authorizationId;
    log(o, "authorized", `Payment authorized (${authorizationId}); order locked`);
  }
  return finalize(o);
}

export function markCaptured(
  order: Order,
  captureId: string,
  source: { eventId: string; type: string; authorizationId?: string },
): Order {
  const o = structuredClone(order);
  const p = (source.authorizationId && o.payments.find((x) => x.authorizationId === source.authorizationId)) || currentPayment(o);
  if (!p || (p.status !== "authorized" && p.status !== "captured")) throw new Error("No authorization to capture.");
  if (p.events.some((e) => e.id === source.eventId && e.id !== "api")) return o;
  p.events.push(event(source.eventId, source.type, `Capture ${captureId}`));
  if (p.status === "authorized") {
    p.status = "captured";
    p.captureId = captureId;
    log(o, "captured", `Payment captured (${captureId}); production started`);
  }
  return finalize(o);
}

/**
 * Authorize → Void. With reopen, a new iteration starts: the order is editable again and needs a new
 * approval and a new PayPal order. Without reopen, the order is cancelled.
 */
export function markVoided(
  order: Order,
  opts: { reopen: boolean; reason: string; eventId: string; type: string; authorizationId?: string },
): Order {
  const o = structuredClone(order);
  const target = (opts.authorizationId && o.payments.find((x) => x.authorizationId === opts.authorizationId)) || currentPayment(o);
  if (!target || (target.status !== "authorized" && target.status !== "voided")) throw new Error("No authorization to void.");
  if (target.events.some((e) => e.id === opts.eventId && e.id !== "api")) return o;
  target.events.push(event(opts.eventId, opts.type, opts.reason));
  if (target.status === "voided") return finalize(o);
  target.status = "voided";
  if (opts.reopen) {
    o.iteration += 1;
    o.approval = undefined;
    log(o, "voided_reopened", `Authorization voided and order reopened as iteration ${o.iteration}: ${opts.reason}`);
  } else {
    o.cancelled = true;
    log(o, "cancelled", `Authorization voided and order cancelled: ${opts.reason}`);
  }
  return finalize(o);
}

/** A denied capture leaves the authorization in place; the merchant can retry or void. */
export function markCaptureDenied(order: Order, source: { eventId: string; type: string; authorizationId?: string }): Order {
  const o = structuredClone(order);
  const p = (source.authorizationId && o.payments.find((x) => x.authorizationId === source.authorizationId)) || currentPayment(o);
  if (!p || p.events.some((e) => e.id === source.eventId)) return o;
  p.events.push(event(source.eventId, source.type, "Capture denied"));
  log(o, "capture_denied", "PayPal denied the capture; retry or void the authorization");
  return finalize(o);
}

function event(id: string, type: string, summary: string) {
  return { at: new Date().toISOString(), id, type, summary };
}

// ---------- Status ----------

/** Cancel a stale approval, then derive the order status (PLAN §4.3). */
function finalize(o: Order): Order {
  if (o.approval && !isPaymentHeld(o) && o.approval.versionHash !== versionHash(o)) {
    log(o, "approval_cancelled", "Approval cancelled because the spec, artwork, amount or exceptions changed");
    o.approval = undefined;
  }
  o.status = deriveStatus(o);
  return o;
}

function isPaymentHeld(o: Order): boolean {
  const p = currentPayment(o);
  return p?.status === "authorized" || p?.status === "captured";
}

export function deriveStatus(o: Order): OrderStatus {
  if (o.cancelled) return "cancelled";
  const p = currentPayment(o);
  if (p?.status === "captured") return "captured";
  if (p?.status === "authorized") return "authorized";
  if (!o.analysis) return "draft";
  if (!paymentGate(o).ok) return "needs_review";
  if (hasValidApproval(o)) return "approved";
  return "ready_for_approval";
}
