import { test } from "node:test";
import assert from "node:assert/strict";
import { processArtworkRecheck } from "../lib/artwork-recheck.ts";
import { currentArtworkHashes } from "../lib/gate.ts";
import { addArtworkVersion, applyAnalysis, resolveFinding } from "../lib/orders.ts";
import { runDiff } from "../lib/types.ts";
import { checked, fixture } from "./helpers.ts";

function preparedOrder() {
  let order = checked();
  const finding = order.analysis!.findings.find((f) => f.field === "print_text")!;

  finding.evidence = [{
    sourceId: "design-front",
    value: "2025",
    quote: "Artwork shows 2025",
  }];

  order = resolveFinding(order, finding.id, {
    type: "require_artwork",
    requiredFields: [{ field: "year", value: "2026" }],
  });

  order = addArtworkVersion(order, "design-front", {
    file: "v2.png",
    mimeType: "image/png",
    sha256: "hash-v2",
  });

  const freshAnalysis = structuredClone(fixture);
  freshAnalysis.findings = [];

  order = applyAnalysis(order, freshAnalysis, {
    model: "test",
    demo: false,
    artworkHashes: currentArtworkHashes(order),
  });

  return { order, findingId: finding.id };
}

function response(findingId: string) {
  return {
    artworkReadings: [{
      sourceId: "design-front",
      textElements: ["FUN RUN 2026"],
      inkColors: ["white"],
    }],
    artworkClaims: [{
      findingId,
      field: "year" as const,
      expected: "2026",
      observed: "2026",
      matches: true,
    }],
  };
}

test("a valid reading and claim clear the pending artwork finding", () => {
  const { order, findingId } = preparedOrder();
  const result = processArtworkRecheck(order, response(findingId));

  assert.equal(
    result.analysis!.findings.find((f) => f.id === findingId)!.status,
    "resolved_by_artwork",
  );
  assert.equal(result.analysis!.artworkReadings![0].sha256, "hash-v2");
  assert.equal(result.analysis!.verifications![0].codeCheck, "pass");
});

function demoOrder(savedRecheck?: boolean) {
  const { order, findingId } = preparedOrder();
  order.analysis!.demo = true;
  order.analysis!.savedRecheck = savedRecheck;
  return { order, findingId };
}

test("a saved re-check result clears the finding only when marked as matched to the file", () => {
  const saved = demoOrder(true);
  const cleared = processArtworkRecheck(saved.order, response(saved.findingId));
  assert.equal(cleared.analysis!.findings.find((f) => f.id === saved.findingId)!.status, "resolved_by_artwork");

  const plain = demoOrder();
  const blocked = processArtworkRecheck(plain.order, response(plain.findingId));
  assert.equal(blocked.analysis!.findings.find((f) => f.id === plain.findingId)!.status, "awaiting_artwork");
});

test("old and new years together leave the finding blocked", () => {
  const { order, findingId } = preparedOrder();
  const output = response(findingId);
  output.artworkReadings[0].textElements.push("OLD DESIGN 2025");

  const result = processArtworkRecheck(order, output);

  assert.equal(
    result.analysis!.findings.find((f) => f.id === findingId)!.status,
    "awaiting_artwork",
  );
  assert.equal(result.analysis!.verifications![0].codeCheck, "fail");
});

test("missing or duplicate readings leave the finding blocked", () => {
  for (const mode of ["missing", "duplicate"] as const) {
    const { order, findingId } = preparedOrder();
    const output = response(findingId);

    if (mode === "missing") output.artworkReadings = [];
    else output.artworkReadings.push(structuredClone(output.artworkReadings[0]));

    const result = processArtworkRecheck(order, output);

    assert.equal(
      result.analysis!.findings.find((f) => f.id === findingId)!.status,
      "awaiting_artwork",
    );
    assert.equal(result.analysis!.verifications![0].codeCheck, "fail");
  }
});

test("a stale artwork hash prevents clearing", () => {
  const { order, findingId } = preparedOrder();
  order.analysis!.artworkHashes["design-front"] = "hash-v1";

  const result = processArtworkRecheck(order, response(findingId));

  assert.equal(
    result.analysis!.findings.find((f) => f.id === findingId)!.status,
    "awaiting_artwork",
  );
  assert.match(result.analysis!.verifications![0].reason ?? "", /current artwork/i);
});

test("a blocking finding in the same group prevents clearing", () => {
  const { order, findingId } = preparedOrder();
  const pending = order.analysis!.findings.find((f) => f.id === findingId)!;

  order.analysis!.findings.push({
    ...structuredClone(pending),
    id: "new-text-problem",
    status: "open",
    severity: "blocking",
    checkGroup: "text_dates",
  });

  const result = processArtworkRecheck(order, response(findingId));

  assert.equal(
    result.analysis!.findings.find((f) => f.id === findingId)!.status,
    "awaiting_artwork",
  );
  assert.match(result.analysis!.verifications![0].reason ?? "", /blocking finding/i);
});
function recheckWith(findings: typeof fixture.findings) {
  const { order } = preparedOrder();
  const next = structuredClone(fixture);
  next.findings = findings;
  return applyAnalysis(order, next, { model: "test", demo: false, artworkHashes: currentArtworkHashes(order) });
}

test("a problem reported again on a re-check doesn't add a finding", () => {
  const before = preparedOrder().order.analysis!.findings.length;
  const result = recheckWith(structuredClone(fixture.findings));
  assert.equal(result.analysis!.findings.length, before);
  assert.deepEqual(result.analysis!.newFindingIds, []);
});

test("a decided finding keeps its decision and shows what the model said again", () => {
  const printText = fixture.findings.find((f) => f.field === "print_text")!;
  const result = recheckWith([{ ...printText, title: "Year still looks wrong" }]);
  const finding = result.analysis!.findings.find((f) => f.field === "print_text")!;
  assert.equal(finding.status, "awaiting_artwork");
  assert.deepEqual(finding.laterReports, ["Year still looks wrong"]);
});

test("an open finding takes the latest report, and never loses severity", () => {
  const quantity = fixture.findings.find((f) => f.field === "quantity")!;
  const result = recheckWith([{ ...quantity, severity: "warning", title: "Latest wording" }]);
  const finding = result.analysis!.findings.find((f) => f.field === "quantity")!;
  assert.equal(finding.title, "Latest wording");
  assert.equal(finding.severity, "blocking");
});

test("a problem on a new field is still added, and marked as new", () => {
  const { order } = preparedOrder();
  const withoutInk = structuredClone(order);
  withoutInk.analysis!.findings = withoutInk.analysis!.findings.filter((f) => f.field !== "ink_colors");
  const next = structuredClone(fixture);
  next.findings = fixture.findings.filter((f) => f.field === "ink_colors");
  const result = applyAnalysis(withoutInk, next, { model: "test", demo: false, artworkHashes: currentArtworkHashes(order) });
  const added = result.analysis!.findings.find((f) => f.field === "ink_colors")!;
  assert.deepEqual(result.analysis!.newFindingIds, [added.id]);
  const diff = runDiff(result.analysis!)!;
  assert.deepEqual(diff.new.map((f) => f.id), [added.id]);
  assert.ok(diff.stillOpen.length > 0);
});

test("the first check has no diff", () => {
  assert.equal(runDiff(checked().analysis!), null);
});
