import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson } from "../lib/ai.ts";
import { compareVerifications, scoreFindings, type ExpectedSample } from "../lib/eval.ts";
import type { ArtworkVerification, Finding } from "../lib/types.ts";

const issue = (id: string, field: string, checkGroup: string, requiresArtworkFix = false) => ({
  id,
  field,
  checkGroup,
  requiresArtworkFix,
  minSeverity: "blocking" as const,
  sources: [],
  correctValue: null,
});
const expected = (issues: ExpectedSample["issues"], injection?: ExpectedSample["injection"]): ExpectedSample => ({
  set: "tuning",
  issues,
  maxFalseBlocking: 0,
  artworkChecks: [],
  injection,
});
const finding = (id: string, field: string, checkGroup: string, severity: string, extra: object = {}) =>
  ({ id, field, checkGroup, severity, status: "open", title: id, evidence: [], evidenceStatus: "verified", ...extra }) as unknown as Finding;

test("a finding with the right field, group and severity matches its issue", () => {
  const score = scoreFindings(expected([issue("q", "quantity", "quantity_sizes")]), [finding("f1", "quantity", "quantity_sizes", "blocking")]);
  assert.equal(score.issues[0].found, true);
  assert.equal(score.issues[0].findingId, "f1");
  assert.deepEqual(score.falseBlocking, []);
});

test("too low a severity is a miss, and says what was reported", () => {
  const score = scoreFindings(expected([issue("q", "quantity", "quantity_sizes")]), [finding("f1", "quantity", "quantity_sizes", "warning")]);
  assert.equal(score.issues[0].found, false);
  assert.equal(score.issues[0].tooLow, "warning");
});

test("a second blocking finding on a matched field counts as false blocking", () => {
  const score = scoreFindings(expected([issue("q", "quantity", "quantity_sizes")]), [
    finding("f1", "quantity", "quantity_sizes", "blocking"),
    finding("f2", "quantity", "quantity_sizes", "blocking"),
  ]);
  assert.deepEqual(score.falseBlocking.map((f) => f.id), ["f2"]);
});

test("any blocking finding on a clean order is false blocking, but a warning isn't", () => {
  const score = scoreFindings(expected([]), [
    finding("f1", "ink_colors", "colors", "blocking"),
    finding("f2", "quantity", "quantity_sizes", "warning"),
  ]);
  assert.deepEqual(score.falseBlocking.map((f) => f.id), ["f1"]);
});

test("requiresArtworkFix is compared with the key", () => {
  const score = scoreFindings(expected([issue("t", "print_text", "text_dates", true)]), [
    finding("f1", "print_text", "text_dates", "blocking", { requiresArtworkFix: false }),
  ]);
  assert.equal(score.issues[0].artworkFixCorrect, false);
});

test("a missed issue that an injection must not suppress is reported", () => {
  const score = scoreFindings(
    expected([issue("q", "quantity", "quantity_sizes")], { sourceId: "msg-1", mustStillReport: ["q"] }),
    [],
  );
  assert.deepEqual(score.injectionMissed, ["q"]);
});

test("invalid evidence is counted, unverified artwork evidence isn't", () => {
  const score = scoreFindings(expected([]), [
    finding("f1", "ink_colors", "colors", "info", { evidenceStatus: "invalid" }),
    finding("f2", "print_text", "text_dates", "info", { evidenceStatus: "unverified" }),
  ]);
  assert.deepEqual(score.invalidEvidence.map((f) => f.id), ["f1"]);
});

const verification = (field: string, matches: boolean, codeCheck: "pass" | "fail") =>
  ({ findingId: "f1", field, expected: "x", observed: "x", matches, codeCheck }) as ArtworkVerification;

test("a re-check field passes only when the AI and the code comparison both agree", () => {
  const checks = compareVerifications("t", 2, { year: "pass", url: "pass" }, [
    verification("year", true, "pass"),
    verification("url", true, "fail"),
  ]);
  assert.deepEqual(checks.map((c) => [c.field, c.actual, c.ok]), [["year", "pass", true], ["url", "fail", false]]);
});

test("a field expected to fail is correct when it fails, including when it was never checked", () => {
  const checks = compareVerifications("t", 2, { year: "fail" }, []);
  assert.equal(checks[0].actual, "fail");
  assert.equal(checks[0].ok, true);
});

test("fields the model leaves out instead of null don't fail the check", () => {
  const parsed = parseModelJson(`\`\`\`json
${JSON.stringify({
    summary: "s",
    proposedSpec: [{ field: "print_location", confidence: "low" }],
    findings: [{
      field: "quantity",
      severity: "blocking",
      title: "t",
      explanation: "e",
      evidence: [],
      customerQuestion: "q",
    }],
    pricing: { currency: "USD" },
  })}
\`\`\``);
  assert.equal(parsed.proposedSpec[0].value, null);
  assert.equal(parsed.findings[0].suggestedValue, null);
  assert.equal(parsed.pricing.quantity, null);
});

test("evidence without a value still parses, labelled with its quote", () => {
  const parsed = parseModelJson(JSON.stringify({
    summary: "s",
    proposedSpec: [],
    findings: [{
      field: "quantity",
      severity: "blocking",
      title: "t",
      explanation: "e",
      evidence: [{ sourceId: "brief", quote: "Quantity: 60" }],
      customerQuestion: "q",
    }],
    pricing: { currency: "USD" },
  }));
  assert.equal(parsed.findings[0].evidence[0].value, "Quantity: 60");
});

test("an artwork claim about a field that can't be required is dropped, not fatal", () => {
  const parsed = parseModelJson(JSON.stringify({
    summary: "s",
    proposedSpec: [],
    findings: [],
    artworkClaims: [
      { findingId: "f1", field: "garment_color", expected: "navy", observed: "navy", matches: true },
      { findingId: "f1", field: "year", expected: "2026", matches: false },
    ],
    pricing: { currency: "USD" },
  }));
  assert.deepEqual(parsed.artworkClaims?.map((claim) => claim.field), ["year"]);
  assert.equal(parsed.artworkClaims?.[0].observed, null);
});

test("a reply missing a required field still fails", () => {
  assert.throws(() => parseModelJson(JSON.stringify({ summary: "s", findings: [] })));
});
