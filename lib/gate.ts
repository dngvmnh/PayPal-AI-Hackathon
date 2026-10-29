import { createHash } from "node:crypto";
import { SPEC_FIELDS, type Order } from "./types.ts";

export interface GateResult {
  ok: boolean;
  reasons: string[];
  amount: number | null;
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** sha256 of the current version of every design source, by source id. */
export function currentArtworkHashes(order: Pick<Order, "sources">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of order.sources) {
    const current = s.versions?.at(-1);
    if (s.kind === "design" && current) out[s.id] = current.sha256;
  }
  return out;
}

function sameHashes(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

const HANDLED = new Set(["resolved", "resolved_by_artwork", "waived", "dismissed_ai_error"]);

/**
 * Approval and payment are allowed only when the order is internally consistent (PLAN §4.2).
 * This is the core rule of the product, so it lives in one pure function.
 */
export function paymentGate(order: Order): GateResult {
  const reasons: string[] = [];
  const analysis = order.analysis;
  if (!analysis) {
    reasons.push("AI consistency check has not been run.");
  } else {
    if (analysis.status === "failed") {
      reasons.push(`The last AI check failed${analysis.error ? `: ${analysis.error}` : ""}. Re-run it.`);
    }
    if (!sameHashes(analysis.artworkHashes ?? {}, currentArtworkHashes(order))) {
      reasons.push("Artwork changed since the last AI check. Re-run it.");
    }
const findings = analysis.findings;
const invalidEvidence = findings.filter((finding) => {
  if (finding.evidenceStatus !== "invalid") return false;

  // A spec finding can be accepted after the merchant types the value.
  if (finding.status === "resolved") {
    return !finding.acceptedDespiteInvalidEvidence;
  }

  // A real, non-artwork issue can be waived with a reason.
  if (finding.status === "waived") {
    return Boolean(finding.requiresArtworkFix) || !finding.waiveReason?.trim();
  }

  // An AI error can be dismissed with a reason.
  if (finding.status === "dismissed_ai_error") {
    const dismissal = finding.dismissal;
    if (!dismissal?.reason.trim()) return true;

    const referencedDesignIds = finding.evidence
      .map((item) => item.sourceId)
      .filter((id) =>
        order.sources.some((source) => source.id === id && source.kind === "design"),
      );

    const needsArtworkCheck =
      Boolean(finding.requiresArtworkFix) || referencedDesignIds.length > 0;

    if (!needsArtworkCheck) return false;

    const currentHashes = currentArtworkHashes(order);
    const hashesAvailable =
      referencedDesignIds.length > 0 &&
      referencedDesignIds.every((id) => Boolean(currentHashes[id]));

    return !(
      dismissal.checkedArtworkMyself &&
      hashesAvailable &&
      sameHashes(dismissal.artworkHashes, currentHashes)
    );
  }

  return true;
});

if (invalidEvidence.length) {
  reasons.push(
    `${invalidEvidence.length} finding(s) have invalid evidence that still needs review.`,
  );
}
const unverifiedEvidence = findings.filter((finding) => {
  if (finding.evidenceStatus !== "unverified") return false;
  if (finding.status === "resolved_by_artwork") return false;

  const dismissal = finding.dismissal;
  if (
    finding.status !== "dismissed_ai_error" ||
    !dismissal?.checkedArtworkMyself ||
    !dismissal.reason.trim()
  ) {
    return true;
  }

  const currentHashes = currentArtworkHashes(order);
  const referencedDesignIds = finding.evidence
    .map((item) => item.sourceId)
    .filter((id) =>
      order.sources.some((source) => source.id === id && source.kind === "design"),
    );

  const hasReferencedArtwork = referencedDesignIds.length > 0;
  const hasAllReferencedHashes = referencedDesignIds.every(
    (id) => Boolean(currentHashes[id]),
  );

  return !(
    hasReferencedArtwork &&
    hasAllReferencedHashes &&
    sameHashes(dismissal.artworkHashes, currentHashes)
  );
});

if (unverifiedEvidence.length) {
  reasons.push(
    `${unverifiedEvidence.length} finding(s) have evidence awaiting visual verification.`,
  );
}
    const unhandled = findings.filter((f) => f.severity !== "info" && !HANDLED.has(f.status));
    if (unhandled.length) reasons.push(`${unhandled.length} issue(s) still open or awaiting corrected artwork.`);

    const artworkBypassed = findings.filter(
      (f) => f.requiresArtworkFix && (f.status === "resolved" || f.status === "waived"),
    );
    if (artworkBypassed.length) {
      reasons.push(`${artworkBypassed.length} artwork issue(s) need a verified corrected file or a dismissal.`);
    }
    const unverifiedAccepted = findings.filter(
      (f) => f.evidenceValid === false && f.status === "resolved" && !f.acceptedDespiteInvalidEvidence,
    );
    if (unverifiedAccepted.length) {
      reasons.push(`${unverifiedAccepted.length} finding(s) with unverified evidence need the value typed by hand.`);
    }
    const missingReason = findings.filter(
      (f) =>
        (f.status === "waived" && !f.waiveReason?.trim()) ||
        (f.status === "dismissed_ai_error" && !f.dismissal?.reason.trim()),
    );
    if (missingReason.length) reasons.push(`${missingReason.length} waived/dismissed finding(s) have no reason.`);
  }

  const { quantity, unitPrice } = order.pricing;
  if (!quantity || quantity <= 0) reasons.push("Quantity is not set.");
  if (unitPrice == null || unitPrice <= 0) reasons.push("Unit price is not set.");
  const amount = quantity && unitPrice ? round2(quantity * unitPrice) : null;
  return { ok: reasons.length === 0, reasons, amount };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Exceptions the customer must see before approving. */
export function waivedExceptions(order: Order) {
  return (order.analysis?.findings ?? [])
    .filter((f) => f.status === "waived")
    .map((f) => ({ findingId: f.id, title: f.title, reason: f.waiveReason ?? "" }));
}

/**
 * Hash of exactly what the customer approves: spec, pricing, artwork file hashes and the waived exceptions.
 * Any change to one of them changes the hash and cancels the approval.
 */
export function versionHash(order: Order): string {
  const artwork = currentArtworkHashes(order);
  const canonical = JSON.stringify({
    spec: SPEC_FIELDS.map((f) => [f, order.spec[f] ?? null]),
    pricing: [order.pricing.quantity, order.pricing.unitPrice, order.pricing.currency],
    artwork: Object.keys(artwork)
      .sort()
      .map((k) => [k, artwork[k]]),
    waived: waivedExceptions(order).map((w) => [w.findingId, w.reason]),
  });
  return sha256(canonical);
}

/** The order can't be edited while an authorization is held, after capture, or once cancelled. */
export function isLocked(order: Order): boolean {
  return order.status === "authorized" || order.status === "captured" || order.status === "cancelled";
}
